import demoPersonaJson from '../data/demoPersona.json';
import type { RuleSheet } from '../printRule';
import type { Prompt } from './prompts';
import type {
  Action,
  CccsControl,
  CioscSection,
  CisSafeguard,
  Dataset,
  RankingConfig,
  ImpactRules,
  Question,
  ReportTemplate,
  Scenario,
  ScenarioId,
  Section,
  Answers,
  Profile,
  TemplateId,
} from './types';

export interface ProfileOption {
  value: string;
  label: string;
  icon?: string;
}
export interface ProfileQuestion {
  id: string;
  text: string;
  why: string;
  options: ProfileOption[];
}

export interface SupplyChain {
  impacts: { id: string; label: string; description: string }[];
  links: Record<ScenarioId, Record<string, number>>;
}

export interface CccsCatalog {
  source: string;
  url: string;
  controls: CccsControl[];
}
export interface CisCatalog {
  source: string;
  url: string;
  controls: Record<string, string>;
  safeguards: CisSafeguard[];
}
export interface CioscCatalog {
  source: string;
  url: string;
  groups: Record<string, string>;
  sections: CioscSection[];
}

/** The check-up's content, as served by GET /api/catalog (one key per source file in BE/app/catalog/). */
export interface Catalog {
  actions: Action[];
  cccs: CccsCatalog;
  cis: CisCatalog;
  ciosc: CioscCatalog;
  impactRules: ImpactRules;
  profile: ProfileQuestion[];
  prompts: { intro: string; prompts: Prompt[] };
  questions: { sections: Section[]; questions: Question[] };
  ranking: RankingConfig;
  rules: RuleSheet[];
  scenarios: Scenario[];
  supplyChain: SupplyChain;
  templates: ReportTemplate[];
}

// Live bindings, assigned once by setCatalog() before the app (or a test) imports anything that reads them.
export let scenarios: Scenario[];
export let questions: Question[];
export let sections: Section[];
export let impactRules: ImpactRules;
export let actions: Action[];
export let cccs: CccsCatalog;
export let cis: CisCatalog;
export let ciosc: CioscCatalog;
export let templates: ReportTemplate[];
export let templateById: Record<TemplateId, ReportTemplate>;
export let ranking: RankingConfig;
export let cisById: Record<string, CisSafeguard>;
export let profileQuestions: ProfileQuestion[];
export let supplyChain: SupplyChain;
export let promptIntro: string;
export let prompts: Prompt[];
export let rules: RuleSheet[];
export let dataset: Dataset;
export let scenarioById: Record<ScenarioId, Scenario>;
export let questionById: Record<string, Question>;
export let actionById: Record<string, Action>;

export function setCatalog(c: Catalog): void {
  scenarios = c.scenarios;
  questions = c.questions.questions;
  sections = c.questions.sections;
  impactRules = c.impactRules;
  actions = c.actions;
  cccs = c.cccs;
  cis = c.cis;
  ciosc = c.ciosc;
  templates = c.templates;
  templateById = Object.fromEntries(templates.map((t) => [t.id, t])) as Record<TemplateId, ReportTemplate>;
  ranking = c.ranking;
  cisById = Object.fromEntries(cis.safeguards.map((s) => [s.id, s]));
  profileQuestions = c.profile;
  supplyChain = c.supplyChain;
  promptIntro = c.prompts.intro;
  prompts = c.prompts.prompts;
  rules = c.rules;
  dataset = { scenarios, questions, impactRules, actions };
  scenarioById = Object.fromEntries(scenarios.map((s) => [s.id, s])) as Record<ScenarioId, Scenario>;
  questionById = Object.fromEntries(questions.map((q) => [q.id, q]));
  actionById = Object.fromEntries(actions.map((a) => [a.id, a]));
}

export interface DemoPersona {
  company: string;
  location: string;
  blurb: string;
  domain: string;
  profile: Profile;
  answers: Answers;
  notes: Record<string, string>;
  dnsResult: import('./dns').DnsResult;
}
/** Bundled, not served: the demo must never depend on the network. */
export const demoPersona = demoPersonaJson as unknown as DemoPersona;
