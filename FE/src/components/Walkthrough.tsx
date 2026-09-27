import { useState } from 'react';
import { Button } from './ui';

/** One step at a time, in large type, for owners doing the fix themselves. Ends with "mark this fix as done". */
export default function Walkthrough({ steps, onMarkDone, onClose }: { steps: string[]; onMarkDone?: () => void; onClose: () => void }) {
  const [i, setI] = useState(0);
  const finished = i >= steps.length;

  return (
    <div className="fade-in mt-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-5" role="region" aria-label="Step-by-step walkthrough">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-brand-800">{finished ? 'All steps done' : `Step ${i + 1} of ${steps.length}`}</span>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 hover:text-slate-800">
          Close
        </button>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {steps.map((_, n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n < i || finished ? 'bg-brand-600' : n === i ? 'bg-brand-300' : 'bg-slate-200'}`} />
        ))}
      </div>

      {finished ? (
        <div className="mt-4">
          <p className="text-lg leading-relaxed text-slate-800">Nice work. If everything went through, mark this fix as done and we'll update your risk.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {onMarkDone && <Button onClick={onMarkDone}>Mark this fix as done</Button>}
            <Button variant="ghost" onClick={() => setI(steps.length - 1)}>
              Back to the last step
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="min-h-[4.5rem] text-lg leading-relaxed text-slate-900" aria-live="polite">
            {steps[i]}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setI(i + 1)}>{i === steps.length - 1 ? 'Done, finish' : 'Done, next step'}</Button>
            {i > 0 && (
              <Button variant="ghost" onClick={() => setI(i - 1)}>
                Back
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
