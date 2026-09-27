import { questionById, sections } from './engine/data';
import { promptQuestionIds, visiblePrompts } from './engine/prompts';
import { effectiveAnswer } from './engine/scoring';
import { buildSnapshot, type Snapshot } from './engine/snapshot';
import type { AppState } from './store/appStore';

/** One control per "Try an example" scenario (see ReportChat.tsx), nothing more: the chat has no
 * other way to see the person's actual answer to a specific control (BE tools only look up static
 * reference data, not per-user state), so the FE hands over just these few rather than the whole
 * questionnaire. Q7/Q8 (payment redirect), Q1/Q9 (phishing link), Q18 (vendor remote access), Q26
 * (load redirect). */
const SCENARIO_CONTROL_IDS = ['Q1', 'Q7', 'Q8', 'Q9', 'Q18', 'Q26'] as const;

function scenarioControls(state: AppState) {
  return SCENARIO_CONTROL_IDS.map((id) => {
    const q = questionById[id];
    const answer = effectiveAnswer(q, state.profile, state.answers);
    return { id, topic: q.topic, answer: answer ?? 'not answered' };
  });
}

/** The check-up questions currently on screen, so the chatbot can answer "what does this mean?"
 * without the user having to name a question id. */
function currentQuestions(state: AppState) {
  if (state.screen !== 'questions') return undefined;
  const idx = Math.min(state.sectionIndex, sections.length - 1);
  const section = sections[idx];
  const ids = visiblePrompts(state.profile)
    .filter((p) => p.section === section.id)
    .flatMap(promptQuestionIds);
  return ids.map((id) => {
    const q = questionById[id];
    return { id, topic: q.topic, text: q.text, why: q.why };
  });
}

export interface ChatContext {
  screen: string;
  /** Only present once there's a real report to discuss (Results/Summary, and only after the profile step). */
  report?: Snapshot;
  /** Only present on the questionnaire screen: the questions visible in the current section. */
  currentQuestions?: { id: string; topic: string; text: string; why: string }[];
  /** Only present alongside a report: the person's actual answers to the controls the "Try an example" scenarios check. */
  controls?: { id: string; topic: string; answer: string }[];
}

/** What the chatbot is told about where the user is, so it can act as a product guide on the
 * starter/questionnaire screens and switch to explaining the actual report once one exists. */
export function buildChatContext(state: AppState): ChatContext {
  if ((state.screen === 'results' || state.screen === 'summary') && state.profile.sector) {
    return {
      screen: state.screen,
      report: buildSnapshot(state.profile, state.answers, state.rankingMode),
      controls: scenarioControls(state),
    };
  }
  const questions = currentQuestions(state);
  return questions ? { screen: state.screen, currentQuestions: questions } : { screen: state.screen };
}
