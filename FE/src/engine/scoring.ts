import { dataset as defaultDataset } from './data';
import type { Answers, AnswerValue, Band, Dataset, Profile, Question, ScenarioId, Sector } from './types';

export const MIN_LIKELIHOOD = 0.05;

/**
 * "na" (does not apply) scores like "yes" for likelihood: if the route does not exist
 * (nobody connects remotely, no connected equipment), there is no exposure through it.
 * It is excluded from control statuses, fix lists, and "worth checking".
 */
export const ANSWER_VALUES: Record<AnswerValue, number> = {
  yes: 1,
  partial: 0.5,
  no: 0,
  unsure: 0,
  na: 1,
};

/** Numeric value of an answer. Unanswered and "unsure" both score as 0. */
export function answerValue(answer: AnswerValue | undefined): number {
  return answer ? ANSWER_VALUES[answer] : 0;
}

/** A question is visible unless it has a showIf condition the profile does not meet. */
export function isVisible(question: Question, profile: Profile): boolean {
  if (!question.showIf) return true;
  const v = profile[question.showIf.profile];
  return v !== undefined && question.showIf.in.includes(v);
}

/** Visible and not answered "does not apply": the question counts toward controls and fixes. */
export function isApplicable(question: Question, profile: Profile, answers: Answers): boolean {
  return isVisible(question, profile) && answers[question.id] !== 'na';
}

/**
 * The answer the scoring uses: a question hidden by the business profile (e.g. no connected equipment)
 * does not apply, the same as an explicit "na" answer.
 */
export function effectiveAnswer(question: Question, profile: Profile, answers: Answers): AnswerValue | undefined {
  return isVisible(question, profile) ? answers[question.id] : 'na';
}

export function visibleQuestions(profile: Profile, data: Dataset = defaultDataset): Question[] {
  return data.questions.filter((q) => isVisible(q, profile));
}

export function bandFor(risk: number): Band {
  if (risk >= 3) return 'High';
  if (risk >= 2) return 'Elevated';
  if (risk >= 1) return 'Moderate';
  return 'Low';
}

// ---------- Likelihood ----------

export interface LikelihoodFactor {
  questionId: string;
  answer: AnswerValue;
  value: number;
  weight: number;
  /** Multiplier applied to likelihood: 1 − weight × value */
  factor: number;
  /** Set when the question does not apply: hidden by the profile, or answered "does not apply" */
  notApplicable?: 'hidden' | 'answered';
}

export interface LikelihoodBreakdown {
  base: number;
  factors: LikelihoodFactor[];
  raw: number;
  final: number;
  clamped: boolean;
}

export function computeLikelihood(
  scenarioId: ScenarioId,
  profile: Profile,
  answers: Answers,
  data: Dataset = defaultDataset,
): LikelihoodBreakdown {
  const scenario = data.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario ${scenarioId}`);
  const sector = (profile.sector ?? 'farm') as Sector;
  const base = scenario.base[sector] ?? 0.5;

  const factors: LikelihoodFactor[] = [];
  let raw = base;
  for (const q of data.questions) {
    const weight = q.weights[scenarioId];
    if (!weight) continue;
    const answer = effectiveAnswer(q, profile, answers);
    if (!answer) continue;
    const value = answerValue(answer);
    const factor = 1 - weight * value;
    raw *= factor;
    const notApplicable = answer === 'na' ? (isVisible(q, profile) ? 'answered' : 'hidden') : undefined;
    factors.push({ questionId: q.id, answer, value, weight, factor, ...(notApplicable && { notApplicable }) });
  }
  const final = Math.max(MIN_LIKELIHOOD, raw);
  return { base, factors, raw, final, clamped: raw < MIN_LIKELIHOOD };
}

// ---------- Impact ----------

export interface ImpactModifier {
  label: string;
  delta: number;
}

export interface ImpactReductionApplied {
  questionId: string;
  answer: AnswerValue;
  /** Fraction removed, e.g. 0.15 for 15% */
  pct: number;
}

export interface ImpactBreakdown {
  start: number;
  modifiers: ImpactModifier[];
  beforeClamp: number;
  clamped: number;
  reductions: ImpactReductionApplied[];
  final: number;
}

export function computeImpact(
  scenarioId: ScenarioId,
  profile: Profile,
  answers: Answers,
  data: Dataset = defaultDataset,
): ImpactBreakdown {
  const rules = data.impactRules;
  const modifiers: ImpactModifier[] = [];
  let sum = rules.start;
  for (const rule of rules.rules) {
    const v = profile[rule.profile];
    const delta = rule.modifiers[scenarioId];
    if (v !== undefined && rule.in.includes(v) && delta) {
      modifiers.push({ label: rule.label, delta });
      sum += delta;
    }
  }
  const clamped = Math.min(rules.max, Math.max(rules.min, sum));

  const reductions: ImpactReductionApplied[] = [];
  let final = clamped;
  for (const q of data.questions) {
    const r = q.impactReduction?.[scenarioId];
    if (!r) continue;
    const answer = answers[q.id];
    // Impact reducers (an incident plan, insurance) only count when actually in place; "does not apply" earns nothing.
    if (!answer || answer === 'na' || !isVisible(q, profile)) continue;
    const pct = r * answerValue(answer);
    if (pct > 0) {
      final *= 1 - pct;
      reductions.push({ questionId: q.id, answer, pct });
    }
  }
  return { start: rules.start, modifiers, beforeClamp: sum, clamped, reductions, final };
}

// ---------- Risk ----------

export interface Contributor {
  questionId: string;
  label: string;
  answer: AnswerValue | undefined;
  /** How much protection is missing: weight × (1 − value) */
  gap: number;
}

export interface ScenarioResult {
  id: ScenarioId;
  name: string;
  short: string;
  description: string;
  likelihood: LikelihoodBreakdown;
  impact: ImpactBreakdown;
  risk: number;
  band: Band;
  contributors: Contributor[];
}

export interface Assessment {
  scenarios: ScenarioResult[]; // sorted by risk, highest first
  totalRisk: number;
  posture: { score: number; band: Band };
}

/** Questions that leave the most protection on the table for a scenario. */
export function topContributors(
  scenarioId: ScenarioId,
  profile: Profile,
  answers: Answers,
  data: Dataset = defaultDataset,
  limit = 3,
): Contributor[] {
  const out: Contributor[] = [];
  for (const q of data.questions) {
    if (!isVisible(q, profile)) continue;
    const w = q.weights[scenarioId] ?? 0;
    if (!w) continue;
    const answer = answers[q.id];
    const gap = w * (1 - answerValue(answer));
    if (gap > 0) out.push({ questionId: q.id, label: q.gapLabel, answer, gap });
  }
  return out.sort((a, b) => b.gap - a.gap).slice(0, limit);
}

export function assess(profile: Profile, answers: Answers, data: Dataset = defaultDataset): Assessment {
  const results: ScenarioResult[] = data.scenarios.map((s) => {
    const likelihood = computeLikelihood(s.id, profile, answers, data);
    const impact = computeImpact(s.id, profile, answers, data);
    const risk = likelihood.final * impact.final;
    return {
      id: s.id,
      name: s.name,
      short: s.short,
      description: s.description,
      likelihood,
      impact,
      risk,
      band: bandFor(risk),
      contributors: topContributors(s.id, profile, answers, data),
    };
  });
  results.sort((a, b) => b.risk - a.risk);
  const totalRisk = results.reduce((sum, r) => sum + r.risk, 0);
  // Overall posture is only as strong as the biggest single exposure.
  // (The original spec averaged the top 3, but that made "High" unreachable unless every answer was "no".)
  const score = results[0]?.risk ?? 0;
  return { scenarios: results, totalRisk, posture: { score, band: bandFor(score) } };
}

/** Questions the user answered "unsure" (visible ones only). */
export function unsureQuestions(profile: Profile, answers: Answers, data: Dataset = defaultDataset): Question[] {
  return visibleQuestions(profile, data).filter((q) => answers[q.id] === 'unsure');
}
