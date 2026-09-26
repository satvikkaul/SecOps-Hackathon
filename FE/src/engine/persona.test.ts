import { describe, expect, it } from 'vitest';
import { prioritizeActions } from './actions';
import { cccsStatuses, otherPractices } from './controls';
import { demoPersona } from './data';
import { buildFlow } from './flow';
import { assess, unsureQuestions } from './scoring';

const { profile, answers } = demoPersona;
const a = assess(profile, answers);
const ranked = prioritizeActions(profile, answers);

describe('demo persona: Peel Valley Fresh Logistics', () => {
  it('a redirected load is the number one risk, payment fraud number two, both High', () => {
    expect(a.scenarios.slice(0, 2).map((s) => [s.id, s.band])).toEqual([
      ['CARGO', 'High'],
      ['BEC', 'High'],
    ]);
  });
  it('RANSOM is in the top 5', () => {
    expect(a.scenarios.slice(0, 5).map((s) => s.id)).toContain('RANSOM');
  });
  it('overall posture is High', () => {
    expect(a.posture.band).toBe('High');
  });
  it('email two-step login is the number one action, then the load-change rule', () => {
    expect(ranked.slice(0, 2).map((r) => r.action.id)).toEqual(['A1', 'A19']);
  });
  it('always-on vendor remote access (A13) is still on the plan', () => {
    expect(ranked.slice(0, 8).map((r) => r.action.id)).toContain('A13');
  });
  it('lists Q20 and Q23 as worth checking', () => {
    expect(unsureQuestions(profile, answers).map((q) => q.id)).toEqual(['Q20', 'Q23']);
  });
  it('produces 13 CCCS controls with the expected statuses', () => {
    const c = cccsStatuses(profile, answers);
    const status = (id: string) => c.find((x) => x.id === id)!.status;
    expect(c).toHaveLength(13);
    expect(status('BC.11')).toBe('Not assessed');
    expect(status('BC.13')).toBe('Not assessed');
    expect(status('BC.1')).toBe('Not yet met');
    expect(status('BC.3')).toBe('Partially met');
    expect(status('BC.5')).toBe('Not yet met');
    expect(status('BC.7')).toBe('Partially met');
    // Q20 is "unsure" (counts as no) and Q18 is no
    expect(status('BC.4')).toBe('Not yet met');
  });
  it('reports its payment procedures separately', () => {
    expect(otherPractices(profile, answers).map((p) => [p.question.id, p.status])).toEqual([
      ['Q7', 'Not yet met'],
      ['Q8', 'Not yet met'],
      ['Q26', 'Not yet met'],
    ]);
  });
  it('builds a three-column flow graph with valid links', () => {
    const g = buildFlow(profile, answers, a);
    for (const col of [0, 1, 2]) expect(g.nodes.filter((n) => n.column === col).length).toBeGreaterThan(0);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const l of g.links) {
      expect(ids.has(l.source)).toBe(true);
      expect(ids.has(l.target)).toBe(true);
    }
  });
  it('prints the results table (useful when tuning weights)', () => {
    const rows = a.scenarios.map(
      (s) => `${s.id.padEnd(9)} L=${s.likelihood.final.toFixed(3)} I=${s.impact.final.toFixed(2)} R=${s.risk.toFixed(2)} ${s.band}`,
    );
    const acts = ranked.map(
      (r) => `${r.action.id.padEnd(4)} reduction=${r.riskReduction.toFixed(3)} effort=${r.action.effort} priority=${r.priority.toFixed(3)}`,
    );
    console.log(['', ...rows, `posture ${a.posture.score.toFixed(2)} ${a.posture.band}`, '', ...acts].join('\n'));
  });
});
