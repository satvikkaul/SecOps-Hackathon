import { ArrowDown, ArrowRight, Check, Gauge, Route, Scale, ShieldCheck, Sparkles, Users, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { questionById, scenarioById } from '../engine/data';
import type { RiskStory as Story } from '../engine/explain';
import type { Expertise } from '../engine/types';
import { Chain } from './Chain';
import { BAND_STYLES, BandBadge, SCENARIO_COLORS } from './ui';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Part({ icon: Icon, title, sub, children }: { icon: LucideIcon; title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700" aria-hidden>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-slate-900">{title}</h4>
          {sub && <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** One bar: where the chance sits now (soft amber) and where it drops to if this gap is fixed (green). */
function ChanceBar({ now, fixed }: { now: number; fixed: number }) {
  return (
    <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <div className="absolute inset-y-0 left-0 rounded-full bg-amber-200" style={{ width: pct(now) }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: pct(fixed) }} />
    </div>
  );
}

function ImpactMeter({ value }: { value: number }) {
  return (
    <div className="flex gap-1" aria-label={`Impact ${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <div key={i} className="h-2.5 w-8 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-slate-600" style={{ width: `${fill * 100}%` }} />
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
  onSeeFlow,
  chain,
  expertise = 'medium',
}: {
  story: Story;
  chain: string[];
  expertise?: Expertise;
  onClose: () => void;
  onSeeFix: (actionId: string) => void;
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
  const topFix = story.fixes[0];
  const I = story.impact;

  return (
    <div
      ref={ref}
      id={`risk-story-${story.id}`}
      role="region"
      aria-label={`Full story: ${sc.name}`}
      className="fade-in scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="h-1" style={{ background: b.hex }} aria-hidden />

      <div className="flex items-start gap-4 px-6 pb-5 pt-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SCENARIO_COLORS[story.id] }} aria-hidden />
            <h3 className="text-xl font-bold text-slate-900">{sc.name}</h3>
            <BandBadge band={story.band} size="sm" />
          </div>
          {topFix && topFix.afterBand !== story.band ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-600">
              <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden />
              <span>
                <b className="font-semibold text-slate-900">Good news: this is fixable.</b> Your top fix alone brings it down to
              </span>
              <BandBadge band={topFix.afterBand} size="sm" />
            </p>
          ) : topFix ? (
            <p className="mt-2 text-sm text-slate-600">
              {story.fixes.length === 1 ? 'One fix on your list lowers' : `${story.fixes.length} fixes on your list each lower`} this risk.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-600">You've already done what we'd suggest here.</p>
          )}
          {expertise !== 'basic' && (
            <p className="mt-2 font-mono text-xs tabular-nums text-slate-500">
              chance {pct(story.chance)} × impact {I.final.toFixed(1)} = <b className="text-slate-800">{story.risk.toFixed(2)}</b>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          aria-label="Close the full story"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {chain.length > 0 && (
        <div className="border-y border-slate-100 bg-slate-50/70 px-6 py-5">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Route className="h-4 w-4 text-slate-500" aria-hidden />
            How it could happen to a business like yours
          </h4>
          <Chain steps={chain} />
        </div>
      )}

      <div className="grid gap-5 p-6 lg:grid-cols-2">
        <Part
          icon={Gauge}
          title="Why it's likely"
          sub={
            <>
              Businesses like yours start at <b className="text-slate-900">{pct(story.baseChance)}</b>.{' '}
              {story.chance < story.baseChance - 1e-9 ? (
                <>
                  What you already have in place brings it down to <b className="text-slate-900">{pct(story.chance)}</b>.
                </>
              ) : (
                <>Each gap below is a chance to bring that down.</>
              )}
            </>
          }
        >
          {shownDrivers.length > 0 ? (
            <>
              <ul className="space-y-4">
                {shownDrivers.map((d) => (
                  <li key={d.questionId}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">
                        {d.label}
                        {d.answer === 'partial' && <span className="font-normal text-slate-500"> (partly)</span>}
                        {d.answer === 'unsure' && <span className="font-normal text-slate-500"> (not sure)</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500">
                        {pct(d.chanceNow)} <span aria-hidden>→</span>
                        <span className="sr-only">drops to</span> <b className="text-emerald-700">{pct(d.chanceIfFixed)}</b>
                      </span>
                    </div>
                    <ChanceBar now={d.chanceNow} fixed={d.chanceIfFixed} />
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-full bg-amber-200" aria-hidden /> Chance now
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-full bg-emerald-500" aria-hidden /> If you fix it
                </span>
                {story.drivers.length > shownDrivers.length && (
                  <span className="ml-auto">+ {story.drivers.length - shownDrivers.length} smaller gaps</span>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-emerald-700">Every protection we ask about is already in place.</p>
          )}
          {story.protections.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-2 text-xs font-semibold text-slate-500">Already helping</div>
              <div className="flex flex-wrap gap-1.5">
                {story.protections.map((p) => (
                  <span
                    key={p.questionId}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden /> {p.topic}
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

        <Part icon={Scale} title="Why it would hurt" sub="How much damage it would do if it happened, on a 1 to 5 scale.">
          <div className="flex items-center gap-3">
            <ImpactMeter value={I.final} />
            <span className="text-sm font-semibold tabular-nums text-slate-900">{I.final.toFixed(1)} of 5</span>
          </div>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            <li className="flex justify-between gap-3 py-2 text-slate-500">
              <span>Every business starts at</span>
              <span className="tabular-nums">{I.start}</span>
            </li>
            {I.modifiers.map((m) => (
              <li key={m.label} className="flex justify-between gap-3 py-2 text-slate-700">
                <span>{m.label}</span>
                <span className={`shrink-0 font-semibold tabular-nums ${m.delta > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {m.delta > 0 ? '+' : '−'}
                  {Math.abs(m.delta)}
                </span>
              </li>
            ))}
            {I.beforeClamp !== I.clamped && (
              <li className="flex justify-between gap-3 py-2 text-slate-500">
                <span>Capped at the 1 to 5 scale</span>
                <span className="tabular-nums">= {I.clamped}</span>
              </li>
            )}
            {I.reductions.map((r) => (
              <li key={r.questionId} className="flex justify-between gap-3 py-2 text-slate-700">
                <span>{questionById[r.questionId].topic}</span>
                <span className="shrink-0 font-semibold tabular-nums text-emerald-700">−{Math.round(r.pct * 1000) / 10}%</span>
              </li>
            ))}
          </ul>
          {I.modifiers.length === 0 && I.reductions.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">Nothing in your business profile makes this worse than average.</p>
          )}
        </Part>

        <Part icon={ShieldCheck} title="What fixes it" sub="The fixes on your list that lower this risk the most.">
          {story.fixes.length === 0 ? (
            <p className="text-sm text-slate-600">No remaining fix on our list lowers this risk further.</p>
          ) : (
            <ul className="space-y-3">
              {story.fixes.slice(0, 5).map((f) => (
                <li key={f.actionId} className="rounded-xl border border-slate-200 p-4 transition hover:border-brand-200 hover:bg-brand-50/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-snug text-slate-900">{f.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        #{f.rank} in your list · {f.inTop ? 'Do these first' : `Next ${f.timeframe} days`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSeeFix(f.actionId)}
                      className="no-print inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-100"
                    >
                      Go to fix <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-slate-500">Lowers it from</span>
                    <BandBadge band={f.beforeBand} size="sm" />
                    <span className="text-slate-500">to</span>
                    <BandBadge band={f.afterBand} size="sm" />
                    {expertise !== 'basic' && (
                      <span className="ml-auto tabular-nums text-slate-400">
                        {f.before.toFixed(2)} → {f.after.toFixed(2)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {story.fixes.length > 5 && <p className="mt-3 text-xs text-slate-500">+ {story.fixes.length - 5} more fixes with a smaller effect.</p>}
        </Part>

        <Part icon={Users} title="Who else feels it" sub="If this happens, it doesn't stay inside your business.">
          <ul className="space-y-2.5">
            {story.supplyChain.map((s) => (
              <li key={s.id} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-600" style={{ opacity: 0.35 + 0.65 * s.weight }} />
                {s.label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onSeeFlow}
            className="no-print mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900"
          >
            See it in the supply chain diagram <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
        </Part>
      </div>
    </div>
  );
}
