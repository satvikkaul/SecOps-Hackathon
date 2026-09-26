import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
