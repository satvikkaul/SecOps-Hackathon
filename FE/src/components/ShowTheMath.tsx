import { useEffect, useState } from 'react';
import type { RankedAction } from '../engine/actions';
import { profileQuestions, questionById, questions, ranking } from '../engine/data';
import { isVisible, type Assessment, type ScenarioResult } from '../engine/scoring';
import type { AnswerValue, Profile, RankingMode } from '../engine/types';
import { BandBadge, SCENARIO_COLORS } from './ui';

const ANSWER_LABEL: Record<AnswerValue, string> = { yes: 'Yes', partial: 'Partly', no: 'No', unsure: 'Not sure', na: 'Does not apply' };
const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);

function sectorLabel(profile: Profile) {
  return profileQuestions.find((q) => q.id === 'sector')?.options.find((o) => o.value === profile.sector)?.label ?? profile.sector;
}

function ScenarioMath({ s, profile, focused }: { s: ScenarioResult; profile: Profile; focused: boolean }) {
  const [open, setOpen] = useState(focused);
  // Opened from a risk's full story: expand this one
  useEffect(() => {
    if (focused) setOpen(true);
  }, [focused]);
  const L = s.likelihood;
  const I = s.impact;
  return (
    <div id={`math-${s.id}`} className={`scroll-mt-24 rounded-xl border bg-white ${focused ? 'border-slate-500 ring-2 ring-slate-300' : 'border-slate-200'}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: SCENARIO_COLORS[s.id] }} />
        <span className="flex-1 font-semibold text-slate-900">{s.name}</span>
        <span className="font-mono text-sm tabular-nums text-slate-600">
          {f3(L.final)} × {f2(I.final)} = <b className="text-slate-900">{f2(s.risk)}</b>
        </span>
        <BandBadge band={s.band} size="sm" />
        <span className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="fade-in grid gap-6 border-t border-slate-100 px-4 py-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 font-semibold text-slate-800">Likelihood</h4>
            <table className="w-full text-sm">
              <tbody className="font-mono tabular-nums">
                <tr>
                  <td className="py-1 pr-2 font-sans text-slate-700">Starting likelihood for {sectorLabel(profile)}</td>
                  <td className="py-1 text-right font-semibold">{f2(L.base)}</td>
                </tr>
                {L.factors.map((f) => (
                  <tr key={f.questionId} className="border-t border-slate-100">
                    <td className="py-1 pr-2 font-sans text-slate-600">
                      <span className="font-semibold text-slate-700">{f.questionId}</span> {questionById[f.questionId].topic}:{' '}
                      <span className="text-slate-800">{f.notApplicable === 'hidden' ? 'Does not apply to your business' : ANSWER_LABEL[f.answer]}</span>
                      <div className="font-mono text-xs text-slate-400">
                        1 − {f2(f.weight)} × {f.value}
                      </div>
                    </td>
                    <td className={`py-1 text-right ${f.factor < 1 ? 'text-emerald-700' : 'text-slate-400'}`}>× {f2(f.factor)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300">
                  <td className="py-1.5 pr-2 font-sans font-semibold text-slate-800">
                    Final likelihood{L.clamped && <span className="font-normal text-slate-500"> (raised to the 0.05 minimum)</span>}
                  </td>
                  <td className="py-1.5 text-right font-bold">{f3(L.final)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-slate-800">Impact (1 to 5)</h4>
            <table className="w-full text-sm">
              <tbody className="font-mono tabular-nums">
                <tr>
                  <td className="py-1 pr-2 font-sans text-slate-700">Starting impact</td>
                  <td className="py-1 text-right font-semibold">{I.start}</td>
                </tr>
                {I.modifiers.map((m) => (
                  <tr key={m.label} className="border-t border-slate-100">
                    <td className="py-1 pr-2 font-sans text-slate-600">{m.label}</td>
                    <td className={`py-1 text-right ${m.delta > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {m.delta > 0 ? '+' : '−'}
                      {Math.abs(m.delta)}
                    </td>
                  </tr>
                ))}
                {I.beforeClamp !== I.clamped && (
                  <tr className="border-t border-slate-100">
                    <td className="py-1 pr-2 font-sans text-slate-600">
                      Kept within 1 to 5 ({I.beforeClamp} → {I.clamped})
                    </td>
                    <td className="py-1 text-right">= {I.clamped}</td>
                  </tr>
                )}
                {I.reductions.map((r) => (
                  <tr key={r.questionId} className="border-t border-slate-100">
                    <td className="py-1 pr-2 font-sans text-slate-600">
                      <span className="font-semibold text-slate-700">{r.questionId}</span>{' '}
                      {questionById[r.questionId].topic}: {ANSWER_LABEL[r.answer]}
                    </td>
                    <td className="py-1 text-right text-emerald-700">− {Math.round(r.pct * 1000) / 10}%</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300">
                  <td className="py-1.5 pr-2 font-sans font-semibold text-slate-800">Final impact</td>
                  <td className="py-1.5 text-right font-bold">{f2(I.final)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-800">Risk = likelihood × impact</div>
              <div className="mt-1 font-mono tabular-nums text-slate-700">
                {f3(L.final)} × {f2(I.final)} = <b>{f2(s.risk)}</b> → {s.band}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShowTheMath({
  assessment,
  ranked,
  profile,
  mode,
  focusId = null,
}: {
  assessment: Assessment;
  ranked: RankedAction[];
  profile: Profile;
  mode: RankingMode;
  /** Scenario to expand and highlight, e.g. when opened from a risk's full story */
  focusId?: string | null;
}) {
  const hidden = questions.filter((q) => !isVisible(q, profile));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 md:grid-cols-2">
        <div>
          <b>Likelihood</b> starts from how often businesses like yours are targeted, then each protection you have in place multiplies it down:{' '}
          <span className="font-mono">× (1 − weight × answer)</span>, where Yes = 1, Partly = 0.5, No and Not sure = 0. "Does not apply" also counts as 1: if a route into your business does not exist, there is no exposure through it. It never goes below 0.05.
        </div>
        <div>
          <b>Impact</b> starts at 2 and goes up or down based on your business profile, kept between 1 and 5. A written incident plan and cyber insurance
          then take a percentage off. <b>Risk</b> = likelihood × impact. Bands: 3.0+ High, 2.0 to 2.99 Elevated, 1.0 to 1.99 Moderate, under 1.0 Low.
        </div>
        <div className="md:col-span-2">
          <b>Overall posture</b> is the band of your single highest risk ({assessment.scenarios[0].name}, {f2(assessment.posture.score)}). You are only as safe
          as your biggest exposure.
          {hidden.length > 0 && (
            <>
              {' '}
              Questions that do not apply to your business were not asked and count as no exposure: {hidden.map((q) => q.id).join(', ')}.
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {assessment.scenarios.map((s) => (
          <ScenarioMath key={s.id} s={s} profile={profile} focused={s.id === focusId} />
        ))}
      </div>

      <div>
        <h4 className="mb-1 font-semibold text-slate-800">How fixes are ranked</h4>
        <p className="mb-3 text-sm text-slate-600">
          For each fix, we pretend you have done it (its questions set to Yes), recompute every risk, and measure the drop in total risk (sum of all seven,
          currently <span className="font-mono">{f2(assessment.totalRisk)}</span>). Two ways to turn that into a priority, shown side by side; the list is
          sorted by the one you picked (<b>{ranking.modes[mode].label}</b>, highlighted):
        </p>
        <ul className="mb-3 space-y-1 text-sm text-slate-600">
          <li>
            <b>Effort only:</b> <span className="font-mono">risk reduction ÷ effort</span>
          </li>
          <li>
            <b>Effort + cost:</b> <span className="font-mono">risk reduction ÷ (effort + {ranking.costWeight} × cost points)</span>, where{' '}
            {Object.entries(ranking.costPoints)
              .map(([label, p]) => `${label} = ${p}`)
              .join(', ')}
            . <b>Essential</b> fixes (CIS IG1 safeguards in {Object.keys(ranking.essential.cisControls).map((c) => `Control ${c}`).join(' and ')}) skip the cost
            term and are scheduled no later than {ranking.essential.latestTimeframe} days.
          </li>
        </ul>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Fix</th>
                <th className="px-3 py-2">Questions</th>
                <th className="px-3 py-2 text-right">Risk reduction</th>
                <th className="px-3 py-2 text-right">Effort</th>
                <th className="px-3 py-2 text-right">Cost pts</th>
                <th className={`px-3 py-2 text-right ${mode === 'effort' ? 'bg-brand-50 text-brand-800' : ''}`}>Effort only</th>
                <th className={`px-3 py-2 text-right ${mode === 'cost' ? 'bg-brand-50 text-brand-800' : ''}`}>Effort + cost</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {ranked.map((r, i) => (
                <tr key={r.action.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-slate-800">
                    {r.action.title}
                    {r.essential && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-bold text-sky-800">Essential</span>}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{r.openQuestionIds.join(', ')}</td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {f2(r.riskBefore)} − {f2(r.riskAfter)} = {f3(r.riskReduction)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.action.effort}</td>
                  <td className="px-3 py-1.5 text-right font-mono" title={r.action.cost}>
                    {r.essential && r.costPoints > 0 ? (
                      <span>
                        <s className="text-slate-400">{r.costPoints}</s> 0
                      </span>
                    ) : (
                      r.costPoints
                    )}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${mode === 'effort' ? 'bg-brand-50 font-bold text-brand-900' : 'text-slate-500'}`}>
                    {f3(r.priorities.effort)}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${mode === 'cost' ? 'bg-brand-50 font-bold text-brand-900' : 'text-slate-500'}`}>
                    {f3(r.priorities.cost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
