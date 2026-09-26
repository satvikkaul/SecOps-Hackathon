import { describe, expect, it } from 'vitest';
import { applyFix, buildPlan, prioritizeActions, simulateAction, stepsFor, timeframeFor } from './actions';
import { actionById, actions, questionById } from './data';
import { assess } from './scoring';
import type { Answers, Profile } from './types';

const profile: Profile = {
  sector: 'carrier',
  employees: '11-50',
  downtime: '4-24h',
  perishable: 'yes',
  concentration: 'no',
  payments: 'yes',
  sensitiveData: 'no',
  hasOT: 'no',
  emailProvider: 'google',
};

describe('actions data', () => {
  it('has 19 actions, each fixing known questions with 3 to 5 steps', () => {
    expect(actions).toHaveLength(19);
    for (const a of actions) {
      expect(a.questionIds.length).toBeGreaterThan(0);
      for (const id of a.questionIds) expect(questionById[id]).toBeDefined();
      expect(a.steps.length).toBeGreaterThanOrEqual(3);
      expect(a.steps.length).toBeLessThanOrEqual(5);
      for (const s of Object.values(a.stepsByProvider ?? {})) {
        expect(s!.length).toBeGreaterThanOrEqual(3);
        expect(s!.length).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('prioritizeActions', () => {
  it('computes riskReduction = before − after and priority = reduction ÷ effort', () => {
    const answers: Answers = { Q1: 'no', Q7: 'no' };
    const before = assess(profile, answers);
    const after = assess(profile, applyFix(answers, ['Q1']));
    const r = simulateAction(actionById.A1, profile, answers);
    expect(r.riskReduction).toBeCloseTo(before.totalRisk - after.totalRisk, 10);
    expect(r.priority).toBeCloseTo(r.riskReduction / 1, 10);
  });
  it('excludes actions whose questions are all already yes', () => {
    const ranked = prioritizeActions(profile, { Q1: 'yes' });
    expect(ranked.find((r) => r.action.id === 'A1')).toBeUndefined();
  });
  it('excludes actions whose only questions are hidden', () => {
    const ranked = prioritizeActions({ ...profile, hasOT: 'no' }, {});
    expect(ranked.find((r) => r.action.id === 'A13')).toBeUndefined();
  });
  it('is sorted by priority descending', () => {
    const ranked = prioritizeActions(profile, {});
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].priority).toBeGreaterThanOrEqual(ranked[i].priority);
  });
  it('uses provider-specific steps when available', () => {
    expect(stepsFor(actionById.A1, { emailProvider: 'google' })[0]).toContain('admin.google.com');
    expect(stepsFor(actionById.A1, { emailProvider: 'm365' })[0]).toContain('entra.microsoft.com');
    expect(stepsFor(actionById.A1, { emailProvider: 'other' })).toBe(actionById.A1.steps);
  });
});

describe('plan', () => {
  it('maps effort to 30/60/90 days', () => {
    expect(timeframeFor(1)).toBe(30);
    expect(timeframeFor(2)).toBe(30);
    expect(timeframeFor(3)).toBe(60);
    expect(timeframeFor(4)).toBe(90);
    expect(timeframeFor(5)).toBe(90);
  });
  it('puts top 5 first and groups the rest', () => {
    const ranked = prioritizeActions(profile, {});
    const plan = buildPlan(ranked);
    expect(plan.top).toHaveLength(5);
    expect(plan.days30.length + plan.days60.length + plan.days90.length).toBe(ranked.length - 5);
  });
});
