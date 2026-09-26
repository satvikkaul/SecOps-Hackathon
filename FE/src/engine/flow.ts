import { dataset as defaultDataset, supplyChain as defaultSupplyChain, type SupplyChain } from './data';
import { answerValue, isApplicable, type Assessment } from './scoring';
import type { Answers, Dataset, Profile, ScenarioId } from './types';

/** Plain-language explanation shown when someone hovers a box in the diagram. */
export interface FlowInfo {
  /** Small caption above the title, e.g. "Security gap" */
  kind: string;
  title: string;
  body: string;
  /** Extra line, e.g. the scenario's risk level or the question it comes from */
  note?: string;
}

export interface FlowNode {
  id: string;
  label: string;
  column: 0 | 1 | 2;
  value: number;
  info: FlowInfo;
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
}

export interface FlowGraph {
  nodes: FlowNode[];
  links: FlowLink[];
}

/**
 * Three-column flow: security gaps → threat scenarios → supply chain impacts.
 * Gap→scenario link value = question weight × gap (1 − answer value).
 * Scenario→impact link value = link weight × scenario risk / 5.
 */
export function buildFlow(
  profile: Profile,
  answers: Answers,
  assessment: Assessment,
  maxGaps = 6,
  data: Dataset = defaultDataset,
  chain: SupplyChain = defaultSupplyChain,
): FlowGraph {
  const gaps = data.questions
    .filter((q) => isApplicable(q, profile, answers) && Object.keys(q.weights).length > 0)
    .map((q) => {
      const gap = 1 - answerValue(answers[q.id]);
      const total = Object.values(q.weights).reduce((s, w) => s + (w ?? 0) * gap, 0);
      return { q, gap, total };
    })
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, maxGaps);

  const links: FlowLink[] = [];
  const scenarioIds = new Set<ScenarioId>();
  for (const { q, gap } of gaps) {
    for (const [sid, w] of Object.entries(q.weights) as [ScenarioId, number][]) {
      const value = w * gap;
      if (value <= 0) continue;
      links.push({ source: q.id, target: sid, value });
      scenarioIds.add(sid);
    }
  }

  const riskById = Object.fromEntries(assessment.scenarios.map((s) => [s.id, s]));
  const impactIds = new Set<string>();
  // Keep scenarios in risk order so the diagram reads top-down by severity.
  const orderedScenarios = assessment.scenarios.filter((s) => scenarioIds.has(s.id));
  for (const s of orderedScenarios) {
    for (const [iid, w] of Object.entries(chain.links[s.id] ?? {})) {
      const value = (w * riskById[s.id].risk) / 5;
      if (value <= 0) continue;
      links.push({ source: s.id, target: iid, value });
      impactIds.add(iid);
    }
  }

  const sumTo = (id: string) => links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0);
  const nodes: FlowNode[] = [
    ...gaps.map((g) => ({
      id: g.q.id,
      label: g.q.gapLabel,
      column: 0 as const,
      value: g.total,
      info: {
        kind: 'Security gap',
        title: g.q.gapLabel,
        body: g.q.why,
        note: `From your answer to: “${g.q.text}”`,
      },
    })),
    ...orderedScenarios.map((s) => ({
      id: s.id,
      label: s.short,
      column: 1 as const,
      value: s.risk,
      info: {
        kind: 'What could happen',
        title: s.name,
        body: s.description,
        note: `Your risk: ${s.band} (${s.risk.toFixed(1)} of 5)`,
      },
    })),
    ...chain.impacts
      .filter((i) => impactIds.has(i.id))
      .map((i) => ({
        id: i.id,
        label: i.label,
        column: 2 as const,
        value: sumTo(i.id),
        info: { kind: 'Who else feels it', title: i.label, body: i.description },
      }))
      .sort((a, b) => b.value - a.value),
  ];
  return { nodes, links };
}
