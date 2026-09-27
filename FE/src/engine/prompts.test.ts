import { describe, expect, it } from 'vitest';
import { prioritizeActions } from './actions';
import { cccsStatuses } from './controls';
import { demoPersona, questionById, questions, sections } from './data';
import { buildFlow } from './flow';
import {
  ladderAnswers,
  ladderSelection,
  promptComplete,
  promptQuestionIds,
  prompts,
  rowLabel,
  visiblePrompts,
  type LadderPrompt,
  type RowsPrompt,
} from './prompts';
import { assess, computeLikelihood, unsureQuestions } from './scoring';
import type { Answers, AnswerValue, Profile } from './types';

const VALID: AnswerValue[] = ['yes', 'partial', 'no', 'unsure', 'na'];
const rowsPrompts = prompts.filter((p): p is RowsPrompt => p.type === 'rows');
const ladders = prompts.filter((p): p is LadderPrompt => p.type === 'ladder');
const allRows = rowsPrompts.flatMap((p) => p.rows);

describe('coverage: every underlying question is asked exactly once', () => {
  it('covers every question exactly once', () => {
    const asked = prompts.flatMap(promptQuestionIds);
    expect(new Set(asked).size).toBe(asked.length);
    expect([...asked].sort()).toEqual(questions.map((q) => q.id).sort());
  });
  it('puts each question in a prompt of the same section', () => {
    for (const p of prompts) for (const id of promptQuestionIds(p)) expect(questionById[id].section, `${p.id}/${id}`).toBe(p.section);
  });
  it('only uses known sections, and every section has a prompt', () => {
    const ids = sections.map((s) => s.id);
    for (const p of prompts) expect(ids).toContain(p.section);
    for (const s of ids) expect(prompts.some((p) => p.section === s), s).toBe(true);
  });
  it('every question affects at least one risk, so no prompt is decorative', () => {
    for (const q of questions) {
      const affects = Object.keys(q.weights).length + Object.keys(q.impactReduction ?? {}).length;
      expect(affects, q.id).toBeGreaterThan(0);
    }
  });
});

describe('answer options', () => {
  it('every row offers Yes and No, uses valid values once each, and has non-empty labels', () => {
    for (const r of allRows) {
      const values = r.options.map((o) => o.value);
      expect(values, r.question).toContain('yes');
      expect(values, r.question).toContain('no');
      expect(new Set(values).size, r.question).toBe(values.length);
      for (const o of r.options) {
        expect(['yes', 'partial', 'no']).toContain(o.value);
        expect(o.label.trim().length).toBeGreaterThan(0);
      }
    }
  });
  it('offers "does not apply" only where a route can genuinely be absent', () => {
    expect(allRows.filter((r) => r.na).map((r) => r.question).sort()).toEqual(['Q17', 'Q2', 'Q21', 'Q28', 'Q29']);
    // Impact reducers must never be skippable: "no plan" is not "not applicable"
    for (const r of allRows) if (questionById[r.question].impactReduction) expect(r.na, r.question).toBeUndefined();
  });
  it('ladders set every one of their questions with valid values, and no two options are identical', () => {
    for (const l of ladders) {
      const keys = new Set<string>();
      for (const o of l.options) {
        expect(Object.keys(o.sets).sort()).toEqual([...l.questions].sort());
        for (const v of Object.values(o.sets)) expect(VALID).toContain(v);
        keys.add(JSON.stringify(o.sets));
      }
      expect(keys.size).toBe(l.options.length);
    }
  });
  it('ladder questions are never hidden by the profile (a ladder must set all of them)', () => {
    for (const l of ladders) for (const id of l.questions) expect(questionById[id].showIf, id).toBeUndefined();
  });
  it('backup ladder goes from least to most protected, and never claims a tested offline copy without regular backups', () => {
    const l = ladders.find((x) => x.questions.includes('Q14'))!;
    const score = (s: Record<string, AnswerValue>) => ({ yes: 1, partial: 0.5, no: 0 } as Record<string, number>)[s.Q14] + ({ yes: 1, partial: 0.5, no: 0 } as Record<string, number>)[s.Q15];
    const scores = l.options.map((o) => score(o.sets));
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
    for (const o of l.options) if (o.sets.Q15 !== 'no') expect(o.sets.Q14).toBe('yes');
  });
});

describe('visibility', () => {
  it('hides Q7 without weekly payments, and equipment rows without connected equipment', () => {
    const qs = (p: Profile) => visiblePrompts(p).flatMap(promptQuestionIds);
    expect(qs({ payments: 'no', hasOT: 'yes' })).not.toContain('Q7');
    expect(qs({ payments: 'yes', hasOT: 'no' })).not.toContain('Q18');
    expect(qs({ payments: 'yes', hasOT: 'no' })).not.toContain('Q19');
    expect(qs({ payments: 'yes', hasOT: 'unsure' })).toContain('Q18');
    // The equipment card still shows because routers and guest Wi-Fi apply to everyone
    expect(qs({ payments: 'yes', hasOT: 'no' })).toContain('Q20');
  });
  it('uses sector-specific wording', () => {
    const row = allRows.find((r) => r.question === 'Q2')!;
    expect(rowLabel(row, { sector: 'carrier' })).toMatch(/load boards/);
    expect(rowLabel(row, { sector: 'farm' })).toMatch(/co-op/);
    expect(rowLabel(row, { sector: 'processor' })).toBe(row.label);
  });
  it('mentions personal phones when staff use their own for work', () => {
    const row = allRows.find((r) => r.question === 'Q16')!;
    expect(rowLabel(row, { phones: 'both' })).toMatch(/people's own/);
    expect(rowLabel(row, { phones: 'company' })).toBe(row.label);
  });
  it('shows the carrier vetting row to brokers only', () => {
    const qs = (p: Profile) => visiblePrompts(p).flatMap(promptQuestionIds);
    expect(qs({ sector: 'broker', payments: 'yes' })).toContain('Q31');
    expect(qs({ sector: 'carrier', payments: 'yes' })).not.toContain('Q31');
  });
});

describe('the demo company can be answered with the new questionnaire', () => {
  const { profile, answers } = demoPersona;
  it('every persona answer is an available option', () => {
    for (const p of visiblePrompts(profile)) {
      if (p.type === 'ladder') {
        expect(ladderSelection(p, answers), p.id).toBeGreaterThanOrEqual(0);
      } else {
        for (const r of p.rows) {
          const a = answers[r.question]!;
          const offered = [...r.options.map((o) => o.value as string), 'unsure', ...(r.na ? ['na'] : [])];
          expect(offered, r.question).toContain(a);
        }
      }
      expect(promptComplete(p, answers), p.id).toBe(true);
    }
  });
  it('choosing the persona ladder option reproduces its answers exactly', () => {
    for (const l of ladders) {
      const i = ladderSelection(l, answers);
      const applied = ladderAnswers(l, i);
      for (const q of l.questions) expect(applied[q]).toBe(answers[q]);
    }
  });
});

describe('"does not apply" is scored as no exposure, and nothing else', () => {
  const profile: Profile = { sector: 'carrier', downtime: 'lt4h', perishable: 'yes', payments: 'yes', hasOT: 'yes', employees: '11-50' };
  const base: Answers = Object.fromEntries(questions.map((q) => [q.id, 'no']));
  const na: Answers = { ...base, Q17: 'na' };
  const yes: Answers = { ...base, Q17: 'yes' };

  it('counts like Yes for likelihood', () => {
    expect(computeLikelihood('RANSOM', profile, na).final).toBeCloseTo(computeLikelihood('RANSOM', profile, yes).final, 10);
    const f = computeLikelihood('RANSOM', profile, na).factors.find((x) => x.questionId === 'Q17')!;
    expect(f.notApplicable).toBe('answered');
  });
  it('produces no fix, no "worth checking" item, no flow gap, and no control evidence', () => {
    expect(prioritizeActions(profile, na).find((r) => r.action.id === 'A12')).toBeUndefined();
    expect(unsureQuestions(profile, na).map((q) => q.id)).not.toContain('Q17');
    expect(buildFlow(profile, na, assess(profile, na)).nodes.map((n) => n.id)).not.toContain('Q17');
    const bc9 = cccsStatuses(profile, na).find((c) => c.id === 'BC.9')!;
    expect(bc9.evidence.map((e) => e.questionId)).not.toContain('Q17');
    expect(bc9.reqsAssessed).not.toContain('BC.9.3');
  });
  it('questions hidden by the profile are treated the same as "does not apply"', () => {
    const noOT = { ...profile, hasOT: 'no' };
    const hidden = computeLikelihood('OT', noOT, base);
    const explicit = computeLikelihood('OT', { ...profile }, { ...base, Q18: 'na', Q19: 'na' });
    expect(hidden.final).toBeCloseTo(explicit.final, 10);
    expect(hidden.factors.find((f) => f.questionId === 'Q18')!.notApplicable).toBe('hidden');
  });
});
