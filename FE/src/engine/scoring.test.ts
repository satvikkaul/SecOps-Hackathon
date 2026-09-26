import { describe, expect, it } from 'vitest';
import {
  answerValue,
  assess,
  bandFor,
  computeImpact,
  computeLikelihood,
  isVisible,
  MIN_LIKELIHOOD,
  unsureQuestions,
} from './scoring';
import { questionById, questions, scenarios } from './data';
import type { Answers, Profile } from './types';

const baseProfile: Profile = {
  sector: 'broker',
  employees: '1-10',
  downtime: '1-3d',
  perishable: 'no',
  concentration: 'no',
  payments: 'no',
  sensitiveData: 'no',
  hasOT: 'no',
  emailProvider: 'other',
};

// Q7 (bank-change call-back) only applies with weekly payments; with it hidden, BEC would start lower.
const withPayments: Profile = { ...baseProfile, payments: 'yes' };

const allYes: Answers = Object.fromEntries(questions.map((q) => [q.id, 'yes']));

describe('data integrity', () => {
  it('has 7 scenarios and 25 questions', () => {
    expect(scenarios).toHaveLength(7);
    expect(questions).toHaveLength(25);
  });
  it('all weights are between 0 and 1 and reference known scenarios', () => {
    const ids = new Set<string>(scenarios.map((s) => s.id));
    for (const q of questions) {
      for (const [sid, w] of Object.entries(q.weights)) {
        expect(ids.has(sid)).toBe(true);
        expect(w).toBeGreaterThan(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('answerValue and bands', () => {
  it('maps answers to values', () => {
    expect(answerValue('yes')).toBe(1);
    expect(answerValue('partial')).toBe(0.5);
    expect(answerValue('no')).toBe(0);
    expect(answerValue('unsure')).toBe(0);
    expect(answerValue(undefined)).toBe(0);
  });
  it('bands risk correctly at boundaries', () => {
    expect(bandFor(3)).toBe('High');
    expect(bandFor(2.99)).toBe('Elevated');
    expect(bandFor(2)).toBe('Elevated');
    expect(bandFor(1.99)).toBe('Moderate');
    expect(bandFor(1)).toBe('Moderate');
    expect(bandFor(0.99)).toBe('Low');
  });
});

describe('showIf', () => {
  it('hides Q7 unless payments = yes', () => {
    expect(isVisible(questionById.Q7, { payments: 'no' })).toBe(false);
    expect(isVisible(questionById.Q7, { payments: 'yes' })).toBe(true);
  });
  it('treats hasOT "unsure" as yes', () => {
    expect(isVisible(questionById.Q18, { hasOT: 'unsure' })).toBe(true);
    expect(isVisible(questionById.Q18, { hasOT: 'no' })).toBe(false);
  });
});

describe('likelihood', () => {
  it('equals base when nothing is answered', () => {
    const l = computeLikelihood('BEC', withPayments, {});
    expect(l.base).toBe(0.9);
    expect(l.final).toBe(0.9);
    expect(l.factors).toHaveLength(0);
  });
  it('multiplies (1 - weight × value) for each answered question', () => {
    const l = computeLikelihood('BEC', withPayments, { Q1: 'yes', Q8: 'partial', Q9: 'no' });
    // 0.9 × (1 − 0.5) × (1 − 0.3 × 0.5) × 1
    expect(l.final).toBeCloseTo(0.9 * 0.5 * 0.85, 10);
    expect(l.factors.map((f) => f.questionId)).toEqual(['Q1', 'Q8', 'Q9']);
  });
  it('treats questions hidden by the profile as "does not apply" (no exposure through that route)', () => {
    // No weekly bank transfers → the bank-detail-change route (Q7) does not exist, whatever Q7's stored answer is
    const hidden = computeLikelihood('BEC', { ...baseProfile, payments: 'no' }, { Q7: 'no' });
    expect(hidden.final).toBeCloseTo(0.9 * 0.4, 10);
    expect(hidden.factors.find((f) => f.questionId === 'Q7')!.notApplicable).toBe('hidden');
    const shown = computeLikelihood('BEC', { ...baseProfile, payments: 'yes' }, { Q7: 'no' });
    expect(shown.final).toBe(0.9);
  });
  it('clamps to a 0.05 minimum', () => {
    const l = computeLikelihood('BEC', { ...baseProfile, payments: 'yes' }, allYes);
    expect(l.raw).toBeLessThan(MIN_LIKELIHOOD);
    expect(l.final).toBe(MIN_LIKELIHOOD);
    expect(l.clamped).toBe(true);
  });
});

describe('impact', () => {
  it('starts at 2 with no modifiers', () => {
    expect(computeImpact('RANSOM', baseProfile, {}).final).toBe(2);
  });
  it('applies downtime, perishable, and concentration modifiers', () => {
    const p = { ...baseProfile, downtime: 'lt4h', perishable: 'yes', concentration: 'yes' };
    const i = computeImpact('RANSOM', p, {});
    expect(i.beforeClamp).toBe(6);
    expect(i.clamped).toBe(5);
    expect(i.modifiers).toHaveLength(3);
  });
  it('clamps to a minimum of 1', () => {
    expect(computeImpact('DATALOSS', { ...baseProfile, downtime: 'gt3d' }, {}).final).toBe(1);
  });
  it('gives +2 to BEC and +1 to ATO for weekly payments', () => {
    const p = { ...baseProfile, payments: 'yes' };
    expect(computeImpact('BEC', p, {}).final).toBe(4);
    expect(computeImpact('ATO', p, {}).final).toBe(3);
  });
  it('gives +1 to SHARED and ATO for 51+ employees', () => {
    const p = { ...baseProfile, employees: '150+' };
    expect(computeImpact('SHARED', p, {}).final).toBe(3);
    expect(computeImpact('ATO', p, {}).final).toBe(3);
  });
  it('applies Q24 (15%) and Q25 (10%) reductions after clamping', () => {
    const p = { ...baseProfile, payments: 'yes' };
    expect(computeImpact('BEC', p, { Q24: 'yes', Q25: 'yes' }).final).toBeCloseTo(4 * 0.85 * 0.9, 10);
    expect(computeImpact('BEC', p, { Q24: 'partial' }).final).toBeCloseTo(4 * 0.925, 10);
    // Q25 does not touch OT
    expect(computeImpact('OT', p, { Q25: 'yes' }).final).toBe(2);
  });
});

describe('assess', () => {
  it('sorts scenarios by risk and takes posture from the highest single risk', () => {
    const a = assess(baseProfile, {});
    for (let i = 1; i < a.scenarios.length; i++) {
      expect(a.scenarios[i - 1].risk).toBeGreaterThanOrEqual(a.scenarios[i].risk);
    }
    expect(a.posture.score).toBe(a.scenarios[0].risk);
    expect(a.posture.band).toBe(a.scenarios[0].band);
  });
  it('everything yes gives a Low posture', () => {
    expect(assess({ ...baseProfile, payments: 'yes', hasOT: 'yes' }, allYes).posture.band).toBe('Low');
  });
  it('risk = likelihood × impact', () => {
    const a = assess(baseProfile, { Q1: 'partial' });
    for (const s of a.scenarios) expect(s.risk).toBeCloseTo(s.likelihood.final * s.impact.final, 10);
  });
  it('lists unsure questions, ignoring hidden ones', () => {
    const qs = unsureQuestions({ ...baseProfile, hasOT: 'no' }, { Q18: 'unsure', Q20: 'unsure' });
    expect(qs.map((q) => q.id)).toEqual(['Q20']);
  });
});
