import * as Sentry from '@sentry/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { catalogQuery } from './api/queries';
import BootScreen from './components/BootScreen';
import { setCatalog } from './engine/data';
import './index.css';
import { queryClient } from './lib/queryClient';
import { isSharePage, scrubShareTokens } from './lib/sentryScrub';
import { supabase } from './lib/supabaseClient';
import { startAuthListener } from './store/authStore';

const QueryDevtools = import.meta.env.DEV
  ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: () => <m.ReactQueryDevtools buttonPosition="top-right" /> })))
  : () => null;

Sentry.init({
  dsn: 'https://9fbcc11a8b19f02d52ef68580e59f2f7@o4509746519474176.ingest.us.sentry.io/4512154703233024',
  integrations: [
    Sentry.browserTracingIntegration(),
    // A recording of a shared summary would copy that company's report to Sentry.
    ...(isSharePage() ? [] : [Sentry.replayIntegration()]),
    Sentry.feedbackIntegration({ colorScheme: 'system' }),
  ],
  beforeSend: scrubShareTokens,
  beforeSendTransaction: scrubShareTokens,
  beforeBreadcrumb: scrubShareTokens,
  tracesSampleRate: 1.0, // fine for a hackathon demo; would need real sampling in production
  tracePropagationTargets: ['localhost', 'imaginative-tenderness-production-be96.up.railway.app'],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

declare global {
  interface Window {
    /** Manual smoke test only — not wired to any UI. Run from the browser console to confirm
     * errors reach the Sentry dashboard, without leaving a "break the world" button in the app. */
    __testSentryError?: () => void;
  }
}
window.__testSentryError = () => {
  throw new Error('Sentry test error (triggered manually from the browser console)');
};

startAuthListener();

const root = ReactDOM.createRoot(document.getElementById('root')!);

/** Signing in from "Save your score" stashes the assessment (store/appStore.ts) because the
 * magic-link redirect wipes it; this is the other half, run once on boot. No stash, no-op.
 *
 * Imports appStore.ts (and api/hooks.ts, which also reaches it) dynamically, not at module top
 * level: both read engine/data.ts's catalog bindings (e.g. `ranking.defaultMode`) as soon as
 * they're evaluated, and those are `undefined` until setCatalog() below has run. A static import
 * here would run before that and crash — the same reason App itself is a dynamic import. */
async function restorePendingSave() {
  const { takePendingSave } = await import('./store/appStore');
  const pending = takePendingSave();
  if (!pending) return;
  root.render(<BootScreen message="Signing you in and saving your report…" />);
  // detectSessionInUrl (supabaseClient.ts) resolves the magic link's token into a session as part
  // of the client's own init, which getSession() waits on — this reflects that, not a stale value.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return; // no session to save under; they land on Landing same as before this fix
  const [{ useAppStore, markAssessmentAutoSaved }, { createShare }, { shareRequest }] = await Promise.all([
    import('./store/appStore'),
    import('./api/endpoints'),
    import('./api/hooks'),
  ]);
  useAppStore.setState({ ...pending, screen: 'results' });
  try {
    await createShare(shareRequest(useAppStore.getState()));
    markAssessmentAutoSaved();
  } catch {
    // Left unsaved on purpose: Results' own "Save your score" retries with this same restored state.
  }
}

/** The app's modules read the catalog when they are first imported, so App is imported only after it has loaded. */
async function boot() {
  root.render(<BootScreen />);
  try {
    setCatalog(await queryClient.fetchQuery(catalogQuery));
  } catch {
    root.render(<BootScreen failed onRetry={boot} />);
    return;
  }
  await restorePendingSave();
  const { default: App } = await import('./App');
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        <Suspense>
          <QueryDevtools />
        </Suspense>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void boot();
