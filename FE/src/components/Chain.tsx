import { ChevronRight } from 'lucide-react';

/** How a risk plays out, step by step. The last step (the loss) is highlighted. */
export function Chain({ steps, className = '' }: { steps: string[]; className?: string }) {
  return (
    <ol className={`grid gap-2 md:auto-cols-fr md:grid-flow-col ${className}`}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={i} className="relative flex md:block">
            <div
              className={`flex h-full w-full gap-2.5 rounded-xl border p-3 text-sm leading-snug md:flex-col md:gap-1.5 ${
                last ? 'border-rose-200 bg-rose-50 font-semibold text-rose-900' : 'border-slate-200 bg-white text-slate-800'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${last ? 'bg-rose-600 text-white' : 'bg-slate-800 text-white'}`}
              >
                {i + 1}
              </span>
              <span>{s}</span>
            </div>
            {!last && (
              <ChevronRight
                aria-hidden
                className="absolute -right-2.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-slate-400 md:block"
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
