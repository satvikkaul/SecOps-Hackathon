import { describe, expect, it } from 'vitest';
import { buildPlan, costPointsFor, essentialInfo, prioritizeActions, simulateAction } from './actions';
import { actionById, actions, demoPersona, ranking } from './data';
import type { Action, RankingConfig } from './types';

const { profile, answers } = demoPersona;

describe('ranking config', () => {
  it('has a cost-points entry for every cost label used by an action', () => {
    for (const a of actions) expect(() => costPointsFor(a.cost), `${a.id} "${a.cost}"`).not.toThrow();
  });
  it('rejects unknown cost labels instead of treating them as free', () => {
    expect(() => costPointsFor('Cheap')).toThrow(/Unknown cost label/);
  });
  it('defaults to the original effort-only formula', () => {
    expect(ranking.defaultMode).toBe('effort');
  });
});

describe('essential fixes', () => {
  it('are exactly the fixes that resolve an IG1 Data Recovery or Incident Response safeguard', () => {
    const essential = actions.filter((a) => essentialInfo(a)).map((a) => a.id);
    expect(essential).toEqual(['A11', 'A17']);
  });
  it('carry the safeguards and a plain-language reason', () => {
    expect(essentialInfo(actionById.A11)).toEqual({
      reason: ranking.essential.cisControls['11'],
      safeguards: ['11.2', '11.4'], // 11.5 is IG2, so it does not count
    });
    expect(essentialInfo(actionById.A17)!.safeguards).toEqual(['17.1', '17.2']);
  });
});

describe('priority formulas', () => {
  it('effort mode: reduction ÷ effort, ignoring cost', () => {
    const r = simulateAction(actionById.A5, profile, answers, undefined, undefined, 'effort');
    expect(r.priority).toBeCloseTo(r.riskReduction / 2, 10);
    expect(r.priority).toBe(r.priorities.effort);
  });
  it('cost mode: reduction ÷ (effort + weight × cost points)', () => {
    const r = simulateAction(actionById.A5, profile, answers, undefined, undefined, 'cost'); // "$" = 1 point
    expect(r.costPenalty).toBe(1);
    expect(r.priority).toBeCloseTo(r.riskReduction / (2 + 1), 10);
  });
  it('cost mode: essential fixes skip the cost penalty', () => {
    const r = simulateAction(actionById.A11, profile, answers, undefined, undefined, 'cost'); // "$ to $$" = 1.5 points
    expect(r.costPoints).toBe(1.5);
    expect(r.costPenalty).toBe(0);
    expect(r.priorities.cost).toBeCloseTo(r.priorities.effort, 10);
  });
  it('a free fix beats a paid fix with the same effort and reduction, but only in cost mode', () => {
    const base = actionById.A10; // Free, effort 2, Q12+Q13
    const paid: Action = { ...base, id: 'PAID', cost: '$$' };
    const free = simulateAction(base, profile, answers, undefined, undefined, 'cost');
    const dear = simulateAction(paid, profile, answers, undefined, undefined, 'cost');
    expect(free.riskReduction).toBeCloseTo(dear.riskReduction, 10);
    expect(free.priority).toBeGreaterThan(dear.priority);
    const freeE = simulateAction(base, profile, answers, undefined, undefined, 'effort');
    const dearE = simulateAction(paid, profile, answers, undefined, undefined, 'effort');
    expect(freeE.priority).toBeCloseTo(dearE.priority, 10);
  });
  it('cost weight 0 reproduces the effort-only order', () => {
    const noCost: RankingConfig = { ...ranking, costWeight: 0 };
    const a = prioritizeActions(profile, answers, undefined, 'effort').map((r) => r.action.id);
    const b = prioritizeActions(profile, answers, undefined, 'cost', noCost).map((r) => r.action.id);
    expect(b).toEqual(a);
  });
});

describe('timeframes', () => {
  it('cost mode caps essential fixes at the configured latest timeframe', () => {
    const slow: Action = { ...actionById.A11, effort: 4 };
    expect(simulateAction(slow, profile, answers, undefined, undefined, 'effort').timeframe).toBe(90);
    expect(simulateAction(slow, profile, answers, undefined, undefined, 'cost').timeframe).toBe(60);
  });
});

describe('demo persona under both modes', () => {
  for (const mode of ['effort', 'cost'] as const) {
    it(`${mode}: email two-step login first, the load-change rule in the top 3, sorted by priority`, () => {
      const ranked = prioritizeActions(profile, answers, undefined, mode);
      expect(ranked[0].action.id).toBe('A1');
      expect(ranked.slice(0, 3).map((r) => r.action.id)).toContain('A19');
      for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].priority).toBeGreaterThanOrEqual(ranked[i].priority);
      expect(ranked.every((r) => r.mode === mode)).toBe(true);
    });
  }
  it('cost mode moves paid fixes down and keeps backups where they were', () => {
    const pos = (mode: 'effort' | 'cost', id: string) => prioritizeActions(profile, answers, undefined, mode).findIndex((r) => r.action.id === id);
    expect(pos('cost', 'A5')).toBeGreaterThan(pos('effort', 'A5')); // password manager, "$"
    expect(pos('cost', 'A11')).toBeLessThanOrEqual(pos('effort', 'A11')); // backups, essential
  });
  it('both modes put every ranked fix in exactly one place in the plan', () => {
    for (const mode of ['effort', 'cost'] as const) {
      const ranked = prioritizeActions(profile, answers, undefined, mode);
      const p = buildPlan(ranked);
      expect(p.top.length + p.days30.length + p.days60.length + p.days90.length).toBe(ranked.length);
    }
  });
});
