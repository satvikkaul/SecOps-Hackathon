import type { RankedAction, Timeframe } from './actions';
import { dataset as defaultDataset, supplyChain as defaultSupplyChain, type SupplyChain } from './data';
import { bandFor, computeImpact, computeLikelihood, effectiveAnswer, isApplicable, type ImpactBreakdown } from './scoring';
import type { Answers, AnswerValue, Band, Dataset, Profile, ScenarioId, Sector } from './types';

/** How a risk plays out for this kind of business, step by step. Falls back to the generic chain. */
export function chainFor(scenarioId: ScenarioId, profile: Profile, data: Dataset = defaultDataset): string[] {
  const chain = data.scenarios.find((s) => s.id === scenarioId)?.chain;
  if (!chain) return [];
  return chain[profile.sector as Sector] ?? chain.default;
}

/** A gap that raises the chance of this risk, with what the chance would be if it were fixed. */
export interface Driver {
  questionId: string;
  label: string;
  answer: AnswerValue;
  chanceNow: number;
  chanceIfFixed: number;
}

/** Something already in place (Yes or Partly) that lowers the chance. */
export interface Protection {
  questionId: string;
  topic: string;
  answer: AnswerValue;
  /** Share of the chance it removes, e.g. 0.2 for "cuts it by 20%" */
  cut: number;
}

export interface RiskFix {
  actionId: string;
  title: string;
  /** Position in the current fix list (1-based) */
  rank: number;
  inTop: boolean;
  timeframe: Timeframe;
  before: number;
  after: number;
  beforeBand: Band;
  afterBand: Band;
}

export interface RiskStory {
  id: ScenarioId;
  baseChance: number;
  chance: number;
  impact: ImpactBreakdown;
  risk: number;
  band: Band;
  drivers: Driver[];
  protections: Protection[];
  /** Routes that do not exist for this business (hidden by the profile or answered "does not apply") */
  notApplicable: { questionId: string; topic: string }[];
  fixes: RiskFix[];
  supplyChain: { id: string; label: string; weight: number }[];
}

/**
 * Everything needed to explain one risk: why it is likely, why it would hurt, what fixes it,
 * and who else in the supply chain feels it. Uses the same calculations as the scores.
 */
export function explainRisk(
  scenarioId: ScenarioId,
  profile: Profile,
  answers: Answers,
  ranked: RankedAction[],
  data: Dataset = defaultDataset,
  chain: SupplyChain = defaultSupplyChain,
): RiskStory {
  const likelihood = computeLikelihood(scenarioId, profile, answers, data);
  const impact = computeImpact(scenarioId, profile, answers, data);
  const risk = likelihood.final * impact.final;

  const drivers: Driver[] = [];
  const protections: Protection[] = [];
  const notApplicable: RiskStory['notApplicable'] = [];

  for (const q of data.questions) {
    if (!q.weights[scenarioId]) continue;
    const answer = effectiveAnswer(q, profile, answers);
    if (!answer) continue;
    if (!isApplicable(q, profile, answers)) {
      notApplicable.push({ questionId: q.id, topic: q.topic });
      continue;
    }
    const factor = likelihood.factors.find((f) => f.questionId === q.id);
    if (answer === 'yes' || answer === 'partial') {
      if (factor && factor.factor < 1) protections.push({ questionId: q.id, topic: q.topic, answer, cut: 1 - factor.factor });
    }
    if (answer !== 'yes') {
      const fixed = computeLikelihood(scenarioId, profile, { ...answers, [q.id]: 'yes' }, data).final;
      if (fixed < likelihood.final - 1e-9) {
        drivers.push({ questionId: q.id, label: q.gapLabel, answer, chanceNow: likelihood.final, chanceIfFixed: fixed });
      }
    }
  }
  drivers.sort((a, b) => a.chanceIfFixed - b.chanceIfFixed);
  protections.sort((a, b) => b.cut - a.cut);

  const fixes: RiskFix[] = [];
  ranked.forEach((r, i) => {
    const d = r.scenarioDeltas.find((x) => x.id === scenarioId);
    if (!d) return;
    fixes.push({
      actionId: r.action.id,
      title: r.action.title,
      rank: i + 1,
      inTop: i < 5,
      timeframe: r.timeframe,
      before: d.before,
      after: d.after,
      beforeBand: d.beforeBand,
      afterBand: d.afterBand,
    });
  });
  // Biggest drop for this risk first
  fixes.sort((a, b) => b.before - b.after - (a.before - a.after) || a.rank - b.rank);

  const labels = Object.fromEntries(chain.impacts.map((i) => [i.id, i.label]));
  const supplyChain = Object.entries(chain.links[scenarioId] ?? {})
    .map(([id, weight]) => ({ id, label: labels[id], weight }))
    .sort((a, b) => b.weight - a.weight);

  return {
    id: scenarioId,
    baseChance: likelihood.base,
    chance: likelihood.final,
    impact,
    risk,
    band: bandFor(risk),
    drivers,
    protections,
    notApplicable,
    fixes,
    supplyChain,
  };
}
