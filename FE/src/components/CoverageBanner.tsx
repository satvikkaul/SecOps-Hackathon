import { ListChecks } from 'lucide-react';
import { firstOpenSection, minutesFor } from '../engine/prompts';
import type { Coverage } from '../engine/scoring';
import { useAppStore } from '../store/appStore';
import { Button } from './ui';

/** Sends the user into the full check-up at the first card they haven't answered. Answers carry over. */
export function useAnswerRest() {
  const profile = useAppStore((s) => s.profile);
  const answers = useAppStore((s) => s.answers);
  const update = useAppStore((s) => s.update);
  const go = useAppStore((s) => s.go);
  return () => {
    update({ tier: 'full' });
    go('questions', firstOpenSection(profile, answers));
  };
}

/** Shown while some questions are not asked yet: what the estimate rests on, and how to firm it up. */
export default function CoverageBanner({ coverage }: { coverage: Coverage }) {
  const answerRest = useAnswerRest();
  if (coverage.complete) return null;
  const left = coverage.notAsked.length;
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <div className="flex min-w-0 gap-3">
        <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden />
        <div>
          <div className="font-bold text-slate-900">
            Quick estimate, based on {coverage.answered} of {coverage.total} questions
          </div>
          <p className="text-sm text-slate-700">
            We've assumed the {left} we haven't asked about are partly in place, and left them out of your fixes and your standards summary. Answer them
            (about {minutesFor(left)} min) to firm up your score.
          </p>
        </div>
      </div>
      <Button onClick={answerRest} className="shrink-0">
        Answer the other {left}
      </Button>
    </div>
  );
}
