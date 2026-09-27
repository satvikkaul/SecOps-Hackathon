import { queryOptions } from '@tanstack/react-query';
import { checkDomain } from '../engine/dns';
import { reportApiError } from '../lib/queryClient';
import type { PersonalizeRequest } from '../personalize';
import { hasApi } from './client';
import { getCatalog, getDomainCheck, getInvite, getMyReports, getShare, getSupplyChain, personalize } from './endpoints';

export const queryKeys = {
  catalog: ['catalog'] as const,
  share: (token: string) => ['share', token] as const,
  invite: (token: string) => ['invite', token] as const,
  supplyChain: (assessmentId: string) => ['supplyChain', assessmentId] as const,
  mine: ['mine'] as const,
  domainCheck: (domain: string) => ['domainCheck', domain] as const,
  personalize: (request: PersonalizeRequest) => ['personalize', request] as const,
};

/** Loaded once before the app renders; the content only changes with a deploy. */
export const catalogQuery = queryOptions({
  queryKey: queryKeys.catalog,
  queryFn: ({ signal }) => getCatalog(signal),
  staleTime: Infinity,
});

/** A shared snapshot never changes after it is created. */
export const shareQuery = (token: string) =>
  queryOptions({
    queryKey: queryKeys.share(token),
    queryFn: ({ signal }) => getShare(token, signal),
    staleTime: Infinity,
  });

/** The no-PIN existence/expired/completed check, run once when the invite link is opened. Not
 * cached across a PIN attempt — pinQuery below (a mutation, since it's a deliberate action) is
 * what re-checks with a PIN and gets the fuller response. */
export const inviteQuery = (token: string) =>
  queryOptions({
    queryKey: queryKeys.invite(token),
    queryFn: ({ signal }) => getInvite(token, undefined, signal),
    staleTime: Infinity,
    retry: false,
  });

/** Saved check-ups for the signed-in caller. Refetched when they save another one. */
export const myReportsQuery = () =>
  queryOptions({
    queryKey: queryKeys.mine,
    queryFn: ({ signal }) => getMyReports(signal),
    staleTime: 15_000,
  });

/** The buyer's view down their chain. Suppliers answer on their own schedule, so unlike the two
 * queries above this one is refetched rather than cached forever — and invalidated on a new invite. */
export const supplyChainQuery = (assessmentId: string) =>
  queryOptions({
    queryKey: queryKeys.supplyChain(assessmentId),
    queryFn: ({ signal }) => getSupplyChain(assessmentId, signal),
    staleTime: 30_000,
  });

/** Falls back to the browser's DNS-over-HTTPS check when the BE is unreachable, so this never fails. */
export const domainCheckQuery = (domain: string) =>
  queryOptions({
    queryKey: queryKeys.domainCheck(domain),
    queryFn: async ({ signal }) => {
      if (hasApi) {
        try {
          return await getDomainCheck(domain, signal);
        } catch (err) {
          if (signal.aborted) throw err;
          reportApiError(err);
        }
      }
      return checkDomain(domain);
    },
  });

/** The same request always gets the same rewording (the BE caches it too), so it is never refetched. */
export const personalizeQuery = (request: PersonalizeRequest) =>
  queryOptions({
    queryKey: queryKeys.personalize(request),
    queryFn: ({ signal }) => personalize(request, signal),
    staleTime: Infinity,
    retry: false,
    // Unavailable is a normal outcome: the results page shows the engine's own wording instead.
    meta: { silent: true },
  });
