import { useQuery } from '@tanstack/react-query';
import { hasApi } from './api/client';
import { personalizeQuery } from './api/queries';
import { profileQuestions, questionById } from './engine/data';
import { chainFor } from './engine/explain';
import { visibleQuestions } from './engine/scoring';
import type { AppState } from './store/appStore';
import type { Results } from './useResults';

/**
 * What Gemini gets: the engine's decisions (top risks, top fixes with their vetted steps) and the user's
 * profile and gaps. Never the company name or domain. The BE rejects any answer that reorders, adds, or
 * drops items, or that contains numbers not in this request.
 */
export function personalizeRequest(state: Pick<AppState, 'profile' | 'answers' | 'expertise'>, results: Results) {
  const { profile, answers } = state;
  const business: Record<string, string> = {};
  for (const q of profileQuestions) {
    const label = q.options.find((o) => o.value === profile[q.id])?.label;
    if (label) business[q.id] = label;
  }
  const gaps: string[] = [];
  const strengths: string[] = [];
  for (const q of visibleQuestions(profile)) {
    const a = answers[q.id];
    if (a === 'yes') strengths.push(q.topic);
    else if (a === 'partial') gaps.push(`${q.gapLabel} (partly)`);
    else if (a === 'no') gaps.push(q.gapLabel);
    else if (a === 'unsure') gaps.push(`${q.gapLabel} (not sure)`);
  }
  return {
    level: state.expertise,
    business,
    gaps,
    strengths,
    risks: results.assessment.scenarios.slice(0, 3).map((s) => ({
      id: s.id,
      name: s.name,
      band: s.band,
      chain: chainFor(s.id, profile),
      reasons: s.contributors.map((c) => c.label),
    })),
    actions: results.plan.top.map((r) => ({
      id: r.action.id,
      title: r.action.title,
      whatToDo: r.action.whatToDo,
      why: r.action.why,
      cost: r.action.cost,
      time: r.action.time,
      timeframe: r.timeframe,
      steps: r.steps,
      yourGaps: r.openQuestionIds.map((id) => questionById[id].gapLabel),
    })),
  };
}

export type PersonalizeRequest = ReturnType<typeof personalizeRequest>;
export type PersonalizeStatus = 'loading' | 'ready' | 'unavailable';

/** Gemini's rewording for the current results, keyed by the request so text written for a different level
 * or different answers is never shown. */
export function usePersonalized(request: PersonalizeRequest | null) {
  const enabled = hasApi && request !== null;
  const query = useQuery({ ...personalizeQuery(request!), enabled });
  const status: PersonalizeStatus = !enabled || query.isError ? 'unavailable' : query.isPending ? 'loading' : 'ready';
  return { status, data: status === 'ready' ? query.data! : null };
}
