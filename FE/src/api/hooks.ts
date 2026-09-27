import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buildChatContext } from '../chatContext';
import { demoPersona } from '../engine/data';
import type { DnsResult } from '../engine/dns';
import { buildSnapshot } from '../engine/snapshot';
import { useAppStore, type AppState } from '../store/appStore';
import { createShare, sendChatMessage, type CreateShareRequest } from './endpoints';
import { domainCheckQuery, shareQuery } from './queries';

export function useSharedAssessment(token: string) {
  return useQuery(shareQuery(token));
}

/** Checks a domain on request; repeat checks of the same domain are served from the cache. */
export function useDomainCheck() {
  const client = useQueryClient();
  return useMutation({
    // The demo company uses stored results so the demo never depends on the network.
    mutationFn: (domain: string): Promise<DnsResult> =>
      domain === demoPersona.domain ? Promise.resolve(demoPersona.dnsResult) : client.fetchQuery(domainCheckQuery(domain)),
  });
}

export function shareRequest(state: Pick<AppState, 'company' | 'domain' | 'profile' | 'answers' | 'rankingMode'>): CreateShareRequest {
  return {
    company: state.company.trim() || 'Unnamed business',
    domain: state.domain || null,
    profile: state.profile,
    answers: state.answers,
    rankingMode: state.rankingMode,
    results: buildSnapshot(state.profile, state.answers, state.rankingMode),
  };
}

/** Saves a snapshot of the current assessment; resolves to the read-only link. */
export function useCreateShare() {
  return useMutation({ mutationFn: () => createShare(shareRequest(useAppStore.getState())) });
}

/** Sends one chat turn with whatever is on screen right now as context; resolves to the reply. */
export function useSendChatMessage(sessionId: string) {
  return useMutation({
    mutationFn: (message: string) => sendChatMessage({ sessionId, message, reportContext: buildChatContext(useAppStore.getState()) }),
  });
}
