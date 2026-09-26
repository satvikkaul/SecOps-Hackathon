// Builds docs/standards-mapping.json from the app's data files, for human review.
// Run: npm run export:mappings
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const cccs = read('src/data/cccs.json');
const cis = read('src/data/cis.json');
const { sections, questions } = read('src/data/questions.json');
const actions = read('src/data/actions.json');
const scenarios = read('src/data/scenarios.json');
const { prompts } = read('src/data/prompts.json');
const scenarioName = Object.fromEntries(scenarios.map((s) => [s.id, s.name]));

/** Where each question is asked in the questionnaire, and the answers offered. */
const askedIn = (qid) => {
  for (const p of prompts) {
    if (p.type === 'rows') {
      const row = p.rows.find((r) => r.question === qid);
      if (row)
        return {
          card: p.id,
          cardTitle: p.title,
          label: row.label,
          labelBySector: row.labelBySector ?? null,
          answers: [...row.options.map((o) => ({ value: o.value, label: o.label })), ...(row.na ? [{ value: 'na', label: row.na }] : []), { value: 'unsure', label: 'Not sure' }],
        };
    } else if (p.questions.includes(qid)) {
      return {
        card: p.id,
        cardTitle: p.title,
        label: p.title,
        combinedWith: p.questions.filter((q) => q !== qid),
        answers: [...p.options.map((o) => ({ label: o.label, value: o.sets[qid] })), { value: 'unsure', label: 'Not sure' }],
      };
    }
  }
  return null;
};

/** The risks a question changes: likelihood weights and impact reductions. */
const affectsRisks = (q) => [
  ...Object.entries(q.weights).map(([s, w]) => ({ risk: s, riskName: scenarioName[s], effect: 'likelihood', weight: w })),
  ...Object.entries(q.impactReduction ?? {}).map(([s, r]) => ({ risk: s, riskName: scenarioName[s], effect: 'impact', reductionWhenYes: r })),
];

const sectionTitle = Object.fromEntries(sections.map((s) => [s.id, s.title]));
const reqSummary = Object.fromEntries(cccs.controls.flatMap((c) => c.requirements.map((r) => [r.id, r.summary])));
const controlName = Object.fromEntries(cccs.controls.map((c) => [c.id, c.name]));
const safeguard = Object.fromEntries(cis.safeguards.map((s) => [s.id, s]));
const actionsFor = (qid) => actions.filter((a) => a.questionIds.includes(qid)).map((a) => ({ id: a.id, title: a.title }));

const byNum = (a, b) => a.localeCompare(b, undefined, { numeric: true });

/** Same rule the app uses: direct mappings, or the first listed mapping if all are partial. */
const primaryControls = (q) => {
  const direct = [...new Set(q.cccs.filter((m) => m.strength === 'direct').map((m) => m.control))];
  return direct.length ? direct : q.cccs.slice(0, 1).map((m) => m.control);
};

// ---------- By question ----------
const byQuestion = questions.map((q) => ({
  id: q.id,
  section: sectionTitle[q.section],
  topic: q.topic,
  question: q.text,
  shownOnlyIf: q.showIf ? `${q.showIf.profile} is ${q.showIf.in.join(' or ')}` : null,
  askedIn: askedIn(q.id),
  affectsRisks: affectsRisks(q),
  cccs: q.cccs.map((m) => ({
    control: m.control,
    controlName: controlName[m.control],
    strength: m.strength,
    primary: primaryControls(q).includes(m.control),
    requirements: m.reqs.map((r) => ({ id: r, summary: reqSummary[r] })),
  })),
  cis: q.cis.map((m) => ({
    safeguard: m.safeguard,
    title: safeguard[m.safeguard].title,
    implementationGroup: safeguard[m.safeguard].ig,
    strength: m.strength,
  })),
  mappingNote: q.mappingNote ?? null,
  fixedByActions: actionsFor(q.id),
}));

// ---------- By CCCS control ----------
const byCccsControl = cccs.controls.map((c) => {
  const mapped = questions.filter((q) => q.cccs.some((m) => m.control === c.id));
  const cisIds = new Set();
  for (const q of mapped) if (primaryControls(q).includes(c.id)) q.cis.forEach((m) => cisIds.add(m.safeguard));
  const requirements = c.requirements.map((r) => {
    const qs = questions.flatMap((q) =>
      q.cccs.filter((m) => m.reqs.includes(r.id)).map((m) => ({ questionId: q.id, topic: q.topic, strength: m.strength })),
    );
    return { id: r.id, summary: r.summary, assessed: qs.length > 0, questions: qs };
  });
  return {
    id: c.id,
    name: c.name,
    requirementsTotal: c.requirements.length,
    requirementsAssessed: requirements.filter((r) => r.assessed).length,
    requirements,
    // Questions that count toward the control's status, including any mapped without a specific requirement
    questionsCountingTowardStatus: mapped.map((q) => ({
      questionId: q.id,
      topic: q.topic,
      strength: q.cccs.some((m) => m.control === c.id && m.strength === 'direct') ? 'direct' : 'partial',
    })),
    relatedCisSafeguards: [...cisIds].sort(byNum),
  };
});

// ---------- By CIS safeguard ----------
const byCisSafeguard = [...cis.safeguards]
  .sort((a, b) => byNum(a.id, b.id))
  .map((s) => {
    const control = s.id.split('.')[0];
    return {
      id: s.id,
      title: s.title,
      control: Number(control),
      controlName: cis.controls[control],
      implementationGroup: s.ig,
      questions: questions.flatMap((q) =>
        q.cis.filter((m) => m.safeguard === s.id).map((m) => ({ questionId: q.id, topic: q.topic, strength: m.strength })),
      ),
    };
  });

// ---------- Gaps ----------
const gaps = {
  cccsControlsNotAssessed: byCccsControl.filter((c) => c.questionsCountingTowardStatus.length === 0).map((c) => `${c.id} ${c.name}`),
  cccsRequirementsNotAssessed: byCccsControl.flatMap((c) => c.requirements.filter((r) => !r.assessed).map((r) => `${r.id} ${r.summary}`)),
  questionsWithNoCccsMapping: questions.filter((q) => q.cccs.length === 0).map((q) => ({ id: q.id, topic: q.topic, reason: q.mappingNote })),
  questionsWithNoCisMapping: questions.filter((q) => q.cis.length === 0).map((q) => ({ id: q.id, topic: q.topic, reason: q.mappingNote })),
};

const totalReqs = byCccsControl.reduce((n, c) => n + c.requirementsTotal, 0);
const assessedReqs = byCccsControl.reduce((n, c) => n + c.requirementsAssessed, 0);
const allMaps = questions.flatMap((q) => [...q.cccs, ...q.cis]);

const out = {
  title: 'Chain of Custody: CCCS and CIS standards mapping',
  generatedFrom: ['src/data/questions.json', 'src/data/cccs.json', 'src/data/cis.json', 'src/data/actions.json'],
  sources: {
    cccs: { name: cccs.source, url: cccs.url },
    cis: { name: cis.source, url: cis.url },
  },
  howToRead: {
    strength: {
      direct: 'The question tests the requirement or safeguard itself.',
      partial: 'The question covers only part of the requirement, or supports it indirectly. See mappingNote.',
    },
    primary:
      "A question's primary CCCS control is its direct mapping (or its first mapping if all are partial). CIS safeguards are cross-referenced to a CCCS control only through questions for which it is primary.",
    statusRule:
      'Per control or safeguard, over visible and answered questions: all Yes = Met; all No or Not sure = Not yet met; any other mix = Partially met; no questions = Not assessed.',
    notApplicable:
      'Questions hidden by shownOnlyIf, or answered "does not apply" (na), count as no exposure for likelihood (value 1) and do not count toward any control status or fix list.',
    answerValues: 'Yes = 1, Partly = 0.5, No = 0, Not sure = 0 (and listed as worth checking), Does not apply = 1 for likelihood only.',
    implementationGroup: 'CIS Implementation Group: 1 = essential cyber hygiene, 2 and 3 = progressively larger or more mature organizations.',
  },
  summary: {
    questions: questions.length,
    cccsControls: cccs.controls.length,
    cccsControlsAssessed: byCccsControl.filter((c) => c.questionsCountingTowardStatus.length > 0).length,
    cccsRequirements: totalReqs,
    cccsRequirementsAssessed: assessedReqs,
    cisSafeguardsMapped: cis.safeguards.length,
    cisSafeguardsByImplementationGroup: {
      ig1: cis.safeguards.filter((s) => s.ig === 1).length,
      ig2: cis.safeguards.filter((s) => s.ig === 2).length,
      ig3: cis.safeguards.filter((s) => s.ig === 3).length,
    },
    mappings: {
      total: allMaps.length,
      direct: allMaps.filter((m) => m.strength === 'direct').length,
      partial: allMaps.filter((m) => m.strength === 'partial').length,
    },
  },
  byQuestion,
  byCccsControl,
  byCisSafeguard,
  gaps,
};

mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs/standards-mapping.json'), JSON.stringify(out, null, 2) + '\n');
console.log('Wrote docs/standards-mapping.json', out.summary);
