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
  /** null = never expires (the demo company). */
  expiresAt: string | null;
}

export type ShareLookup = { status: 'found'; assessment: SharedAssessment } | { status: 'missing' } | { status: 'expired' };

export interface CreatedShare {
  /** The saved row's id. Also what a supplier invite hangs off, via `parentAssessmentId`. */
  id: string;
  shareUrl: string;
  expiresAt: string;
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

/** What GET /api/invites/{token} returns. Only `expired`/`completed`/`verified` are present without
 * (or with a wrong) PIN — the rest requires the correct one, so a wrong guess learns nothing else. */
export interface InviteStatus {
  expired: boolean;
  completed: boolean;
  verified: boolean;
  inviterCompany?: string;
  level?: number;
  deadline?: string;
  status?: 'pending' | 'submitted' | 'filled_by_buyer' | 'timed_out';
}

export type InviteLookup = { status: 'found'; invite: InviteStatus } | { status: 'missing' };

export type ShareChoice = 'score' | 'report' | 'both';

export interface SubmitInviteRequest extends CreateShareRequest {
  pin: string;
  shareChoice: ShareChoice;
  filledByBuyer: boolean;
}

/** The questions, fixes, risks, and standards, from the BE's database. The browser revalidates with the
 * ETag, so unchanged content costs a 304. */
export const getCatalog = (signal?: AbortSignal) => request<Catalog>('/api/catalog', { signal });

/** Server-side lookup, cached and stored with the assessment. */
export const getDomainCheck = (domain: string, signal?: AbortSignal) =>
  request<ServerDnsResult>(`/api/dns/${encodeURIComponent(domain)}`, { signal });

export const createShare = (body: CreateShareRequest) => request<CreatedShare>('/api/assessments', { method: 'POST', body });

/** A wrong or expired link is an answer, not a failure. */
export async function getShare(token: string, signal?: AbortSignal): Promise<ShareLookup> {
  try {
    return { status: 'found', assessment: await request<SharedAssessment>(`/api/share/${encodeURIComponent(token)}`, { signal }) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { status: 'missing' };
    if (err instanceof ApiError && err.status === 410) return { status: 'expired' };
    throw err;
  }
}

/** Gemini's rewording of the engine's results. The BE answers 429/503 when it can't, or when the rewording fails validation. */
export const personalize = (body: PersonalizeRequest, signal?: AbortSignal) =>
  request<Personalized>('/api/personalize', { method: 'POST', body, signal });

export const sendChatMessage = async (body: ChatRequest) => (await request<{ reply: string }>('/api/chat', { method: 'POST', body })).reply;

/** A wrong or unknown token is an answer, not a failure, same as getShare. */
export async function getInvite(token: string, pin?: string, signal?: AbortSignal): Promise<InviteLookup> {
  const query = pin ? `?pin=${encodeURIComponent(pin)}` : '';
  try {
    return { status: 'found', invite: await request<InviteStatus>(`/api/invites/${encodeURIComponent(token)}${query}`, { signal }) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { status: 'missing' };
    throw err;
  }
}

export const submitInvite = (token: string, body: SubmitInviteRequest) =>
  request<{ assessmentId: string }>(`/api/invites/${encodeURIComponent(token)}/submit`, { method: 'POST', body });

export interface CreateInviteRequest {
  parentAssessmentId: string;
  supplierName: string;
  supplierEmail: string;
  deadlineDays?: number;
}

export interface CreatedInvite {
  inviteId: string;
  inviteUrl: string;
  emailSent: boolean;
  stubbed: boolean;
  /** Only present when the email didn't go out, so the buyer can pass the PIN on themselves.
   * Never returned alongside a successful send — then the supplier's inbox is the only copy. */
  pin?: string;
}

export const createInvite = (body: CreateInviteRequest) => request<CreatedInvite>('/api/invites', { method: 'POST', body });

/** One row of the buyer's supply chain. `shared` holds only the fields that supplier's share_choice
 * allows — the BE decides that, so anything absent here was never sent to the browser at all. */
export interface SupplyChainSupplier {
  level: number;
  status: 'pending' | 'submitted' | 'filled_by_buyer' | 'timed_out';
  supplierName: string;
  shareChoice: ShareChoice | null;
  shared: Partial<Snapshot>;
}

export interface SupplyChain {
  invited: number;
  responded: number;
  respondedPct: number;
  /** The worst band among suppliers who shared a score; null when nobody has. */
  highestRiskBand: Snapshot['posture']['band'] | null;
  suppliers: SupplyChainSupplier[];
}

export const getSupplyChain = (assessmentId: string, signal?: AbortSignal) =>
  request<SupplyChain>(`/api/assessments/${encodeURIComponent(assessmentId)}/supply-chain`, { signal });
