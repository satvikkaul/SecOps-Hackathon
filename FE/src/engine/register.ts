import { dataset as defaultDataset } from './data';
import type { RankedAction } from './actions';
import { answerValue, isApplicable, type Assessment } from './scoring';
import type { Answers, Dataset, Profile, ScenarioId } from './types';

/** Column headers of the "Risk Register Template" sheet in the OCI DCC Cybersecurity Workbook, so rows paste straight in. */
export const REGISTER_COLUMNS = [
  'Risk ID',
  'Risk Last Reviewed',
  'Risk Description',
  'Category',
  'Likelihood (1-5)',
  'Impact (1-5)',
  'Risk Level',
  'Target Risk Score',
  'Mitigation Strategy',
  'Action Plan',
  'Owner',
  'Status',
  'Deadline',
] as const;

/** The workbook's default target: bring every risk down to Low. */
export const TARGET_RISK_SCORE = '<= 5';
const PLAN_FIXES = 3;

export type RegisterLevel = 'Low' | 'Moderate' | 'High';
export type Treatment = 'Mitigate' | 'Accept';
export type RegisterStatus = 'Mitigation Not Started' | 'Monitor';

export interface RegisterRow {
  riskId: string;
  lastReviewed: string;
  description: string;
  category: string;
  likelihood: number;
  impact: number;
  riskLevel: number;
  level: RegisterLevel;
  targetRiskScore: string;
  treatment: Treatment;
  actionPlan: string;
  owner: string;
  status: RegisterStatus;
  deadline: string;
}

const clamp15 = (n: number) => Math.min(5, Math.max(1, n));

/** Likelihood 0–1 to the workbook's 1–5 scale in equal fifths: up to 20% is 1, over 80% is 5. */
export function registerLikelihood(likelihood: number): number {
  return clamp15(Math.ceil(likelihood * 5 - 1e-9));
}

/** Impact is already on a 1–5 scale; reductions from insurance or an incident plan can make it fractional. */
export function registerImpact(impact: number): number {
  return clamp15(Math.round(impact));
}

/** The workbook's bands for likelihood × impact: 1–5 Low, 6–10 Moderate, 11–25 High. */
export function registerLevel(score: number): RegisterLevel {
  if (score >= 11) return 'High';
  if (score >= 6) return 'Moderate';
  return 'Low';
}

/** The workbook's "mmm d, yyyy" date format. */
export function registerDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** The open fixes that lower one scenario the most; ties keep the active ranking order. */
export function fixesFor(id: ScenarioId, ranked: RankedAction[], limit = PLAN_FIXES): RankedAction[] {
  const drop = (r: RankedAction) => {
    const d = r.scenarioDeltas.find((x) => x.id === id);
    return d ? d.before - d.after : 0;
  };
  return ranked
    .filter((r) => drop(r) > 0)
    .sort((a, b) => drop(b) - drop(a))
    .slice(0, limit);
}

/**
 * One register row per risk scenario, highest risk first. The action plan lists the open fixes that
 * lower that scenario the most; the deadline is when the last of them is due.
 */
export function buildRiskRegister(
  assessment: Assessment,
  ranked: RankedAction[],
  profile: Profile,
  answers: Answers,
  today: Date = new Date(),
  data: Dataset = defaultDataset,
): RegisterRow[] {
  return assessment.scenarios.map((s, i) => {
    const likelihood = registerLikelihood(s.likelihood.final);
    const impact = registerImpact(s.impact.final);
    const riskLevel = likelihood * impact;
    const level = registerLevel(riskLevel);

    const helping = data.questions
      .filter((q) => q.weights[s.id] && isApplicable(q, profile, answers) && answerValue(answers[q.id]) > 0)
      .map((q) => (answers[q.id] === 'partial' ? `${q.topic} (partly)` : q.topic));
    const gaps = s.contributors.map((c) => c.label);
    const description = [
      `${s.name}. ${data.scenarios.find((x) => x.id === s.id)?.description ?? ''}`,
      gaps.length ? `Main gaps: ${gaps.join('; ')}.` : '',
      helping.length ? `Already helping: ${helping.join('; ')}.` : '',
      `Self-assessed score ${s.risk.toFixed(1)} (${s.band}): likelihood ${Math.round(s.likelihood.final * 100)}%, impact ${s.impact.final.toFixed(1)} of 5.`,
    ]
      .filter(Boolean)
      .join(' ');

    const fixes = fixesFor(s.id, ranked);
    const treatment: Treatment = fixes.length > 0 ? 'Mitigate' : 'Accept';
    const actionPlan = fixes.length
      ? fixes.map((r, n) => `${n + 1}. ${r.action.title} (within ${r.timeframe} days): ${r.action.whatToDo}`).join(' ')
      : 'No open fixes on our list. Review again at least once a year.';

    return {
      riskId: `R${String(i + 1).padStart(3, '0')}`,
      lastReviewed: registerDate(today),
      description,
      category: data.scenarios.find((x) => x.id === s.id)?.category ?? '',
      likelihood,
      impact,
      riskLevel,
      level,
      targetRiskScore: TARGET_RISK_SCORE,
      treatment,
      actionPlan,
      owner: '',
      status: treatment === 'Mitigate' ? 'Mitigation Not Started' : 'Monitor',
      deadline: fixes.length ? registerDate(addDays(today, Math.max(...fixes.map((r) => r.timeframe)))) : '',
    };
  });
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a UTF-8 byte order mark so Excel shows accented characters and ÷ correctly. */
export function registerCsv(rows: RegisterRow[]): string {
  const lines = [
    REGISTER_COLUMNS.join(','),
    ...rows.map((r) =>
      [
        r.riskId,
        r.lastReviewed,
        r.description,
        r.category,
        r.likelihood,
        r.impact,
        r.riskLevel,
        r.targetRiskScore,
        r.treatment,
        r.actionPlan,
        r.owner,
        r.status,
        r.deadline,
      ]
        .map(csvCell)
        .join(','),
    ),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
