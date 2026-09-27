import { ExpertisePicker } from '../components/Expertise';
import { Button, ProgressBar } from '../components/ui';
import { visibleQuestions } from '../engine/scoring';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';

/**
 * First step: how technical the wording should be. The report standard (CCCS + CIS or CyberSecure Canada) is not asked
 * here: it only changes the report, so it defaults to CCCS + CIS and is switched on the Supplier Security Summary.
 */
export default function TemplateScreen() {
  const state = useAppStore(useShallow((s) => ({ profile: s.profile, answers: s.answers, expertise: s.expertise })));
  const update = useAppStore((s) => s.update);
  const go = useAppStore((s) => s.go);
  // Coming back from results should not restart the check-up.
  const finished = !!state.profile.sector && visibleQuestions(state.profile).every((q) => state.answers[q.id]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <ProgressBar value={0} label="Before you start" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900">How comfortable are you with tech?</h1>
      <p className="mt-1 text-lg text-slate-600">
        We'll word the questions and your results to match. Your scores come out the same either way, and you can switch any time on your results.
      </p>
      <div className="mt-6">
        <ExpertisePicker value={state.expertise} onChange={(expertise) => update({ expertise })} />
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => go(finished ? 'results' : 'landing')}>
          ← Back
        </Button>
        <Button onClick={() => go(finished ? 'results' : 'profile')} className="px-6 py-3">
          {finished ? 'Show my results →' : 'Continue →'}
        </Button>
      </div>
    </div>
  );
}
