import { cccs as defaultCccs, ciosc as defaultCiosc, cis as defaultCis, dataset as defaultDataset } from './data';
import { isApplicable } from './scoring';
import type { Answers, AnswerValue, CccsControl, CisSafeguard, Dataset, MappingStrength, Profile, Question } from './types';

export type ControlStatus = 'Met' | 'Partially met' | 'Not yet met' | 'Not assessed' | 'Not applicable';

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
  if (vals.every((v) => v === 'yes')) return 'Met';  if (vals.every((v) => v === 'no' || v === 'unsure')) return 'Not yet met';
  return 'Partially met';
}

function answeredVisible(profile: Profile, answers: Answers, data: Dataset): Question[] {
  return data.questions.filter((q) => isApplicable(q, profile, answers) && answers[q.id]);
}

/** A control with a profile condition (websites) does not apply once the profile rules it out. Unanswered = applies. */
function controlApplies(ctl: CccsControl, profile: Profile): boolean {
  if (!ctl.appliesIf) return true;
  const v = profile[ctl.appliesIf.profile];
  return v === undefined || ctl.appliesIf.in.includes(v);
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
    if (!controlApplies(ctl, profile)) {
      return { id: ctl.id, name: ctl.name, status: 'Not applicable', evidence: [], reqsAssessed: [], reqsTotal: ctl.requirements.length, cisIds: [] };
    }
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

// ---------- CAN/CIOSC 104 ----------

export interface CioscResult {
  id: string;
  name: string;
  /** Top-level group, e.g. "Baseline controls" */
  group: string;
  status: ControlStatus;
  evidence: Evidence[];
  cccsIds: string[];
  /** Questions assessed directly for this section, where no CCCS control covers it */
  questionIds: string[];
  cisIds: string[];
  note?: string;
}

/**
 * CIOSC 104 is the standardized form of the CCCS baseline, so each section takes its evidence from the matching
 * CCCS controls. A section no CCCS control covers (log management) can list questions that speak to it directly.
 */
export function cioscStatuses(
  cccsResults: CccsResult[],
  profile: Profile = {},
  answers: Answers = {},
  catalog: typeof defaultCiosc = defaultCiosc,
  data: Dataset = defaultDataset,
): CioscResult[] {
  const byId = Object.fromEntries(cccsResults.map((c) => [c.id, c]));
  const answered = answeredVisible(profile, answers, data);
  return catalog.sections.map((sec) => {
    const matched = sec.cccs.map((id) => byId[id]).filter(Boolean);
    const evidence = new Map<string, Evidence>();
    const direct = answered.filter((q) => sec.questions?.includes(q.id));
    for (const e of [...matched.flatMap((c) => c.evidence), ...direct.map((q) => ({ questionId: q.id, answer: answers[q.id]!, strength: 'direct' as const }))]) {
      const prev = evidence.get(e.questionId);
      if (!prev || (prev.strength === 'partial' && e.strength === 'direct')) evidence.set(e.questionId, e);
    }
    const ev = [...evidence.values()];
    const notApplicable = matched.length > 0 && matched.every((c) => c.status === 'Not applicable') && direct.length === 0;
    return {
      id: sec.id,
      name: sec.name,
      group: catalog.groups[sec.id.split('.')[0]] ?? '',
      status: notApplicable ? 'Not applicable' : statusFrom(ev.map((e) => e.answer)),
      evidence: ev,
      cccsIds: sec.cccs,
      questionIds: sec.questions ?? [],
      cisIds: sortCis([...new Set([...matched.flatMap((c) => c.cisIds), ...direct.flatMap((q) => q.cis.map((m) => m.safeguard))])]),
      ...(sec.note && { note: sec.note }),
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
  'Not applicable': number;
}

export function countStatuses(items: { status: ControlStatus }[]): StatusCounts {
  const c: StatusCounts = { Met: 0, 'Partially met': 0, 'Not yet met': 0, 'Not assessed': 0, 'Not applicable': 0 };
  for (const i of items) c[i.status]++;
  return c;
}

// ---------- Outside both frameworks ----------

/** Visible questions that map to neither framework (payment and shipment procedures). Reported separately on the summary. */
export function otherPractices(profile: Profile, answers: Answers, data: Dataset = defaultDataset) {
  return data.questions
    .filter((q) => q.cccs.length === 0 && q.cis.length === 0 && isApplicable(q, profile, answers))
    .map((q) => ({ question: q, status: statusFrom([answers[q.id]]) }));
}

// ---------- References for a set of questions (used on action cards) ----------

export function frameworkRefs(
  questionIds: string[],
  data: Dataset = defaultDataset,
  cioscCatalog: typeof defaultCiosc = defaultCiosc,
): { cccs: string[]; cis: string[]; ciosc: string[] } {
  const cccsRefs = new Set<string>();
  const cisRefs = new Set<string>();
  const cioscRefs = new Set<string>();
  for (const id of questionIds) {
    const q = data.questions.find((x) => x.id === id);
    if (!q) continue;
    for (const m of q.cccs) {
      (m.reqs.length ? m.reqs : [m.control]).forEach((r) => cccsRefs.add(r));
      cioscCatalog.sections.filter((s) => s.cccs.includes(m.control)).forEach((s) => cioscRefs.add(s.id));
    }
    q.cis.forEach((m) => cisRefs.add(m.safeguard));
    cioscCatalog.sections.filter((s) => s.questions?.includes(id)).forEach((s) => cioscRefs.add(s.id));
  }
  const byNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return { cccs: [...cccsRefs].sort(byNum), cis: sortCis([...cisRefs]), ciosc: [...cioscRefs].sort(byNum) };
}
