import type { ChatContext } from '../chatContext';
import type { Catalog } from '../engine/data';
import type { DnsResult } from '../engine/dns';
import type { Snapshot } from '../engine/snapshot';
import type { Answers, Profile, RankingMode } from '../engine/types';
import type { PersonalizeRequest } from '../personalize';
import { ApiError, request } from './client';

export type ServerDnsResult = DnsResult & { checkedAt: string | null; cached: boolean };

export interface SharedAssessment {
  company: string;
  domain: string | null;
  rankingMode: RankingMode;
  results: Snapshot;
  dns: ServerDnsResult | null;
  createdAt: string;
}

export interface CreateShareRequest {
  company: string;
  domain: string | null;
  profile: Profile;
  answers: Answers;
  rankingMode: RankingMode;
  results: Snapshot;
}

export interface Personalized {
  profile: string;
  risks: { id: string; why: string }[];
  actions: { id: string; title: string; whatToDo: string; why: string; steps: string[] }[];
  cached: boolean;
}

export interface ChatRequest {
  /** Ties turns together server-side (in memory, not persisted). */
  sessionId: string;
  message: string;
  reportContext: ChatContext;
}

/** The questions, fixes, risks, and standards, from the BE's database. The browser revalidates with the
 * ETag, so unchanged content costs a 304. */
export const getCatalog = (signal?: AbortSignal) => request<Catalog>('/api/catalog', { signal });

/** Server-side lookup, cached and stored with the assessment. */
export const getDomainCheck = (domain: string, signal?: AbortSignal) =>
  request<ServerDnsResult>(`/api/dns/${encodeURIComponent(domain)}`, { signal });

export const createShare = async (body: CreateShareRequest) =>
  (await request<{ shareUrl: string }>('/api/assessments', { method: 'POST', body })).shareUrl;

/** null = no such link. */
export async function getShare(token: string, signal?: AbortSignal): Promise<SharedAssessment | null> {
  try {
    return await request<SharedAssessment>(`/api/share/${encodeURIComponent(token)}`, { signal });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Gemini's rewording of the engine's results. The BE answers 429/503 when it can't, or when the rewording fails validation. */
export const personalize = (body: PersonalizeRequest, signal?: AbortSignal) =>
  request<Personalized>('/api/personalize', { method: 'POST', body, signal });

export const sendChatMessage = async (body: ChatRequest) => (await request<{ reply: string }>('/api/chat', { method: 'POST', body })).reply;
