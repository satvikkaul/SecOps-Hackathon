import { cccs as defaultCccs, cis as defaultCis, dataset as defaultDataset } from './data';
import { isApplicable } from './scoring';
import type { Answers, AnswerValue, CccsControl, CisSafeguard, Dataset, MappingStrength, Profile, Question } from './types';

export type ControlStatus = 'Met' | 'Partially met' | 'Not yet met' | 'Not assessed';

export interface Evidence {
  questionId: string;
  answer: AnswerValue;
  strength: MappingStrength;
}

/**
 * Spec rule: all yes = Met, all no = Not yet met, any partial or mix = Partially met.
 * "Unsure" counts as no.
 */
export function statusFrom(answers: (AnswerValue | undefined)[]): ControlStatus {
  const vals = answers.filter((a): a is AnswerValue => !!a && a !== 'na');
  if (vals.length === 0) return 'Not assessed';
  if (vals.every((v) => v === 'yes')) return 'Met';
  if (vals.every((v) => v === 'no' || v === 'unsure')) return 'Not yet met';
  return 'Partially met';
}

function answeredVisible(profile: Profile, answers: Answers, data: Dataset): Question[] {
  return data.questions.filter((q) => isApplicable(q, profile, answers) && answers[q.id]);
}

// ---------- CCCS ----------

/**
 * The CCCS control(s) a question is mainly about: its direct mappings, or its first listed mapping if all are partial.
 * CIS safeguards are cross-referenced to CCCS controls only through these, so a question's secondary link
 * (e.g. Q17 remote access → BC.5) does not drag unrelated safeguards (CIS 12.7 VPN) onto that control.
 */
export function primaryControls(q: Question): string[] {
  const direct = q.cccs.filter((m) => m.strength === 'direct').map((m) => m.control);
  return direct.length ? [...new Set(direct)] : q.cccs.slice(0, 1).map((m) => m.control);
}

export interface CccsResult {
  id: string;
  name: string;
  status: ControlStatus;
  evidence: Evidence[];
  /** Sub-requirements at least one answered question speaks to, in document order */
  reqsAssessed: string[];
  reqsTotal: number;
  /** CIS safeguards linked through the same questions */
  cisIds: string[];
}

export function cccsStatuses(
  profile: Profile,
  answers: Answers,
  data: Dataset = defaultDataset,
  controls: CccsControl[] = defaultCccs.controls,
): CccsResult[] {
  const qs = answeredVisible(profile, answers, data);
  return controls.map((ctl) => {
    const evidence: Evidence[] = [];
    const reqs = new Set<string>();
    const cisIds = new Set<string>();
    for (const q of qs) {
      const maps = q.cccs.filter((m) => m.control === ctl.id);
      if (maps.length === 0) continue;
      // A question can map to one control twice (direct for one requirement, partial for another); report its strongest link.
      const strength: MappingStrength = maps.some((m) => m.strength === 'direct') ? 'direct' : 'partial';
      evidence.push({ questionId: q.id, answer: answers[q.id]!, strength });
      maps.forEach((m) => m.reqs.forEach((r) => reqs.add(r)));
      if (primaryControls(q).includes(ctl.id)) q.cis.forEach((c) => cisIds.add(c.safeguard));
    }
    return {
      id: ctl.id,
      name: ctl.name,
      status: statusFrom(evidence.map((e) => e.answer)),
      evidence,
      reqsAssessed: ctl.requirements.map((r) => r.id).filter((id) => reqs.has(id)),
      reqsTotal: ctl.requirements.length,
      cisIds: sortCis([...cisIds]),
    };
  });
}

// ---------- CIS ----------

export interface CisResult extends CisSafeguard {
  control: string;
  controlName: string;
  status: ControlStatus;
  evidence: Evidence[];
}

export function sortCis(ids: string[]): string[] {
  return ids.sort((a, b) => {
    const [a1, a2] = a.split('.').map(Number);
    const [b1, b2] = b.split('.').map(Number);
    return a1 - b1 || a2 - b2;
  });
}

export function cisStatuses(
  profile: Profile,
  answers: Answers,
  data: Dataset = defaultDataset,
  catalog: typeof defaultCis = defaultCis,
): CisResult[] {
  const qs = answeredVisible(profile, answers, data);
  return catalog.safeguards.map((sg) => {
    const evidence: Evidence[] = qs.flatMap((q) =>
      q.cis.filter((m) => m.safeguard === sg.id).map((m) => ({ questionId: q.id, answer: answers[q.id]!, strength: m.strength })),
    );
    const control = sg.id.split('.')[0];
    return { ...sg, control, controlName: catalog.controls[control] ?? '', status: statusFrom(evidence.map((e) => e.answer)), evidence };
  });
}

export interface StatusCounts {
  Met: number;
  'Partially met': number;
  'Not yet met': number;
  'Not assessed': number;
}

export function countStatuses(items: { status: ControlStatus }[]): StatusCounts {
  const c: StatusCounts = { Met: 0, 'Partially met': 0, 'Not yet met': 0, 'Not assessed': 0 };
  for (const i of items) c[i.status]++;
  return c;
}

// ---------- Outside both frameworks ----------

/** Visible questions that map to no CCCS control (payment procedures). Reported separately on the summary. */
export function otherPractices(profile: Profile, answers: Answers, data: Dataset = defaultDataset) {
  return data.questions
    .filter((q) => q.cccs.length === 0 && isApplicable(q, profile, answers))
    .map((q) => ({ question: q, status: statusFrom([answers[q.id]]) }));
}

// ---------- References for a set of questions (used on action cards) ----------

export function frameworkRefs(questionIds: string[], data: Dataset = defaultDataset): { cccs: string[]; cis: string[] } {
  const cccsRefs = new Set<string>();
  const cisRefs = new Set<string>();
  for (const id of questionIds) {
    const q = data.questions.find((x) => x.id === id);
    if (!q) continue;
    for (const m of q.cccs) (m.reqs.length ? m.reqs : [m.control]).forEach((r) => cccsRefs.add(r));
    q.cis.forEach((m) => cisRefs.add(m.safeguard));
  }
  const byNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return { cccs: [...cccsRefs].sort(byNum), cis: sortCis([...cisRefs]) };
}
