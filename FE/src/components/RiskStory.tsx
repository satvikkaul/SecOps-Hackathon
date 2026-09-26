import { useEffect, useRef, type ReactNode } from 'react';
import { questionById, scenarioById } from '../engine/data';
import type { RiskStory as Story } from '../engine/explain';
import { BAND_STYLES, BandBadge, SCENARIO_COLORS } from './ui';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Part({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px] text-white">{n}</span>
        {title}
      </h4>
      {children}
    </section>
  );
}

/** Two stacked bars: the chance now, and the chance if this one gap were fixed. */
function ChanceBars({ now, fixed }: { now: number; fixed: number }) {
  return (
    <div className="mt-1 space-y-0.5" aria-hidden>
      <div className="h-1.5 rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-rose-400" style={{ width: pct(now) }} />
      </div>
      <div className="h-1.5 rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: pct(fixed) }} />
      </div>
    </div>
  );
}

function ImpactMeter({ value }: { value: number }) {
  return (
    <div className="flex gap-1" aria-label={`Impact ${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <div key={i} className="h-3 w-7 overflow-hidden rounded bg-slate-200">
            <div className="h-full bg-slate-700" style={{ width: `${fill * 100}%` }} />
          </div>
        );
      })}
    </div>
  );
}

export default function RiskStory({
  story,
  onClose,
  onSeeFix,
  onSeeMath,
  onSeeFlow,
}: {
  story: Story;
  onClose: () => void;
  onSeeFix: (actionId: string) => void;
  onSeeMath: () => void;
  onSeeFlow: () => void;
}) {
  const sc = scenarioById[story.id];
  const b = BAND_STYLES[story.band];
  const ref = useRef<HTMLDivElement>(null);

  // Bring the panel into view when it opens or switches to another risk
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [story.id]);

  const shownDrivers = story.drivers.slice(0, 5);
  const I = story.impact;

  return (
    <div
      ref={ref}
      id={`risk-story-${story.id}`}
      role="region"
      aria-label={`Full story: ${sc.name}`}
      className={`fade-in scroll-mt-24 rounded-2xl border-2 bg-white shadow-md ${b.ring}`}
    >
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-t-2xl px-5 py-4 ${b.soft}`}>
        <span className="h-3 w-3 rounded-full" style={{ background: SCENARIO_COLORS[story.id] }} />
        <h3 className="text-lg font-bold text-slate-900">{sc.name}</h3>
        <BandBadge band={story.band} size="sm" />
        <span className="font-mono text-sm tabular-nums text-slate-600">
          chance {pct(story.chance)} × impact {I.final.toFixed(1)} = <b className="text-slate-900">{story.risk.toFixed(2)}</b>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg px-2.5 py-1 text-sm font-semibold text-slate-600 hover:bg-white/70 hover:text-slate-900"
          aria-label="Close the full story"
        >
          Close ✕
        </button>
      </div>

      <div className="grid gap-8 p-5 lg:grid-cols-2">
        <Part n={1} title="Why it's likely">
          <p className="text-sm text-slate-600">
            Businesses like yours start at <b className="text-slate-900">{pct(story.baseChance)}</b>.{' '}
            {story.chance < story.baseChance - 1e-9 ? (
              <>
                What you already have in place brings it down to <b className="text-slate-900">{pct(story.chance)}</b>.
              </>
            ) : (
              <>Nothing you have in place lowers it yet.</>
            )}
          </p>
          {shownDrivers.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {shownDrivers.map((d) => (
                <li key={d.questionId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-900">
                      {d.label}
                      {d.answer === 'partial' && <span className="font-normal text-slate-500"> (partly)</span>}
                      {d.answer === 'unsure' && <span className="font-normal text-slate-500"> (not sure)</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      fixing it: {pct(d.chanceNow)} → <b className="text-emerald-700">{pct(d.chanceIfFixed)}</b>
                    </span>
                  </div>
                  <ChanceBars now={d.chanceNow} fixed={d.chanceIfFixed} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-emerald-700">Every protection we ask about is already in place.</p>
          )}
          {story.drivers.length > shownDrivers.length && (
            <p className="mt-2 text-xs text-slate-500">+ {story.drivers.length - shownDrivers.length} smaller gaps, see the full math.</p>
          )}
          {story.protections.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Already helping</div>
              <div className="flex flex-wrap gap-1.5">
                {story.protections.map((p) => (
                  <span key={p.questionId} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                    ✓ {p.topic}
                    {p.answer === 'partial' && ' (partly)'} · −{pct(p.cut)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {story.notApplicable.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Not a way in for you: {story.notApplicable.map((n) => n.topic.toLowerCase()).join(', ')}.
            </p>
          )}
        </Part>

        <Part n={2} title="Why it would hurt">
          <div className="flex items-center gap-3">
            <ImpactMeter value={I.final} />
            <span className="text-sm font-semibold tabular-nums text-slate-900">{I.final.toFixed(1)} of 5</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li className="flex justify-between gap-3 text-slate-600">
              <span>Every business starts at</span>
              <span className="tabular-nums">{I.start}</span>
            </li>
            {I.modifiers.map((m) => (
              <li key={m.label} className="flex justify-between gap-3 text-slate-800">
                <span>{m.label}</span>
                <span className={`shrink-0 font-semibold tabular-nums ${m.delta > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {m.delta > 0 ? '+' : '−'}
                  {Math.abs(m.delta)}
                </span>
              </li>
            ))}
            {I.beforeClamp !== I.clamped && (
              <li className="flex justify-between gap-3 text-slate-500">
                <span>Capped at the 1 to 5 scale</span>
                <span className="tabular-nums">= {I.clamped}</span>
              </li>
            )}
            {I.reductions.map((r) => (
              <li key={r.questionId} className="flex justify-between gap-3 text-slate-800">
                <span>{questionById[r.questionId].topic}</span>
                <span className="shrink-0 font-semibold tabular-nums text-emerald-700">−{Math.round(r.pct * 1000) / 10}%</span>
              </li>
            ))}
          </ul>
          {I.modifiers.length === 0 && I.reductions.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">Nothing in your business profile makes this worse than average.</p>
          )}
        </Part>

        <Part n={3} title="What fixes it">
          {story.fixes.length === 0 ? (
            <p className="text-sm text-slate-600">No remaining fix on our list lowers this risk further.</p>
          ) : (
            <ul className="space-y-2">
              {story.fixes.slice(0, 5).map((f) => (
                <li key={f.actionId} className="rounded-xl border border-slate-200 px-3 py-2.5">
                  <div className="text-sm font-semibold leading-snug text-slate-900">{f.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs text-slate-500">
                      #{f.rank} in your list · {f.inTop ? 'Do these first' : `next ${f.timeframe} days`}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-xs">
                      <BandBadge band={f.beforeBand} size="sm" />
                      <span aria-hidden>→</span>
                      <BandBadge band={f.afterBand} size="sm" />
                      <span className="tabular-nums text-slate-500">
                        {f.before.toFixed(2)} → {f.after.toFixed(2)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onSeeFix(f.actionId)}
                      className="no-print rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Go to fix
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {story.fixes.length > 5 && <p className="mt-2 text-xs text-slate-500">+ {story.fixes.length - 5} more fixes with a smaller effect.</p>}
        </Part>

        <Part n={4} title="Who else feels it">
          <p className="text-sm text-slate-600">If this happens, it doesn't stay inside your business:</p>
          <ul className="mt-2 space-y-1.5">
            {story.supplyChain.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-sm text-slate-800">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-700" style={{ opacity: 0.35 + 0.65 * s.weight }} />
                {s.label}
              </li>
            ))}
          </ul>
          <button type="button" onClick={onSeeFlow} className="no-print mt-3 text-sm font-semibold text-brand-700 hover:text-brand-900">
            See it in the supply chain diagram ↓
          </button>
        </Part>
      </div>

      <div className="no-print flex justify-end border-t border-slate-100 px-5 py-3">
        <button type="button" onClick={onSeeMath} className="text-sm font-semibold text-brand-700 hover:text-brand-900">
          See every number for this risk in Show the math →
        </button>
      </div>
    </div>
  );
}
