import promptsJson from '../data/prompts.json';
import { dataset as defaultDataset } from './data';
import { isVisible } from './scoring';
import type { Answers, AnswerValue, Dataset, Profile } from './types';

/**
 * The questionnaire the user sees is a set of prompts (cards). Each prompt fills in one or more of the
 * underlying questions Q1–Q25, which are what the scoring engine and the standards mappings use.
 *
 * - "rows":   one card with a row per underlying question, each with its own answer labels.
 * - "ladder": one choice that sets several nested questions at once (e.g. backups → Q14 and Q15).
 * Every row and ladder also offers "Not sure". Some rows offer "does not apply" (na).
 */

export interface RowOption {
  value: Exclude<AnswerValue, 'unsure' | 'na'>;
  label: string;
}

export interface PromptRow {
  question: string;
  label: string;
  labelBySector?: Record<string, string>;
  options: RowOption[];
  /** Label for a "does not apply" answer, when the question can genuinely not apply */
  na?: string;
}

export interface LadderOption {
  label: string;
  sets: Record<string, AnswerValue>;
}

interface PromptBase {
  id: string;
  section: string;
  title: string;
  why: string;
}
export interface RowsPrompt extends PromptBase {
  type: 'rows';
  rows: PromptRow[];
}
export interface LadderPrompt extends PromptBase {
  type: 'ladder';
  questions: string[];
  options: LadderOption[];
}
export type Prompt = RowsPrompt | LadderPrompt;

export const promptIntro = promptsJson.intro;
export const prompts = promptsJson.prompts as Prompt[];

/** Underlying question ids a prompt fills in. */
export function promptQuestionIds(p: Prompt): string[] {
  return p.type === 'rows' ? p.rows.map((r) => r.question) : p.questions;
}

export function rowLabel(row: PromptRow, profile: Profile): string {
  return (profile.sector && row.labelBySector?.[profile.sector]) || row.label;
}

/**
 * Prompts with at least one visible question, with hidden rows removed.
 * Questions hidden by the profile do not apply and are never asked.
 */
export function visiblePrompts(profile: Profile, data: Dataset = defaultDataset, all: Prompt[] = prompts): Prompt[] {
  const visible = (id: string) => {
    const q = data.questions.find((x) => x.id === id);
    return !!q && isVisible(q, profile);
  };
  const out: Prompt[] = [];
  for (const p of all) {
    if (p.type === 'rows') {
      const rows = p.rows.filter((r) => visible(r.question));
      if (rows.length) out.push({ ...p, rows });
    } else if (p.questions.some(visible)) {
      out.push(p);
    }
  }
  return out;
}

/** The ladder option matching the current answers, or -1 (none chosen, "Not sure", or answers set some other way). */
export function ladderSelection(p: LadderPrompt, answers: Answers): number {
  return p.options.findIndex((o) => p.questions.every((q) => answers[q] === o.sets[q]));
}

export function ladderUnsure(p: LadderPrompt, answers: Answers): boolean {
  return p.questions.every((q) => answers[q] === 'unsure');
}

/** Answers to apply when a ladder option (or "Not sure") is chosen. */
export function ladderAnswers(p: LadderPrompt, choice: number | 'unsure'): Record<string, AnswerValue> {
  if (choice === 'unsure') return Object.fromEntries(p.questions.map((q) => [q, 'unsure' as AnswerValue]));
  return { ...p.options[choice].sets };
}

/** A prompt is complete when every visible question it covers has an answer. */
export function promptComplete(p: Prompt, answers: Answers): boolean {
  if (p.type === 'ladder') return ladderSelection(p, answers) >= 0 || ladderUnsure(p, answers);
  return p.rows.every((r) => !!answers[r.question]);
}
