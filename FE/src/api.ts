import * as Sentry from '@sentry/react';
import type { ChatContext } from './chatContext';
import { checkDomain, type DnsResult } from './engine/dns';
import { buildSnapshot, type Snapshot } from './engine/snapshot';
import type { RankingMode } from './engine/types';
import type { AppState } from './state';

// Inlined at build time: set VITE_API_URL in Railway *before* the FE build.
const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export type ServerDnsResult = DnsResult & { checkedAt: string | null; cached: boolean };

export interface SharedAssessment {
  company: string;
  domain: string | null;
  rankingMode: RankingMode;
  results: Snapshot;
  dns: ServerDnsResult | null;
  createdAt: string;
}

/** Every BE call goes through this: reports the failure to Sentry (network error, CORS, bad
 * status, ...) before the caller's own try/catch turns it into a friendly on-screen message —
 * otherwise a gracefully-handled failure is invisible to us even though the user hit a real bug. */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, init);
  } catch (err) {
    Sentry.captureException(err, { tags: { api_path: path } });
    throw err;
  }
  if (!res.ok && res.status !== 404) {
    Sentry.captureException(new Error(`${path} failed (${res.status})`), { tags: { api_path: path, status: res.status } });
  }
  return res;
}

/** Server-side lookup (cached, and stored with the assessment); falls back to the browser DoH check if the BE is unreachable. */
export async function lookupDomain(domain: string): Promise<DnsResult> {
  if (API) {
    try {
      const res = await apiFetch(`/api/dns/${encodeURIComponent(domain)}`);
      if (res.ok) return (await res.json()) as ServerDnsResult;
    } catch {
      /* already reported by apiFetch; fall through to the client-side check */
    }
  }
  return checkDomain(domain);
}

export async function createShare(state: AppState): Promise<string> {
  const res = await apiFetch('/api/assessments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      company: state.company.trim() || 'Unnamed business',
      domain: state.domain || null,
      profile: state.profile,
      answers: state.answers,
      rankingMode: state.rankingMode,
      results: buildSnapshot(state.profile, state.answers, state.rankingMode),
    }),
  });
  if (!res.ok) throw new Error(`Share failed (${res.status})`);
  return ((await res.json()) as { shareUrl: string }).shareUrl;
}

/** null = no such link. */
export async function getShare(token: string): Promise<SharedAssessment | null> {
  const res = await apiFetch(`/api/share/${encodeURIComponent(token)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load (${res.status})`);
  return (await res.json()) as SharedAssessment;
}

export interface Personalized {
  profile: string;
  risks: { id: string; why: string }[];
  actions: { id: string; title: string; whatToDo: string; why: string; steps: string[] }[];
  cached: boolean;
}

/** Gemini's rewording of the engine's results, or null if unavailable (no BE, timeout, failed validation). */
export async function personalize(request: unknown): Promise<Personalized | null> {
  if (!API) return null;
  try {
    const res = await fetch(`${API}/api/personalize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    return res.ok ? ((await res.json()) as Personalized) : null;
  } catch {
    return null;
  }
}

/** Chat available on every screen. sessionId ties turns together server-side (in-memory, not persisted). */
export async function sendChatMessage(sessionId: string, message: string, reportContext: ChatContext): Promise<string> {
  const res = await apiFetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, message, reportContext }),
  });
  if (!res.ok) throw new Error(`Chat request failed (${res.status})`);
  return ((await res.json()) as { reply: string }).reply;
}
