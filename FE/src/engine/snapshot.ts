import { buildPlan, prioritizeActions, type Timeframe } from './actions';
import { cccsStatuses, type ControlStatus } from './controls';
import { profileQuestions, questionById } from './data';
import { assess, coverage } from './scoring';
import type { Answers, Band, Profile, RankingMode, ScenarioId } from './types';

/** What the BE stores and a partner sees via a share link. Also used by BE/gen_demo.ts for the seeded demo. */
export interface Snapshot {
  sector: string;
  posture: { score: number; band: Band };
  scenarios: { id: ScenarioId; name: string; risk: number; band: Band }[];
  topActions: {
    id: string;
    title: string;
    whatToDo: string;
    cost: string;
    time: string;
    effort: number;
    priority: number;
    pctReduction: number;
    timeframe: Timeframe;
    cccs: string[];
  }[];
  cccs: { control: string; name: string; status: ControlStatus }[];
  /** How many of the questions that apply were answered. Absent on links made before the quick check existed. */
  coverage?: { answered: number; total: number };
}

const round = (n: number, d: number) => +n.toFixed(d);

export function buildSnapshot(profile: Profile, answers: Answers, mode: RankingMode): Snapshot {
  const assessment = assess(profile, answers);
  const plan = buildPlan(prioritizeActions(profile, answers, undefined, mode));
  const cov = coverage(profile, answers);
  return {
    sector: profileQuestions.find((q) => q.id === 'sector')?.options.find((o) => o.value === profile.sector)?.label ?? '',
    posture: assessment.posture,
    scenarios: assessment.scenarios.map((s) => ({ id: s.id, name: s.name, risk: round(s.risk, 2), band: s.band })),
    topActions: plan.top.map((r) => ({
      id: r.action.id,
      title: r.action.title,
      whatToDo: r.action.whatToDo,
      cost: r.action.cost,
      time: r.action.time,
      effort: r.action.effort,
      priority: round(r.priority, 3),
      pctReduction: round(r.pctReduction, 3),
      timeframe: r.timeframe,
      cccs: [...new Set(r.action.questionIds.flatMap((id) => questionById[id].cccs.flatMap((c) => c.reqs)))],
    })),
    cccs: cccsStatuses(profile, answers).map((c) => ({ control: c.id, name: c.name, status: c.status })),
    coverage: { answered: cov.answered, total: cov.total },
  };
}
