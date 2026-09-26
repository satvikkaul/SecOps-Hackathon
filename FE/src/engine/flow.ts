import { dataset as defaultDataset, supplyChain as defaultSupplyChain, type SupplyChain } from './data';
import { answerValue, isApplicable, type Assessment } from './scoring';
import type { Answers, Dataset, Profile, ScenarioId } from './types';

export interface FlowNode {
  id: string;
  label: string;
  column: 0 | 1 | 2;
  value: number;
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
    ...gaps.map((g) => ({ id: g.q.id, label: g.q.gapLabel, column: 0 as const, value: g.total })),
    ...orderedScenarios.map((s) => ({ id: s.id, label: s.short, column: 1 as const, value: s.risk })),
    ...chain.impacts
      .filter((i) => impactIds.has(i.id))
      .map((i) => ({ id: i.id, label: i.label, column: 2 as const, value: sumTo(i.id) }))
      .sort((a, b) => b.value - a.value),
  ];
  return { nodes, links };
}
