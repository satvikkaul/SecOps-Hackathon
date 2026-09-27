import * as Sentry from '@sentry/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { catalogQuery } from './api/queries';
import BootScreen from './components/BootScreen';
import { setCatalog } from './engine/data';
import './index.css';
import { queryClient } from './lib/queryClient';
import { startAuthListener } from './store/authStore';

const QueryDevtools = import.meta.env.DEV
  ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: () => <m.ReactQueryDevtools buttonPosition="top-right" /> })))
  : () => null;

Sentry.init({
  dsn: 'https://9fbcc11a8b19f02d52ef68580e59f2f7@o4509746519474176.ingest.us.sentry.io/4512154703233024',
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration(), Sentry.feedbackIntegration({ colorScheme: 'system' })],
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
async function boot() {
  root.render(<BootScreen />);
  try {
    setCatalog(await queryClient.fetchQuery(catalogQuery));
  } catch {
    root.render(<BootScreen failed onRetry={boot} />);
    return;
  }
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
