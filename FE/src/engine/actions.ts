import { cisById, dataset as defaultDataset, ranking as defaultRanking } from './data';
import { assess, isApplicable, type Assessment } from './scoring';
import type { Action, Answers, Band, Dataset, Profile, RankingConfig, RankingMode, ScenarioId } from './types';

export type Timeframe = 30 | 60 | 90;

export interface EssentialInfo {
  reason: string;
  /** The CIS safeguards that make this fix essential, e.g. ["11.2", "11.4"] */
  safeguards: string[];
}

/**
 * A fix is essential when it resolves a CIS safeguard at or below the configured Implementation Group
 * in one of the configured recovery/response controls (Data Recovery, Incident Response).
 */
export function essentialInfo(action: Action, data: Dataset = defaultDataset, config: RankingConfig = defaultRanking): EssentialInfo | null {
  const rule = config.essential;
  const safeguards = new Set<string>();
  let reason: string | null = null;
  for (const qid of action.questionIds) {
    const q = data.questions.find((x) => x.id === qid);
    for (const m of q?.cis ?? []) {
      const sg = cisById[m.safeguard];
      const control = m.safeguard.split('.')[0];
      if (sg && sg.ig <= rule.maxImplementationGroup && rule.cisControls[control]) {
        safeguards.add(m.safeguard);
        reason ??= rule.cisControls[control];
      }
    }
  }
  return reason ? { reason, safeguards: [...safeguards].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) } : null;
}

/** Numeric cost points for a cost label such as "$ to $$". Unknown labels throw so a typo cannot silently rank as free. */
export function costPointsFor(cost: string, config: RankingConfig = defaultRanking): number {
  const p = config.costPoints[cost];
  if (p === undefined) throw new Error(`Unknown cost label "${cost}". Add it to ranking.json costPoints.`);
  return p;
}

export interface ScenarioDelta {
  id: ScenarioId;
  before: number;
  after: number;
  beforeBand: Band;
  afterBand: Band;
}

export interface RankedAction {
  action: Action;
  /** Questions this action would change (visible and not already "yes"). */
  openQuestionIds: string[];
  riskBefore: number;
  riskAfter: number;
  riskReduction: number;
  /** riskReduction as a share of total risk before, 0..1 */
  pctReduction: number;
  /** Ranking mode this result was sorted by */
  mode: RankingMode;
  /** Priority in the active mode */
  priority: number;
  /** Priority under each mode, for side-by-side display */
  priorities: Record<RankingMode, number>;
  costPoints: number;
  /** Cost term added to effort in cost-aware mode (0 for essential fixes) */
  costPenalty: number;
  essential: EssentialInfo | null;
  /** Timeframe in the active mode (cost-aware mode caps essential fixes) */
  timeframe: Timeframe;
  /** Scenarios whose risk drops, largest drop first */
  scenarioDeltas: ScenarioDelta[];
  postureBefore: Assessment['posture'];
  postureAfter: Assessment['posture'];
  steps: string[];
}

export function timeframeFor(effort: number): Timeframe {
  if (effort <= 2) return 30;
  if (effort === 3) return 60;
  return 90;
}

/** Steps tailored to the user's email provider when the action has them. */
export function stepsFor(action: Action, profile: Profile): string[] {
  const provider = profile.emailProvider;
  return (provider && action.stepsByProvider?.[provider]) || action.steps;
}

/** Answers with every listed question set to "yes". */
export function applyFix(answers: Answers, questionIds: string[]): Answers {
  const next: Answers = { ...answers };
  // A question answered "does not apply" stays that way: there is nothing to fix.
  for (const id of questionIds) if (next[id] !== 'na') next[id] = 'yes';
  return next;
}

/** Simulate doing one action: before/after assessment for the "what if" view. */
export function simulateAction(
  action: Action,
  profile: Profile,
  answers: Answers,
  data: Dataset = defaultDataset,
  before: Assessment = assess(profile, answers, data),
  mode: RankingMode = defaultRanking.defaultMode,
  config: RankingConfig = defaultRanking,
): RankedAction {
  const openQuestionIds = action.questionIds.filter((id) => {
    const q = data.questions.find((qq) => qq.id === id);
    return q && isApplicable(q, profile, answers) && answers[id] !== 'yes';
  });
  const after = assess(profile, applyFix(answers, action.questionIds), data);
  const riskReduction = before.totalRisk - after.totalRisk;
  const afterById = Object.fromEntries(after.scenarios.map((s) => [s.id, s]));
  const scenarioDeltas: ScenarioDelta[] = before.scenarios
    .map((s) => {
      const a = afterById[s.id];
      return { id: s.id, before: s.risk, after: a.risk, beforeBand: s.band, afterBand: a.band };
    })
    .filter((d) => d.before - d.after > 1e-9)
    .sort((x, y) => y.before - y.after - (x.before - x.after));

  const essential = essentialInfo(action, data, config);
  const costPoints = costPointsFor(action.cost, config);
  const costPenalty = essential ? 0 : config.costWeight * costPoints;
  const priorities: Record<RankingMode, number> = {
    effort: riskReduction / action.effort,
    cost: riskReduction / (action.effort + costPenalty),
  };
  let timeframe = timeframeFor(action.effort);
  if (mode === 'cost' && essential) timeframe = Math.min(timeframe, config.essential.latestTimeframe) as Timeframe;

  return {
    action,
    openQuestionIds,
    riskBefore: before.totalRisk,
    riskAfter: after.totalRisk,
    riskReduction,
    pctReduction: before.totalRisk > 0 ? riskReduction / before.totalRisk : 0,
    mode,
    priority: priorities[mode],
    priorities,
    costPoints,
    costPenalty,
    essential,
    timeframe,
    scenarioDeltas,
    postureBefore: before.posture,
    postureAfter: after.posture,
    steps: stepsFor(action, profile),
  };
}

/**
 * Rank actions by priority in the chosen mode:
 * - "effort": risk reduction ÷ effort (the original spec formula)
 * - "cost":   risk reduction ÷ (effort + cost weight × cost points), with essential fixes exempt from the cost term
 * Only actions that would change at least one visible question not already "yes" are included.
 */
export function prioritizeActions(
  profile: Profile,
  answers: Answers,
  data: Dataset = defaultDataset,
  mode: RankingMode = defaultRanking.defaultMode,
  config: RankingConfig = defaultRanking,
): RankedAction[] {
  const before = assess(profile, answers, data);
  return data.actions
    .map((a) => simulateAction(a, profile, answers, data, before, mode, config))
    .filter((r) => r.openQuestionIds.length > 0)
    .sort((a, b) => b.priority - a.priority || b.riskReduction - a.riskReduction);
}

export interface Plan {
  top: RankedAction[];
  days30: RankedAction[];
  days60: RankedAction[];
  days90: RankedAction[];
}

/** Top N actions, then the rest grouped into a 30/60/90 day plan by timeframe (effort-based, with the essential cap in cost mode). */
export function buildPlan(ranked: RankedAction[], topN = 5): Plan {
  const top = ranked.slice(0, topN);
  const rest = ranked.slice(topN);
  return {
    top,
    days30: rest.filter((r) => r.timeframe === 30),
    days60: rest.filter((r) => r.timeframe === 60),
    days90: rest.filter((r) => r.timeframe === 90),
  };
}
