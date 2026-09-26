import { Logo, Button } from './components/ui';
import { TemplateContext, useAppState } from './state';
import Landing from './screens/Landing';
import TemplateScreen from './screens/TemplateScreen';
import ProfileScreen from './screens/ProfileScreen';
import DomainCheck from './screens/DomainCheck';
import Questionnaire from './screens/Questionnaire';
import Results from './screens/Results';
import Summary from './screens/Summary';
import SharedSummary from './screens/SharedSummary';

// ?share=<token> opens a partner's read-only view instead of the app.
const shareToken = new URLSearchParams(window.location.search).get('share');

export default function App() {
  const app = useAppState();
  const { state, go, reset } = app;

  const confirmReset = () => {
    if (window.confirm('Start over? This clears all your answers on this computer.')) reset();
  };

  if (shareToken)
    return (
      <div className="min-h-screen">
        <header className="no-print border-b border-slate-200 bg-white/90">
          <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            <Logo onClick={() => window.location.assign('/')} />
          </div>
        </header>
        <SharedSummary token={shareToken} />
      </div>
    );

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo onClick={() => go('landing')} />
          {state.screen !== 'landing' && (
            <div className="flex items-center gap-1">
              {state.isDemo && (
                <span className="mr-2 hidden rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 sm:inline">Demo company</span>
              )}
              <Button variant="ghost" onClick={confirmReset} className="px-3 py-1.5 text-sm">
                Start over
              </Button>
            </div>
          )}
        </div>
      </header>

      <main>
        <TemplateContext.Provider value={state.template}>
          {state.screen === 'landing' && <Landing app={app} />}
          {state.screen === 'template' && <TemplateScreen app={app} />}
          {state.screen === 'profile' && <ProfileScreen app={app} />}
          {state.screen === 'domain' && <DomainCheck app={app} />}
          {state.screen === 'questions' && <Questionnaire app={app} />}
          {state.screen === 'results' && <Results app={app} onReset={confirmReset} />}
          {state.screen === 'summary' && <Summary app={app} />}
        </TemplateContext.Provider>
      </main>

      <footer className="no-print mx-auto max-w-6xl px-6 py-10 text-center text-sm text-slate-500">
        Scores are calculated in your browser. To word your results for you, your answers (never your company name or domain) are sent to Google Gemini. A share link is only created when you ask for one.
      </footer>
    </div>
  );
}
