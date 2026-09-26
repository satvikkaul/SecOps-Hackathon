import type { ReactNode } from 'react';
import type { Expertise } from '../engine/types';

export const EXPERTISE: { id: Expertise; label: string; short: string; description: string }[] = [
  { id: 'basic', label: 'Keep it simple', short: 'Simple', description: "I run the business. Tech isn't my thing, so skip the jargon." },
  { id: 'medium', label: 'Some tech know-how', short: 'Standard', description: 'I set up email, Wi-Fi, and accounts myself. Show me the numbers too.' },
  { id: 'expert', label: "I'm technical", short: 'Expert', description: 'IT or security background. Show control names, standards, and the math.' },
];

/** Radio cards for the onboarding question. */
export function ExpertisePicker({ value, onChange }: { value: Expertise; onChange: (e: Expertise) => void }) {
  return (
    <div role="radiogroup" aria-label="How much technical detail" className="grid gap-3 sm:grid-cols-3">
      {EXPERTISE.map((e) => {
        const selected = value === e.id;
        return (
          <button
            key={e.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(e.id)}
            className={`flex flex-col justify-start rounded-2xl border bg-white p-4 text-left shadow-sm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${
              selected ? 'border-brand-600 ring-2 ring-brand-600' : 'border-slate-200 hover:border-slate-400'
            }`}
          >
            <div className="font-bold text-slate-900">{e.label}</div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{e.description}</p>
          </button>
        );
      })}
    </div>
  );
}

/** Compact segmented control to switch the level on the results page. */
export function ExpertiseSwitch({ value, onChange }: { value: Expertise; onChange: (e: Expertise) => void }) {
  return (
    <div role="radiogroup" aria-label="Detail level" className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
      {EXPERTISE.map((e) => (
        <button
          key={e.id}
          type="button"
          role="radio"
          aria-checked={value === e.id}
          onClick={() => onChange(e.id)}
          className={`rounded-lg px-3 py-1 font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
            value === e.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {e.short}
        </button>
      ))}
    </div>
  );
}

/** The technical name of a control, for expert users. */
export function TechTag({ children }: { children: ReactNode }) {
  return <span className="mt-1.5 inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">{children}</span>;
}
