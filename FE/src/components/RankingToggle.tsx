import { ranking } from '../engine/data';
import type { RankingMode } from '../engine/types';

const MODES: RankingMode[] = ['effort', 'cost'];

/** Switch between the two ways of prioritizing fixes. */
export default function RankingToggle({ mode, onChange }: { mode: RankingMode; onChange: (m: RankingMode) => void }) {
  return (
    <div className="no-print rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span id="rank-by" className="text-sm font-semibold text-slate-700">
          Prioritize by
        </span>
        <div role="radiogroup" aria-labelledby="rank-by" className="inline-flex rounded-xl bg-slate-100 p-1">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onChange(m)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                mode === m ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {ranking.modes[m].label}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-slate-500">Priority = {ranking.modes[mode].formula}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{ranking.modes[mode].description}</p>
    </div>
  );
}
