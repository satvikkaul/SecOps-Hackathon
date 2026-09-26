export type Sector = 'farm' | 'processor' | 'coldstorage' | 'carrier' | 'broker';
export type ScenarioId = 'RANSOM' | 'BEC' | 'ATO' | 'OT' | 'THIRD' | 'DATALOSS' | 'SHARED';
export type AnswerValue = 'yes' | 'partial' | 'no' | 'unsure' | 'na';
export type Band = 'High' | 'Elevated' | 'Moderate' | 'Low';

/** Profile answers keyed by profile question id (sector, employees, ...). */
export type Profile = Record<string, string | undefined>;
/** Security answers keyed by question id (Q1..Q25). */
export type Answers = Record<string, AnswerValue | undefined>;

export interface Scenario {
  id: ScenarioId;
  name: string;
  short: string;
  /** Lower-case phrase used in sentences, e.g. "fake payment requests" */
  phrase: string;
  description: string;
  /** Security domain shown in the risk register's Category column */
  category: string;
  base: Record<Sector, number>;
}

export interface ShowIf {
  profile: string;
  in: string[];
}

export interface Question {
  id: string;
  section: string;
  /** Neutral short name, e.g. "Phone code on email" */
  topic: string;
  text: string;
  why: string;
  gapLabel: string;
  weights: Partial<Record<ScenarioId, number>>;
  impactReduction?: Partial<Record<ScenarioId, number>>;
  /** CCCS baseline controls this question provides evidence for. Empty = no CCCS control applies. */
  cccs: CccsMapping[];
  /** CIS Controls v8.1 safeguards this question provides evidence for. Empty = no safeguard applies. */
  cis: CisMapping[];
  /** Why a mapping is partial or absent. */
  mappingNote?: string;
  showIf?: ShowIf;
  autoFrom?: string;
}

/** direct = the question tests the requirement itself; partial = it covers only part of it, or supports it indirectly. */
export type MappingStrength = 'direct' | 'partial';

export interface CccsMapping {
  control: string; // e.g. "BC.5"
  reqs: string[]; // e.g. ["BC.5.1"]; may be empty when the question supports the control without meeting a specific requirement
  strength: MappingStrength;
}

export interface CisMapping {
  safeguard: string; // e.g. "6.3"
  strength: MappingStrength;
}

export interface CccsControl {
  id: string;
  name: string;
  requirements: { id: string; summary: string }[];
}

export interface CisSafeguard {
  id: string;
  title: string;
  /** Lowest Implementation Group the safeguard belongs to */
  ig: 1 | 2 | 3;
}

export interface Section {
  id: string;
  title: string;
  intro: string;
}

export interface ImpactRule {
  profile: string;
  in: string[];
  label: string;
  modifiers: Partial<Record<ScenarioId, number>>;
}

export interface ImpactRules {
  start: number;
  min: number;
  max: number;
  rules: ImpactRule[];
}

export interface Action {
  id: string;
  title: string;
  whatToDo: string;
  why: string;
  steps: string[];
  stepsByProvider?: Partial<Record<string, string[]>>;
  cost: string;
  time: string;
  effort: number;
  questionIds: string[];
}

export type RankingMode = 'effort' | 'cost';

export interface RankingConfig {
  defaultMode: RankingMode;
  modes: Record<RankingMode, { label: string; description: string; formula: string }>;
  costWeight: number;
  costPoints: Record<string, number>;
  essential: {
    description: string;
    maxImplementationGroup: number;
    /** CIS control number → plain-language reason shown on the fix */
    cisControls: Record<string, string>;
    latestTimeframe: 30 | 60 | 90;
  };
}

export interface Dataset {
  scenarios: Scenario[];
  questions: Question[];
  impactRules: ImpactRules;
  actions: Action[];
}
