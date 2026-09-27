import { ChevronRight } from 'lucide-react';

/** How a risk plays out, step by step. The last step (the loss) is highlighted. */
export function Chain({ steps, className = '' }: { steps: string[]; className?: string }) {
  return (
    <ol className={`grid gap-3 md:auto-cols-fr md:grid-flow-col md:gap-5 ${className}`}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex md:block">
            <div
              className={`flex h-full w-full gap-3 rounded-xl border p-4 text-sm leading-relaxed md:flex-col md:gap-2 ${
                last ? 'border-amber-200 bg-amber-50 font-medium text-amber-950' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  last ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {i + 1}
              </span>
              <span>{s}</span>
            </div>
            {!last && (
              <ChevronRight
                aria-hidden
                className="absolute -right-4 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-slate-300 md:block"
                strokeWidth={2.5}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** One-line version for tight spaces: first step … last step. */
export function ChainLine({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  const first = steps[0];
  const last = steps[steps.length - 1];
  return (
    <p className="text-sm leading-relaxed text-slate-600">
      {first} <span className="text-slate-400">→ … →</span> <b className="font-semibold text-rose-800">{last}</b>
    </p>
  );
}
