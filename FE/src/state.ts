import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { demoPersona, ranking } from './engine/data';
import type { DnsResult } from './engine/dns';
import type { Answers, AnswerValue, Expertise, Profile, RankingMode, TemplateId } from './engine/types';

export type Screen = 'landing' | 'template' | 'profile' | 'domain' | 'questions' | 'results' | 'summary';

export const DEFAULT_TEMPLATE: TemplateId = 'cccs-cis';

/** The chosen report template, for components deep in the tree (framework tags on fix cards). */
export const TemplateContext = createContext<TemplateId>(DEFAULT_TEMPLATE);
export const useTemplate = () => useContext(TemplateContext);

export interface AppState {
  screen: Screen;
  sectionIndex: number;
  company: string;
  domain: string;
  profile: Profile;
  answers: Answers;
  dns: DnsResult | null;
  /** Which fields were filled in by the domain check (cleared when the user overrides them). */
  autoFilled: { Q11?: boolean; emailProvider?: boolean };
  isDemo: boolean;
  /** How fixes are prioritized: effort only, or effort + cost */
  rankingMode: RankingMode;
  /** Framework the results and summary are reported against, chosen before the check-up */
  template: TemplateId;
  /** How much technical detail to show. Changes wording and layout only, never the scores. */
  expertise: Expertise;
}

const STORAGE_KEY = 'chain-of-custody:v1';

export const initialState: AppState = {
  screen: 'landing',
  sectionIndex: 0,
  company: '',
  domain: '',
  profile: {},
  answers: {},
  dns: null,
  autoFilled: {},
  isDemo: false,
  rankingMode: ranking.defaultMode,
  template: DEFAULT_TEMPLATE,
  expertise: 'basic',
};

// ?demo opens the demo company's results; ?demo=summary opens its Supplier Security Summary.
// Read once at startup (React may call the state initializer twice in development).
const demoParam = new URLSearchParams(window.location.search).get('demo');
if (demoParam !== null) window.history.replaceState(null, '', window.location.pathname);

function load(): AppState {
  if (demoParam !== null) return { ...demoState(), screen: demoParam === 'summary' ? 'summary' : 'results' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    return { ...initialState, ...(JSON.parse(raw) as Partial<AppState>) };
  } catch {
    return initialState;
  }
}

export function demoState(): AppState {
  return {
    screen: 'results',
    sectionIndex: 0,
    company: demoPersona.company,
    domain: demoPersona.domain,
    profile: { ...demoPersona.profile },
    answers: { ...demoPersona.answers },
    dns: demoPersona.dnsResult,
    autoFilled: { Q11: true, emailProvider: true },
    isDemo: true,
    rankingMode: ranking.defaultMode,
    template: DEFAULT_TEMPLATE,
    expertise: 'basic',
  };
}

export function useAppState() {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable (private mode); the app still works without it.
    }
  }, [state]);

  const update = useCallback((patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch })), []);

  const go = useCallback((screen: Screen, sectionIndex?: number) => {
    setState((s) => ({ ...s, screen, sectionIndex: sectionIndex ?? s.sectionIndex }));
    window.scrollTo({ top: 0 });
  }, []);

  const setProfile = useCallback((id: string, value: string) => {
    setState((s) => ({
      ...s,
      profile: { ...s.profile, [id]: value },
      autoFilled: id === 'emailProvider' ? { ...s.autoFilled, emailProvider: false } : s.autoFilled,
    }));
  }, []);

  const setAnswer = useCallback((id: string, value: AnswerValue) => {
    setState((s) => ({
      ...s,
      answers: { ...s.answers, [id]: value },
      autoFilled: id === 'Q11' ? { ...s.autoFilled, Q11: false } : s.autoFilled,
    }));
  }, []);

  /** Set several answers at once (a ladder prompt fills in more than one question). */
  const setAnswers = useCallback((values: Record<string, AnswerValue>) => {
    setState((s) => ({
      ...s,
      answers: { ...s.answers, ...values },
      autoFilled: 'Q11' in values ? { ...s.autoFilled, Q11: false } : s.autoFilled,
    }));
  }, []);

  const loadDemo = useCallback(() => {
    setState((s) => ({ ...demoState(), rankingMode: s.rankingMode, template: s.template, expertise: s.expertise }));
    window.scrollTo({ top: 0 });
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setState(initialState);
    window.scrollTo({ top: 0 });
  }, []);

  return { state, update, go, setProfile, setAnswer, setAnswers, loadDemo, reset };
}

export type AppApi = ReturnType<typeof useAppState>;
