import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buildChatContext } from '../chatContext';
import { demoPersona } from '../engine/data';
import type { DnsResult } from '../engine/dns';
import { buildSnapshot } from '../engine/snapshot';
import { useAppStore, type AppState } from '../store/appStore';
import {
  createInvite,
  createShare,
  getInvite,
  sendChatMessage,
  submitInvite,
  type CreateShareRequest,
  type CreatedShare,
  type ShareChoice,
} from './endpoints';
import { domainCheckQuery, inviteQuery, queryKeys, shareQuery, supplyChainQuery } from './queries';

export function useSharedAssessment(token: string) {
  return useQuery(shareQuery(token));
}

/** The no-PIN check, run once when the invite link opens. */
export function useInviteStatus(token: string) {
  return useQuery(inviteQuery(token));
}

/** Submitting a PIN is a deliberate action (and may be wrong), so this is a mutation, not the query above. */
export function useVerifyInvitePin(token: string) {
  return useMutation({ mutationFn: (pin: string) => getInvite(token, pin) });
}

/** Submits the supplier's completed assessment. Same payload createShare/useCreateShare sends,
 * plus the PIN (verified server-side again) and what the supplier chose to share. */
export function useSubmitInvite(token: string) {
  return useMutation({
    mutationFn: (body: { pin: string; shareChoice: ShareChoice; filledByBuyer: boolean }) =>
      submitInvite(token, { ...shareRequest(useAppStore.getState()), ...body }),
  });
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

/** Saves a snapshot of the current assessment; resolves to the read-only link and when it expires.
 * Remembers the new row's id so a later supplier invite hangs off this same assessment. */
export function useCreateShare() {
  return useMutation({ mutationFn: saveAssessment });
}

async function saveAssessment(): Promise<CreatedShare> {
  const created = await createShare(shareRequest(useAppStore.getState()));
  useAppStore.getState().update({ assessmentId: created.id });
  return created;
}

/** Invites a supplier to complete their own check-up. The invite has to hang off a saved row, so
 * this saves the check-up first if it hasn't been saved yet — the buyer only sees one action. */
export function useInviteSupplier() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (supplier: { supplierName: string; supplierEmail: string }) => {
      const parentAssessmentId = useAppStore.getState().assessmentId ?? (await saveAssessment()).id;
      const invite = await createInvite({ ...supplier, parentAssessmentId });
      await client.invalidateQueries({ queryKey: queryKeys.supplyChain(parentAssessmentId) });
      return invite;
    },
  });
}

/** The buyer's chain, once this check-up has been saved. Idle until then — there's nothing to ask for. */
export function useSupplyChain(assessmentId: string | null) {
  return useQuery({ ...supplyChainQuery(assessmentId ?? ''), enabled: !!assessmentId });
}

/** Sends one chat turn with whatever is on screen right now as context; resolves to the reply. */
export function useSendChatMessage(sessionId: string) {
  return useMutation({
    mutationFn: (message: string) => sendChatMessage({ sessionId, message, reportContext: buildChatContext(useAppStore.getState()) }),
  });
}
