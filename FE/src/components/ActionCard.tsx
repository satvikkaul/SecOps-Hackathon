import { Clock, Coins, Printer } from 'lucide-react';
import { useState } from 'react';
import type { RankedAction } from '../engine/actions';
import { scenarioById, scenarios } from '../engine/data';
import type { Expertise } from '../engine/types';
import { ChainLine } from './Chain';
import FrameworkTags from './FrameworkTags';
import { BandBadge, Pill, SCENARIO_COLORS } from './ui';

export function pct(x: number) {
  const v = x * 100;
  return v >= 10 ? `${Math.round(v)}%` : `${v.toFixed(1).replace(/\.0$/, '')}%`;
}

function CostTime({ r, showEffort = true }: { r: RankedAction; showEffort?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill className="bg-emerald-50 text-emerald-800">
        <Coins className="h-3.5 w-3.5" aria-hidden /> {r.action.cost}
      </Pill>
      <Pill>
        <Clock className="h-3.5 w-3.5" aria-hidden /> {r.action.time}
      </Pill>
      {showEffort && <Pill>Effort {r.action.effort}/5</Pill>}
    </div>
  );
}

export function ScenarioChips({ r, limit = 4 }: { r: RankedAction; limit?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {r.scenarioDeltas.slice(0, limit).map((d) => (
        <span
          key={d.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: SCENARIO_COLORS[d.id] }} />
          {scenarioById[d.id].short}
        </span>
      ))}
    </div>
  );
}

export function WhatIf({ r }: { r: RankedAction }) {
  const changed = r.postureBefore.band !== r.postureAfter.band;
  return (
    <div className="fade-in mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
        <span>If you do this, overall:</span>
        <BandBadge band={r.postureBefore.band} size="sm" />
        <span aria-hidden>→</span>
        <BandBadge band={r.postureAfter.band} size="sm" />
        {!changed && <span className="font-normal text-slate-600">(your biggest risk is still in the same band, but lower)</span>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-1 font-semibold">Risk</th>
            <th className="pb-1 font-semibold">Now</th>
            <th className="pb-1 font-semibold">After</th>
          </tr>
        </thead>
        <tbody>
          {r.scenarioDeltas.map((d) => (
            <tr key={d.id} className="border-t border-sky-100">
              <td className="py-1.5 pr-2 font-medium text-slate-800">{scenarioById[d.id].short}</td>
              <td className="py-1.5 pr-2">
                <span className="inline-flex items-center gap-2">
                  <BandBadge band={d.beforeBand} size="sm" />
                  <span className="tabular-nums text-slate-500">{d.before.toFixed(2)}</span>
                </span>
              </td>
              <td className="py-1.5">
                <span className="inline-flex items-center gap-2">
                  <BandBadge band={d.afterBand} size="sm" />
                  <span className="tabular-nums text-slate-500">{d.after.toFixed(2)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-slate-700">
        Total risk across all {scenarios.length} scenarios drops from <b className="tabular-nums">{r.riskBefore.toFixed(2)}</b> to{' '}
        <b className="tabular-nums">{r.riskAfter.toFixed(2)}</b> ({pct(r.pctReduction)} lower).
      </p>
    </div>
  );
}

export function EssentialBadge() {
  return <span className="inline-flex items-center rounded-md bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">Essential</span>;
}

function EssentialNote({ r }: { r: RankedAction }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-sky-900">
      <EssentialBadge />
      <span>{r.essential!.reason}</span>
      {r.mode === 'cost' && r.costPoints > 0 && <span className="text-xs text-sky-700">(not penalized for cost)</span>}
    </div>
  );
}

export function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="fade-in mt-4 space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{i + 1}</span>
          <span className="leading-relaxed text-slate-700">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export default function ActionCard({
  r,
  rank,
  expertise = 'medium',
  stops,
  text,
  onPrintRule,
}: {
  r: RankedAction;
  rank: number;
  expertise?: Expertise;
  /** Gemini's rewording for this business; the engine's text is used when absent */
  text?: { title: string; whatToDo: string; why: string; steps: string[] };
  /** The risk this fix lowers most, and how that risk plays out for this business */
  stops?: { name: string; chain: string[] };
  /** Only for fixes that are rules people follow: prints a one-page sign for the desk */
  onPrintRule?: () => void;
}) {
  const basic = expertise === 'basic';
  const [showSteps, setShowSteps] = useState(false);
  const [showEffect, setShowEffect] = useState(false);
  return (
    <div id={`fix-${r.action.id}`} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">{rank}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <h3 className="text-lg font-bold leading-snug text-slate-900">{text?.title ?? r.action.title}</h3>
            <div className="shrink-0 rounded-lg bg-brand-50 px-3 py-1 text-right">
              <div className="text-xs font-medium text-brand-700">{basic ? 'Lowers your risk by' : 'Cuts total risk by'}</div>
              <div className="text-xl font-extrabold tabular-nums text-brand-800">{pct(r.pctReduction)}</div>
            </div>
          </div>
          {r.essential && <EssentialNote r={r} />}
          <p className="mt-1 text-slate-700">{text?.whatToDo ?? r.action.whatToDo}</p>
          {stops && stops.chain.length > 0 && (
            <div className="mt-3 rounded-xl bg-rose-50/60 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-800">Helps stop: {stops.name}</div>
              <ChainLine steps={stops.chain} />
            </div>
          )}
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-700">{text ? 'Why it matters to you: ' : 'Why: '}</span>
            {text?.why ?? r.action.why}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <CostTime r={r} showEffort={!basic} />
            {!basic && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reduces</span>
                <ScenarioChips r={r} />
              </div>
            )}
          </div>
          {!basic && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Standards</span>
              <FrameworkTags questionIds={r.action.questionIds} />
            </div>
          )}
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowSteps((s) => !s)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              aria-expanded={showSteps}
            >
              {showSteps ? 'Hide steps' : 'Show step-by-step'}
            </button>
            <button
              type="button"
              onClick={() => setShowEffect((s) => !s)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                showEffect ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              aria-expanded={showEffect}
            >
              {showEffect ? 'Hide the effect' : 'See the effect'}
            </button>
            {onPrintRule && (
              <button
                type="button"
                onClick={onPrintRule}
                title="A one-page sign to post by the desk, with a log to fill in"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" aria-hidden /> Print the rule
              </button>
            )}
          </div>
          {showSteps && <Steps steps={text?.steps ?? r.steps} />}
          {showEffect && <WhatIf r={r} />}
        </div>
      </div>
    </div>
  );
}

export function CompactAction({ r, onPrintRule }: { r: RankedAction; onPrintRule?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div id={`fix-${r.action.id}`} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-3.5">
      <button type="button" className="w-full text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="flex items-start justify-between gap-3">
          <span className="font-semibold leading-snug text-slate-900">{r.action.title}</span>
          <span className="shrink-0 text-sm font-bold tabular-nums text-brand-700">−{pct(r.pctReduction)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.essential && <EssentialBadge />}
          <Pill className="bg-emerald-50 text-emerald-800">
            <Coins className="h-3.5 w-3.5" aria-hidden /> {r.action.cost}
          </Pill>
          <Pill>
            <Clock className="h-3.5 w-3.5" aria-hidden /> {r.action.time}
          </Pill>
        </div>
      </button>
      {open && (
        <div className="text-sm">
          <p className="mt-3 text-slate-700">{r.action.whatToDo}</p>
          <Steps steps={r.steps} />
          {onPrintRule && (
            <button type="button" onClick={onPrintRule} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900">
              <Printer className="h-4 w-4" aria-hidden /> Print the rule
            </button>
          )}
        </div>
      )}
    </div>
  );
}
