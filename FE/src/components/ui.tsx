import { useState, type ReactNode } from 'react';
import type { Band, ScenarioId } from '../engine/types';

export const BAND_STYLES: Record<Band, { solid: string; soft: string; text: string; ring: string; dot: string; hex: string }> = {
  High: { solid: 'bg-rose-600 text-white', soft: 'bg-rose-50', text: 'text-rose-700', ring: 'border-rose-200', dot: 'bg-rose-500', hex: '#e11d48' },
  Elevated: { solid: 'bg-orange-500 text-white', soft: 'bg-orange-50', text: 'text-orange-700', ring: 'border-orange-200', dot: 'bg-orange-500', hex: '#f97316' },
  Moderate: { solid: 'bg-amber-400 text-amber-950', soft: 'bg-amber-50', text: 'text-amber-800', ring: 'border-amber-200', dot: 'bg-amber-400', hex: '#f59e0b' },
  Low: { solid: 'bg-emerald-600 text-white', soft: 'bg-emerald-50', text: 'text-emerald-700', ring: 'border-emerald-200', dot: 'bg-emerald-500', hex: '#059669' },
};

export const SCENARIO_COLORS: Record<ScenarioId, string> = {
  BEC: '#ea580c',
  RANSOM: '#e11d48',
  ATO: '#7c3aed',
  OT: '#0284c7',
  THIRD: '#0d9488',
  DATALOSS: '#4f46e5',
  SHARED: '#a16207',
  CARGO: '#be185d',
};

export function BandBadge({ band, size = 'md' }: { band: Band; size?: 'sm' | 'md' | 'lg' }) {
  const s = BAND_STYLES[band];
  const sz = size === 'lg' ? 'px-4 py-1.5 text-lg' : size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return <span className={`inline-flex items-center rounded-full font-semibold ${s.solid} ${sz}`}>{band}</span>;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-slate-300 disabled:text-slate-500',
    secondary: 'bg-white text-slate-800 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:text-slate-300',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, sub, icon }: { children: ReactNode; sub?: ReactNode; icon?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl" aria-hidden>
          {icon}
        </span>
      )}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{children}</h2>
        {sub && <p className="mt-1 text-slate-600">{sub}</p>}
      </div>
    </div>
  );
}

export function WhyWeAsk({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-900"
        aria-expanded={open}
      >
        <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span> Why we ask
      </button>
      {open && <p className="fade-in mt-1.5 max-w-3xl rounded-lg bg-brand-50 px-3 py-2 text-sm leading-relaxed text-slate-700">{children}</p>}
    </div>
  );
}

export function OptionCard({
  label,
  selected,
  onClick,
  icon,
  tone = 'neutral',
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  icon?: string;
  tone?: 'neutral' | 'yes' | 'partial' | 'no' | 'unsure';
}) {
  const selectedTone: Record<string, string> = {
    neutral: 'border-brand-600 bg-brand-50 text-brand-900 ring-2 ring-brand-600',
    yes: 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600',
    partial: 'border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-500',
    no: 'border-rose-500 bg-rose-50 text-rose-900 ring-2 ring-rose-500',
    unsure: 'border-slate-500 bg-slate-100 text-slate-900 ring-2 ring-slate-500',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-[3.25rem] items-center gap-3 rounded-xl border px-4 py-3 text-left font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${
        selected ? selectedTone[tone] : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
      }`}
    >
      {icon && <span className="text-xl" aria-hidden>{icon}</span>}
      <span>{label}</span>
      {selected && <span className="ml-auto text-lg" aria-hidden>✓</span>}
    </button>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      {label && <div className="mb-1.5 text-sm font-medium text-slate-600">{label}</div>}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 ${className}`}>{children}</span>;
}

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2.5 text-left">
      <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#256a58" />
        <rect x="6" y="12" width="11" height="8" rx="4" fill="none" stroke="#fff" strokeWidth="2.4" />
        <rect x="15" y="12" width="11" height="8" rx="4" fill="none" stroke="#acd9ca" strokeWidth="2.4" />
      </svg>
      <div className="leading-tight">
        <div className="font-bold text-slate-900">Chain of Custody</div>
        <div className="text-xs font-medium text-slate-500">Cyber risk check-up</div>
      </div>
    </button>
  );
}
