import * as Sentry from '@sentry/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { catalogQuery } from './api/queries';
import BootScreen from './components/BootScreen';
import { setCatalog, type Catalog } from './engine/data';
import './index.css';
import { queryClient } from './lib/queryClient';
import { isSharePage, scrubShareTokens } from './lib/sentryScrub';
import { startAuthListener } from './store/authStore';

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

/** The app's modules read the catalog when they are first imported, so App is imported only after it has loaded. */
const CATALOG_TIMEOUT_MS = 6000;

/** The live catalog from the BE, or the copy bundled at build time if the BE is down or slow, so the check-up
 * itself never depends on the backend being up (sharing and personalization still do). */
async function loadCatalog(): Promise<Catalog> {
  try {
    return await Promise.race([
      queryClient.fetchQuery(catalogQuery),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('catalog timed out')), CATALOG_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.warn('Catalog unavailable from the API, using the bundled copy.', err);
    const fallback = (await import('./data/catalogFallback.json')).default as unknown as Catalog;
    queryClient.setQueryData(catalogQuery.queryKey, fallback);
    return fallback;
  }
}

async function boot() {
  root.render(<BootScreen />);
  try {
    setCatalog(await loadCatalog());
  } catch {
    root.render(<BootScreen failed onRetry={boot} />);
    return;
  }
  const { default: App } = await import('./App');
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void boot();
