import { describe, expect, it } from 'vitest';
import { cccsStatuses, cisStatuses, frameworkRefs, otherPractices, statusFrom } from './controls';
import { actions, cccs, cis, cisById, questionById, questions } from './data';
import type { Answers, Profile } from './types';

const allControlIds = new Set(cccs.controls.map((c) => c.id));
const reqToControl = new Map(cccs.controls.flatMap((c) => c.requirements.map((r) => [r.id, c.id] as const)));

describe('CCCS catalog matches Baseline Controls v1.2', () => {
  it('has the 13 controls BC.1 to BC.13 in order', () => {
    expect(cccs.controls.map((c) => c.id)).toEqual(Array.from({ length: 13 }, (_, i) => `BC.${i + 1}`));
  });
  it('has the published number of requirements per control', () => {
    // BC.1..BC.13 sub-requirement counts in V1.2
    const expected = [3, 2, 2, 1, 3, 1, 2, 7, 8, 5, 2, 4, 2];
    expect(cccs.controls.map((c) => c.requirements.length)).toEqual(expected);
  });
  it('numbers requirements consecutively within each control', () => {
    for (const c of cccs.controls) {
      expect(c.requirements.map((r) => r.id)).toEqual(c.requirements.map((_, i) => `${c.id}.${i + 1}`));
    }
  });
});

describe('CIS catalog', () => {
  it('uses valid v8.1 safeguard ids with a known parent control and IG', () => {
    for (const s of cis.safeguards) {
      expect(s.id).toMatch(/^\d{1,2}\.\d{1,2}$/);
      expect(cis.controls[s.id.split('.')[0]]).toBeTruthy();
      expect([1, 2, 3]).toContain(s.ig);
    }
  });
  it('only lists safeguards that some question uses', () => {
    const used = new Set(questions.flatMap((q) => q.cis.map((m) => m.safeguard)));
    expect(cis.safeguards.map((s) => s.id).filter((id) => !used.has(id))).toEqual([]);
  });
});

describe('question mappings are internally consistent', () => {
  it('every CCCS mapping points at a real control, and its requirements belong to that control', () => {
    for (const q of questions) {
      for (const m of q.cccs) {
        expect(allControlIds.has(m.control), `${q.id} → ${m.control}`).toBe(true);
        for (const r of m.reqs) expect(reqToControl.get(r), `${q.id} → ${r}`).toBe(m.control);
      }
    }
  });
  it('every CIS mapping points at a catalogued safeguard', () => {
    for (const q of questions) for (const m of q.cis) expect(cisById[m.safeguard], `${q.id} → ${m.safeguard}`).toBeDefined();
  });
  it('every partial or missing mapping is explained', () => {
    for (const q of questions) {
      const weak =
        q.cccs.length === 0 ||
        q.cis.length === 0 ||
        q.cccs.some((m) => m.reqs.length === 0) ||
        [...q.cccs, ...q.cis].some((m) => m.strength === 'partial');
      if (weak) expect(q.mappingNote, q.id).toBeTruthy();
    }
  });
});

describe('key mappings checked against the source text', () => {
  const cccsReqs = (id: string) => questionById[id].cccs.flatMap((m) => m.reqs);
  const cisIds = (id: string) => questionById[id].cis.map((m) => m.safeguard);

  it('MFA → BC.5.1 and CIS 6.3', () => {
    expect(cccsReqs('Q1')).toEqual(['BC.5.1']);
    expect(cisIds('Q1')).toEqual(['6.3']);
  });
  it('DMARC → BC.9.7 and CIS 9.5', () => {
    expect(cccsReqs('Q11')).toEqual(['BC.9.7']);
    expect(cisIds('Q11')).toEqual(['9.5']);
  });
  it('offboarding → BC.12.3 and CIS 6.2', () => {
    expect(cccsReqs('Q4')).toEqual(['BC.12.3']);
    expect(cisIds('Q4')).toEqual(['6.2']);
  });
  it('remote access → BC.9.3 (VPN + two-factor) and CIS 6.4', () => {
    expect(cccsReqs('Q17')).toContain('BC.9.3');
    expect(cisIds('Q17')).toContain('6.4');
  });
  it('default passwords → BC.4.1 and CIS 4.7', () => {
    expect(cccsReqs('Q20')).toEqual(['BC.4.1']);
    expect(cisIds('Q20')).toEqual(['4.7']);
  });
  it('guest Wi-Fi → BC.9.5', () => expect(cccsReqs('Q21')).toEqual(['BC.9.5']));
  it('offline + tested backup → CIS 11.4 and 11.5', () => expect(cisIds('Q15')).toEqual(['11.4', '11.5']));
  it('breach notice in contracts → CIS 15.4', () => expect(cisIds('Q23')).toEqual(['15.4']));
  it('incident plan → BC.1.1, BC.1.2; insurance → BC.1.3', () => {
    expect(cccsReqs('Q24')).toEqual(['BC.1.1', 'BC.1.2']);
    expect(cccsReqs('Q25')).toEqual(['BC.1.3']);
  });
  it('payment procedures (Q7, Q8) map to neither framework', () => {
    for (const id of ['Q7', 'Q8']) {
      expect(questionById[id].cccs).toEqual([]);
      expect(questionById[id].cis).toEqual([]);
    }
  });
  it('questions with no matching CIS safeguard are skipped, not forced', () => {
    expect(cisIds('Q10')).toEqual([]);
    expect(cisIds('Q25')).toEqual([]);
  });
  it('BC.11 (websites) and BC.13 (portable media) have no questions', () => {
    const used = new Set(questions.flatMap((q) => q.cccs.map((m) => m.control)));
    expect(used.has('BC.11')).toBe(false);
    expect(used.has('BC.13')).toBe(false);
  });
});

describe('status derivation', () => {
  const profile: Profile = { payments: 'yes', hasOT: 'yes' };
  it('applies the spec rule, with unsure counted as no', () => {
    expect(statusFrom(['yes', 'yes'])).toBe('Met');
    expect(statusFrom(['no', 'unsure'])).toBe('Not yet met');
    expect(statusFrom(['yes', 'no'])).toBe('Partially met');
    expect(statusFrom(['partial'])).toBe('Partially met');
    expect(statusFrom([undefined])).toBe('Not assessed');
  });
  it('counts only visible, answered questions', () => {
    const answers: Answers = { Q18: 'yes', Q19: 'yes' };
    const bc9 = (p: Profile) => cccsStatuses(p, answers).find((c) => c.id === 'BC.9')!;
    expect(bc9({ hasOT: 'yes' }).status).toBe('Met');
    expect(bc9({ hasOT: 'no' }).status).toBe('Not assessed');
  });
  it('reports requirement coverage honestly', () => {
    const all: Answers = Object.fromEntries(questions.map((q) => [q.id, 'yes']));
    const res = cccsStatuses(profile, all);
    const bc9 = res.find((c) => c.id === 'BC.9')!;
    expect(bc9.reqsAssessed).toEqual(['BC.9.3', 'BC.9.5', 'BC.9.7', 'BC.9.8']);
    expect(bc9.reqsTotal).toBe(8);
    expect(res.find((c) => c.id === 'BC.1')!.reqsAssessed).toHaveLength(3);
  });
  it('links CIS safeguards to CCCS controls through shared questions', () => {
    const res = cccsStatuses(profile, { Q1: 'yes', Q5: 'no' });
    expect(res.find((c) => c.id === 'BC.5')!.cisIds).toEqual(['5.2', '6.3']);
  });
  it('cross-references CIS only through a question’s primary CCCS control', () => {
    const res = cccsStatuses(profile, { Q17: 'no', Q18: 'no' });
    const get = (id: string) => res.find((c) => c.id === id)!;
    // Q17 counts toward BC.5 (partial) but its VPN safeguard belongs with BC.9
    expect(get('BC.5').evidence.map((e) => e.questionId)).toEqual(['Q17']);
    expect(get('BC.5').cisIds).toEqual([]);
    expect(get('BC.9').cisIds).toEqual(['6.4', '12.7']);
    // Q18's first mapping is BC.4, so CIS 4.8 sits there, not under BC.10
    expect(get('BC.4').cisIds).toEqual(['4.8']);
    expect(get('BC.10').cisIds).toEqual([]);
  });
  it('gives every catalogued CIS safeguard a status', () => {
    const res = cisStatuses(profile, { Q11: 'partial' });
    expect(res).toHaveLength(cis.safeguards.length);
    expect(res.find((s) => s.id === '9.5')!.status).toBe('Partially met');
  });
  it('lists payment procedures separately, respecting showIf', () => {
    expect(otherPractices({ payments: 'yes' }, { Q7: 'yes' }).map((p) => p.question.id)).toEqual(['Q7', 'Q8', 'Q26']);
    expect(otherPractices({ payments: 'no' }, {}).map((p) => p.question.id)).toEqual(['Q8', 'Q26']);
  });
  it('every action traces to at least one framework reference or a payment practice', () => {
    for (const a of actions) {
      const refs = frameworkRefs(a.questionIds);
      const paymentOnly = a.questionIds.every((id) => questionById[id].cccs.length === 0);
      expect(refs.cccs.length > 0 || paymentOnly, a.id).toBe(true);
    }
    expect(frameworkRefs(['Q1', 'Q2']).cccs).toEqual(['BC.5.1']);
  });
});
