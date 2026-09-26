import scenariosJson from '../data/scenarios.json';
import questionsJson from '../data/questions.json';
import impactRulesJson from '../data/impactRules.json';
import actionsJson from '../data/actions.json';
import profileJson from '../data/profile.json';
import cccsJson from '../data/cccs.json';
import cisJson from '../data/cis.json';
import cioscJson from '../data/ciosc.json';
import templatesJson from '../data/templates.json';
import rankingJson from '../data/ranking.json';
import supplyChainJson from '../data/supplyChain.json';
import demoPersonaJson from '../data/demoPersona.json';
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

export const scenarios = scenariosJson as Scenario[];
export const questions = questionsJson.questions as Question[];
export const sections = questionsJson.sections as Section[];
export const impactRules = impactRulesJson as ImpactRules;
export const actions = actionsJson as Action[];
export const cccs = cccsJson as { source: string; url: string; controls: CccsControl[] };
export const cis = cisJson as { source: string; url: string; controls: Record<string, string>; safeguards: CisSafeguard[] };
export const ciosc = cioscJson as { source: string; url: string; groups: Record<string, string>; sections: CioscSection[] };
export const templates = templatesJson as ReportTemplate[];
export const templateById = Object.fromEntries(templates.map((t) => [t.id, t])) as Record<TemplateId, ReportTemplate>;
export const ranking = rankingJson as RankingConfig;
export const cisById =Object.fromEntries(cis.safeguards.map((s) => [s.id, s])) as Record<string, CisSafeguard>;

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
export const profileQuestions = profileJson as ProfileQuestion[];

export interface SupplyChain {
  impacts: { id: string; label: string }[];
  links: Record<ScenarioId, Record<string, number>>;
}
export const supplyChain = supplyChainJson as SupplyChain;

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
export const demoPersona = demoPersonaJson as unknown as DemoPersona;

export const dataset: Dataset = { scenarios, questions, impactRules, actions };

export const scenarioById = Object.fromEntries(scenarios.map((s) => [s.id, s])) as Record<ScenarioId, Scenario>;
export const questionById = Object.fromEntries(questions.map((q) => [q.id, q])) as Record<string, Question>;
export const actionById = Object.fromEntries(actions.map((a) => [a.id, a])) as Record<string, Action>;
