// Regenerate the seeded demo snapshot from the FE engine: cd FE && npx vite-node ../BE/gen_demo.ts > ../BE/app/demo_peel_valley.json
import { assess, prioritizeActions, buildPlan, cccsStatuses, demoPersona, dataset } from '../FE/src/engine/index';
const p = demoPersona.profile as any, a = demoPersona.answers as any;
const as = assess(p, a);
const plan = buildPlan(prioritizeActions(p, a, undefined, 'effort'));
const q = Object.fromEntries(dataset.questions.map((x) => [x.id, x]));
const out = {
  company: demoPersona.company, domain: demoPersona.domain, profile: p, answers: a, rankingMode: 'effort',
  results: {
    posture: as.posture,
    scenarios: as.scenarios.map((s) => ({ id: s.id, name: s.name, risk: +s.risk.toFixed(2), band: s.band })),
    topActions: plan.top.map((r) => ({ id: r.action.id, title: r.action.title, whatToDo: r.action.whatToDo, cost: r.action.cost, time: r.action.time, effort: r.action.effort,
      priority: +r.priority.toFixed(3), pctReduction: +r.pctReduction.toFixed(3), timeframe: r.timeframe,
      cccs: [...new Set(r.action.questionIds.flatMap((id) => q[id].cccs.flatMap((c) => c.reqs)))] })),
    cccs: cccsStatuses(p, a).map((c) => ({ control: c.id, name: c.name, status: c.status })),
  },
  dns: demoPersona.dnsResult,
};
console.log(JSON.stringify(out, null, 2));
