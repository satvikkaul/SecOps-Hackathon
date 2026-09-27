import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { demoPersona, ranking, templates } from '../engine/data';
import type { DnsResult } from '../engine/dns';
import type { Tier } from '../engine/prompts';
import { withSector } from '../engine/profile';
import type { Answers, AnswerValue, Expertise, Profile, RankingMode, TemplateId } from '../engine/types';

export type Screen = 'landing' | 'template' | 'profile' | 'domain' | 'questions' | 'results' | 'summary' | 'reports';

export const DEFAULT_TEMPLATE: TemplateId = 'cccs-cis';

/** Everything about this business and its answers. Lives in memory only and is gone on refresh or tab close. */
export interface AssessmentState {
  screen: Screen;
  /** Quick check (the few questions that matter most) or the full check-up. Answers carry over when switching. */
  tier: Tier;
  sectionIndex: number;
  company: string;
  domain: string;
  profile: Profile;
  answers: Answers;
  dns: DnsResult | null;
  /** Which fields were filled in by the domain check (cleared when the user overrides them). */
  autoFilled: { Q11?: boolean; emailProvider?: boolean };
  isDemo: boolean;
  /** The id this check-up got when it was saved to the BE, or null while it only exists in the
   * browser. Supplier invites hang off it, so saving once and reusing the id keeps every invite
   * on the same row instead of creating a new assessment per invite. */
  assessmentId: string | null;
}

/** Display choices with nothing about the business in them. The only part of the store saved to localStorage. */
export interface Preferences {
  /** How fixes are prioritized: effort only, or effort + cost */
  rankingMode: RankingMode;
  /** Framework the results and summary are reported against, chosen before the check-up */
  template: TemplateId;
  /** How much technical detail to show. Changes wording and layout only, never the scores. */
  expertise: Expertise;
}

export type AppState = AssessmentState & Preferences;

interface AppActions {
  update: (patch: Partial<AppState>) => void;
  go: (screen: Screen, sectionIndex?: number) => void;
  setProfile: (id: string, value: string) => void;
  setAnswer: (id: string, value: AnswerValue) => void;
  /** Set several answers at once (a ladder prompt fills in more than one question). */
  setAnswers: (values: Record<string, AnswerValue>) => void;
  loadDemo: () => void;
  /** Begin a new check-up in the chosen tier. A quick check skips the wording step (it can be changed on the results). */
  startCheck: (tier: Tier) => void;
  /** Clears the assessment. Preferences are kept: they say nothing about the business. */
  reset: () => void;
}

export type AppStore = AppState & AppActions;

const PREFS_KEY = 'chain-of-custody:prefs';
/** Before the store existed, the whole assessment (answers included) was saved under this key. */
const LEGACY_KEY = 'chain-of-custody:v1';

const EXPERTISE: readonly Expertise[] = ['basic', 'medium', 'expert'];
const RANKING_MODES: readonly RankingMode[] = ['effort', 'cost'];

const defaultPreferences: Preferences = {
  rankingMode: ranking.defaultMode,
  template: DEFAULT_TEMPLATE,
  expertise: 'basic',
};

const emptyAssessment: AssessmentState = {
  screen: 'landing',
  tier: 'quick',
  sectionIndex: 0,
  company: '',
  domain: '',
  profile: {},
  answers: {},
  dns: null,
  autoFilled: {},
  isDemo: false,
  assessmentId: null,
};

function demoAssessment(screen: Screen = 'results'): AssessmentState {
  return {
    screen,
    tier: 'full',
    sectionIndex: 0,
    company: demoPersona.company,
    domain: demoPersona.domain,
    profile: { ...demoPersona.profile },
    answers: { ...demoPersona.answers },
    dns: demoPersona.dnsResult,
    autoFilled: { Q11: true, emailProvider: true },
    isDemo: true,
    // The seeded demo chain is looked up by this share token, not a uuid.
    assessmentId: 'demo-peel-valley',
  };
}

/** Keeps only known values, so a hand-edited or out-of-date saved entry can't put the app in a bad state. */
function sanitizePreferences(saved: unknown): Partial<Preferences> {
  if (!saved || typeof saved !== 'object') return {};
  const s = saved as Record<string, unknown>;
  const out: Partial<Preferences> = {};
  if (RANKING_MODES.includes(s.rankingMode as RankingMode)) out.rankingMode = s.rankingMode as RankingMode;
  if (templates.some((t) => t.id === s.template)) out.template = s.template as TemplateId;
  if (EXPERTISE.includes(s.expertise as Expertise)) out.expertise = s.expertise as Expertise;
  return out;
}

/** Carries the old saved preferences over and deletes the old entry, which also held the business's answers. */
function dropLegacyStorage() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw === null) return;
    if (localStorage.getItem(PREFS_KEY) === null) {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ state: sanitizePreferences(JSON.parse(raw)), version: 1 }));
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage can be unavailable (private mode) or the old entry unreadable; nothing to carry over.
  }
}

/** ?demo opens the demo company's results; ?demo=summary opens its Supplier Security Summary. */
function initialAssessment(): AssessmentState {
  if (typeof window === 'undefined') return emptyAssessment;
  const demo = new URLSearchParams(window.location.search).get('demo');
  if (demo === null) return emptyAssessment;
  window.history.replaceState(null, '', window.location.pathname);
  return demoAssessment(demo === 'summary' ? 'summary' : 'results');
}

function scrollToTop() {
  if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
}

dropLegacyStorage();

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      ...initialAssessment(),
      ...defaultPreferences,

      update: (patch) => set(patch),

      go: (screen, sectionIndex) => {
        set((s) => ({ screen, sectionIndex: sectionIndex ?? s.sectionIndex }));
        scrollToTop();
      },

      setProfile: (id, value) =>
        set((s) => ({
          profile: id === 'sector' ? withSector(s.profile, value) : { ...s.profile, [id]: value },
          autoFilled: id === 'emailProvider' ? { ...s.autoFilled, emailProvider: false } : s.autoFilled,
        })),

      setAnswer: (id, value) =>
        set((s) => ({
          answers: { ...s.answers, [id]: value },
          autoFilled: id === 'Q11' ? { ...s.autoFilled, Q11: false } : s.autoFilled,
        })),

      setAnswers: (values) =>
        set((s) => ({
          answers: { ...s.answers, ...values },
          autoFilled: 'Q11' in values ? { ...s.autoFilled, Q11: false } : s.autoFilled,
        })),

      loadDemo: () => {
        set(demoAssessment());
        scrollToTop();
      },

      startCheck: (tier) => {
        set({ ...emptyAssessment, tier, screen: tier === 'quick' ? 'profile' : 'template' });
        scrollToTop();
      },

      reset: () => {
        set(emptyAssessment);
        scrollToTop();
      },
    }),
    {
      name: PREFS_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Preferences => ({ rankingMode: s.rankingMode, template: s.template, expertise: s.expertise }),
      merge: (saved, current) => ({ ...current, ...sanitizePreferences(saved) }),
    },
  ),
);

/** The current report template, for components deep in the tree (framework tags on fix cards). */
export const useTemplate = () => useAppStore((s) => s.template);

// ---------- Surviving the magic-link redirect ----------
// Signing in requires a full page reload back to this origin (the magic link is opened outside
// the app), which wipes AssessmentState — it's memory-only by design. So the one caller that needs
// the assessment to still be there afterwards (Results' "Save your score", for someone not yet
// signed in) stashes just enough of it first; main.tsx restores it once the reload confirms a
// session, then saves it the same way "Save your score" always has.

const PENDING_SAVE_KEY = 'chain-of-custody:pendingSave';

interface PendingSave {
  company: string;
  domain: string;
  profile: Profile;
  answers: Answers;
  rankingMode: RankingMode;
}

/** Called right before opening the sign-in modal from "Save your score" — nowhere else needs this. */
export function stashPendingSave() {
  const s = useAppStore.getState();
  const pending: PendingSave = { company: s.company, domain: s.domain, profile: s.profile, answers: s.answers, rankingMode: s.rankingMode };
  try {
    sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(pending));
  } catch {
    // Storage can be unavailable (private mode); the sign-in itself still works, just without the redo.
  }
}

/** Reads and clears the stash, if any. Sessionstorage is already scoped to this one browser
 * session/tab, so there's never more than one pending save and nothing to key it by. */
export function takePendingSave(): PendingSave | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SAVE_KEY);
    if (raw === null) return null;
    sessionStorage.removeItem(PENDING_SAVE_KEY);
    return JSON.parse(raw) as PendingSave;
  } catch {
    return null;
  }
}

// Set once, before Results ever mounts (main.tsx's boot sequence completes before it's imported),
// so a plain module variable is enough — no need for this to be reactive Zustand state.
let autoSaved = false;
export const markAssessmentAutoSaved = () => void (autoSaved = true);
export const wasAssessmentAutoSaved = () => autoSaved;
