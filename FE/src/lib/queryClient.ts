import * as Sentry from '@sentry/react';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

interface RequestMeta extends Record<string, unknown> {
  /** The UI treats failure as a normal outcome, so it is not reported. */
  silent?: boolean;
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: RequestMeta;
    mutationMeta: RequestMeta;
  }
}

/** Reports a failure the user was shown a friendly message for, which would otherwise be invisible to us. */
export function reportApiError(error: unknown) {
  if (error instanceof ApiError) Sentry.captureException(error, { tags: { api_path: error.path, status: error.status ?? 'no response' } });
  else Sentry.captureException(error);
}

const MAX_RETRIES = 2;

/** Only retry what can succeed next time: no response, or a 5xx. A 4xx will fail the same way again. */
export function shouldRetry(failureCount: number, error: unknown) {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== null && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient() {
  const report = (error: unknown, meta: RequestMeta | undefined) => {
    if (!meta?.silent) reportApiError(error);
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => report(error, query.meta) }),
    mutationCache: new MutationCache({ onError: (error, _variables, _result, mutation) => report(error, mutation.meta) }),
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false, staleTime: 5 * 60_000 },
      // Sharing and chat are not idempotent, so a failed send is left to the user to retry.
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
