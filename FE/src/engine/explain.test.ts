import { describe, expect, it } from 'vitest';
import { prioritizeActions } from './actions';
import { demoPersona } from './data';
import { explainRisk } from './explain';
import { assess } from './scoring';
import type { Answers, Profile } from './types';

const { profile, answers } = demoPersona;
const ranked = prioritizeActions(profile, answers);
const a = assess(profile, answers);

describe('explainRisk for the demo company', () => {
  const bec = explainRisk('BEC', profile, answers, ranked);

  it('matches the scores shown on the dashboard', () => {
    const s = a.scenarios.find((x) => x.id === 'BEC')!;
    expect(bec.risk).toBeCloseTo(s.risk, 10);
    expect(bec.chance).toBeCloseTo(s.likelihood.final, 10);
    expect(bec.band).toBe(s.band);
    expect(bec.baseChance).toBe(0.8);
  });
  it('ranks drivers by how far fixing each one would lower the chance', () => {
    // Call-back rule (weight 0.6) matters most, then email phone code (0.5)
    expect(bec.drivers.slice(0, 2).map((d) => d.questionId)).toEqual(['Q7', 'Q1']);
    expect(bec.drivers[0].chanceIfFixed).toBeCloseTo(0.8 * 0.4, 10);
    for (const d of bec.drivers) expect(d.chanceIfFixed).toBeLessThan(d.chanceNow);
  });
  it('explains impact with the profile reasons', () => {
    expect(bec.impact.final).toBe(4);
    expect(bec.impact.modifiers.map((m) => m.label)).toEqual(['Sends or receives bank transfers every week']);
  });
  it('lists the fixes that lower this risk, biggest drop first, with their place in the plan', () => {
    const ids = bec.fixes.map((f) => f.actionId);
    expect(ids).toContain('A1');
    expect(ids).toContain('A7');
    for (let i = 1; i < bec.fixes.length; i++) {
      expect(bec.fixes[i - 1].before - bec.fixes[i - 1].after).toBeGreaterThanOrEqual(bec.fixes[i].before - bec.fixes[i].after - 1e-9);
    }
    const a1 = bec.fixes.find((f) => f.actionId === 'A1')!;
    expect(a1.rank).toBe(ranked.findIndex((r) => r.action.id === 'A1') + 1);
    expect(a1.inTop).toBe(true);
    expect(a1.afterBand).not.toBe('High');
  });
  it('lists supply chain effects from the diagram data, strongest first', () => {
    expect(bec.supplyChain.map((s) => s.id)).toEqual(['FRAUD', 'AUDIT']);
  });
  it('shows protections already in place', () => {
    const ransom = explainRisk('RANSOM', profile, answers, ranked);
    // Antivirus is "Partly" for the demo company
    expect(ransom.protections.map((p) => p.questionId)).toContain('Q13');
    expect(ransom.protections.find((p) => p.questionId === 'Q13')!.cut).toBeCloseTo(0.15, 10);
  });
});

describe('explainRisk with routes that do not apply', () => {
  const profile: Profile = { sector: 'farm', hasOT: 'no', payments: 'no', downtime: '1-3d' };
  const answers: Answers = { Q17: 'na', Q12: 'no', Q18: 'no' };
  const story = explainRisk('RANSOM', profile, answers, prioritizeActions(profile, answers));

  it('lists them separately, never as drivers or protections', () => {
    const na = story.notApplicable.map((n) => n.questionId);
    expect(na).toContain('Q17'); // answered "does not apply"
    expect(na).toContain('Q19'); // hidden: no connected equipment
    const other = [...story.drivers.map((d) => d.questionId), ...story.protections.map((p) => p.questionId)];
    expect(other).not.toContain('Q17');
    expect(other).not.toContain('Q19');
    expect(story.drivers.map((d) => d.questionId)).toContain('Q12');
  });
});
