import { useMemo } from 'react';
import { buildPlan, prioritizeActions } from './engine/actions';
import { cccsStatuses, cioscStatuses, cisStatuses, otherPractices } from './engine/controls';
import { buildFlow } from './engine/flow';
import { assess, unsureQuestions } from './engine/scoring';
import type { Answers, Profile, RankingMode } from './engine/types';

export function useResults(profile: Profile, answers: Answers, mode: RankingMode) {
  return useMemo(() => {
    const assessment = assess(profile, answers);
    const ranked = prioritizeActions(profile, answers, undefined, mode);
    const cccs = cccsStatuses(profile, answers);
    return {
      assessment,
      ranked,
      plan: buildPlan(ranked),
      unsure: unsureQuestions(profile, answers),
      cccs,
      ciosc: cioscStatuses(cccs, profile, answers),
      cis: cisStatuses(profile, answers),
      otherPractices: otherPractices(profile, answers),
      flow: buildFlow(profile, answers, assessment),
    };
  }, [profile, answers, mode]);
}

export type Results = ReturnType<typeof useResults>;

const TIME_PHRASES: Record<string, string> = {
  'Under 1 hour': 'takes under an hour',
  'Half a day': 'takes about half a day',
  'A few days': 'takes a few days',
  Weeks: 'takes a few weeks',
};

export function timePhrase(time: string) {
  return TIME_PHRASES[time] ?? `takes ${time.toLowerCase()}`;
}
