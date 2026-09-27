import { questionById, sections } from './engine/data';
import { promptQuestionIds, visiblePrompts } from './engine/prompts';
import { buildSnapshot, type Snapshot } from './engine/snapshot';
import type { AppState } from './store/appStore';

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
}

/** What the chatbot is told about where the user is, so it can act as a product guide on the
 * starter/questionnaire screens and switch to explaining the actual report once one exists. */
export function buildChatContext(state: AppState): ChatContext {
  if ((state.screen === 'results' || state.screen === 'summary') && state.profile.sector) {
    return { screen: state.screen, report: buildSnapshot(state.profile, state.answers, state.rankingMode) };
  }
  const questions = currentQuestions(state);
  return questions ? { screen: state.screen, currentQuestions: questions } : { screen: state.screen };
}
