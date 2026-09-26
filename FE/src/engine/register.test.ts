import { describe, expect, it } from 'vitest';
import { prioritizeActions } from './actions';
import { demoPersona, scenarios } from './data';
import {
  REGISTER_COLUMNS,
  buildRiskRegister,
  fixesFor,
  registerCsv,
  registerDate,
  registerImpact,
  registerLevel,
  registerLikelihood,
} from './register';
import { assess } from './scoring';
import type { Answers } from './types';

const { profile, answers } = demoPersona;
const today = new Date(2026, 8, 26);
const register = (a: Answers = answers) => buildRiskRegister(assess(profile, a), prioritizeActions(profile, a), profile, a, today);

describe('scale conversion', () => {
  it('maps likelihood to 1–5 in equal fifths', () => {
    expect([0.05, 0.2, 0.21, 0.4, 0.6, 0.8, 0.81, 1].map(registerLikelihood)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
  });
  it('rounds impact and keeps it between 1 and 5', () => {
    expect([0.6, 1.4, 2.5, 4.49, 5].map(registerImpact)).toEqual([1, 1, 3, 4, 5]);
  });
  it('uses the workbook bands: 1–5 Low, 6–10 Moderate, 11–25 High', () => {
    expect([1, 5, 6, 10, 11, 25].map(registerLevel)).toEqual(['Low', 'Low', 'Moderate', 'Moderate', 'High', 'High']);
  });
  it('formats dates as mmm d, yyyy', () => {
    expect(registerDate(today)).toBe('Sep 26, 2026');
  });
});

describe('buildRiskRegister', () => {
  it('has one row per scenario, highest risk first, with sequential IDs', () => {
    const rows = register();
    expect(rows).toHaveLength(scenarios.length);
    expect(rows.map((r) => r.riskId)).toEqual(scenarios.map((_, i) => `R00${i + 1}`));
    const risks = assess(profile, answers).scenarios.map((s) => s.risk);
    expect(risks).toEqual([...risks].sort((a, b) => b - a));
  });
  it('gives every scenario a category', () => {
    for (const s of scenarios) expect(s.category, s.id).toBeTruthy();
  });
  it('computes risk level as likelihood × impact', () => {
    for (const r of register()) {
      expect(r.riskLevel).toBe(r.likelihood * r.impact);
      expect(r.level).toBe(registerLevel(r.riskLevel));
    }
  });
  it('picks the fixes that lower that risk the most', () => {
    const ranked = prioritizeActions(profile, answers);
    const drop = (id: string) => (r: (typeof ranked)[number]) => {
      const d = r.scenarioDeltas.find((x) => x.id === id)!;
      return d.before - d.after;
    };
    for (const s of scenarios) {
      const picked = fixesFor(s.id, ranked);
      const drops = picked.map(drop(s.id));
      expect(drops).toEqual([...drops].sort((a, b) => b - a));
      const rest = ranked.filter((r) => !picked.includes(r) && r.scenarioDeltas.some((d) => d.id === s.id));
      for (const r of rest) expect(drop(s.id)(r)).toBeLessThanOrEqual(Math.min(...drops));
    }
    expect(fixesFor('DATALOSS', ranked)[0].action.id).toBe('A11'); // backups
  });
  it('plans only fixes that lower that risk, due when the last one is', () => {
    const ranked = prioritizeActions(profile, answers);
    const a = assess(profile, answers);
    buildRiskRegister(a, ranked, profile, answers, today).forEach((r, i) => {
      const fixes = fixesFor(a.scenarios[i].id, ranked);
      if (fixes.length === 0) return;
      expect(r.treatment).toBe('Mitigate');
      expect(r.status).toBe('Mitigation Not Started');
      fixes.forEach((f) => expect(r.actionPlan).toContain(f.action.title));
      const days = Math.max(...fixes.map((f) => f.timeframe));
      expect(r.deadline).toBe(registerDate(new Date(2026, 8, 26 + days)));
    });
  });
  it('accepts and monitors a risk once every fix is in place', () => {
    const allYes = Object.fromEntries(Object.keys(answers).map((k) => [k, 'yes'])) as Answers;
    for (const r of register(allYes)) {
      expect(r.treatment).toBe('Accept');
      expect(r.status).toBe('Monitor');
      expect(r.deadline).toBe('');
    }
  });
  it('lists controls already in place in the description', () => {
    const allYes = Object.fromEntries(Object.keys(answers).map((k) => [k, 'yes'])) as Answers;
    expect(register(allYes)[0].description).toContain('Already helping:');
  });
});

describe('registerCsv', () => {
  it('starts with a BOM and the workbook column headers', () => {
    const csv = registerCsv(register());
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.slice(1).split('\r\n')[0]).toBe(REGISTER_COLUMNS.join(','));
    expect(csv.trimEnd().split('\r\n')).toHaveLength(scenarios.length + 1);
  });
  it('quotes cells containing commas, quotes, or line breaks', () => {
    const [row] = register();
    const csv = registerCsv([{ ...row, description: 'Say "hi", then\nleave' }]);
    expect(csv).toContain('"Say ""hi"", then\nleave"');
  });
});
