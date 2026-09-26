import { describe, expect, it } from 'vitest';
import { cccsStatuses, cioscStatuses, frameworkRefs } from './controls';
import { cccs, ciosc, demoPersona, templateById, templates } from './data';
import type { Answers } from './types';

const { profile, answers } = demoPersona;

describe('CAN/CIOSC 104 catalog', () => {
  it('has the 18 sections numbered as in the OCI workbook', () => {
    expect(ciosc.sections.map((s) => s.id)).toEqual([
      '4.1', '4.2', '4.3', '4.4',
      '5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7', '5.8',
      '6.1', '6.2', '6.3', '6.4', '6.5', '6.6',
    ]);
  });
  it('maps every CCCS control to exactly one section', () => {
    for (const c of cccs.controls) {
      expect(ciosc.sections.filter((s) => s.cccs.includes(c.id)).map((s) => s.id), c.id).toHaveLength(1);
    }
  });
  it('explains every section that no CCCS control covers', () => {
    for (const s of ciosc.sections.filter((x) => x.cccs.length === 0)) expect(s.note, s.id).toBeTruthy();
  });
  it('names a group for every section', () => {
    for (const s of ciosc.sections) expect(ciosc.groups[s.id.split('.')[0]], s.id).toBeTruthy();
  });
});

describe('cioscStatuses', () => {
  const cccsRes = cccsStatuses(profile, answers);
  const res = cioscStatuses(cccsRes);
  const byCccs = Object.fromEntries(cccsRes.map((c) => [c.id, c]));

  it('takes status, evidence, and CIS links from the matching CCCS control', () => {
    for (const s of res.filter((x) => x.cccsIds.length === 1)) {
      const c = byCccs[s.cccsIds[0]];
      expect(s.status, s.id).toBe(c.status);
      expect(s.evidence, s.id).toEqual(c.evidence);
      expect(s.cisIds, s.id).toEqual(c.cisIds);
    }
  });
  it('marks sections with no CCCS equivalent as Not assessed', () => {
    for (const s of res.filter((x) => x.cccsIds.length === 0)) {
      expect(s.status, s.id).toBe('Not assessed');
      expect(s.evidence).toEqual([]);
    }
  });
  it('reports training under the organizational controls', () => {
    const training = res.find((s) => s.id === '4.3')!;
    expect(training.group).toBe('Organizational controls');
    expect(training.cccsIds).toEqual(['BC.6']);
  });
});

describe('frameworkRefs for CIOSC', () => {
  it('translates CCCS references into section numbers', () => {
    expect(frameworkRefs(['Q1', 'Q2']).ciosc).toEqual(['5.5']);
    expect(frameworkRefs(['Q9', 'Q14']).ciosc).toEqual(['4.3', '5.6']);
  });
  it('gives payment procedures no section', () => {
    expect(frameworkRefs(['Q7', 'Q8']).ciosc).toEqual([]);
  });
});

describe('report templates', () => {
  it('offers the CCCS + CIS and CyberSecure Canada templates', () => {
    expect(templates.map((t) => t.id)).toEqual(['cccs-cis', 'ciosc']);
    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(t.reportsOn.length).toBeGreaterThan(0);
    }
    expect(templateById.ciosc.name).toContain('CIOSC 104');
  });
  it('does not change the questionnaire', () => {
    const none: Answers = {};
    expect(cioscStatuses(cccsStatuses(profile, none)).every((s) => s.status === 'Not assessed')).toBe(true);
  });
});
