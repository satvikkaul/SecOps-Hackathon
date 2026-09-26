import { useState, type ReactNode } from 'react';
import ActionCard, { CompactAction } from '../components/ActionCard';
import RiskFlow from '../components/RiskFlow';
import RiskStory from '../components/RiskStory';
import ShowTheMath from '../components/ShowTheMath';
import RankingToggle from '../components/RankingToggle';
import StandardsPanel from '../components/StandardsPanel';
import ShareButton from '../components/ShareButton';
import { BAND_STYLES, BandBadge, Button, Card, SCENARIO_COLORS, SectionTitle } from '../components/ui';
import { profileQuestions, scenarioById } from '../engine/data';
import { explainRisk } from '../engine/explain';
import type { ScenarioResult } from '../engine/scoring';
import type { ScenarioId } from '../engine/types';
import type { AppApi } from '../state';
import { timePhrase, useResults } from '../useResults';

const POSTURE_TEXT: Record<string, string> = {
  High: 'Attackers have several easy ways in. A few quick fixes will make a big difference.',
  Elevated: 'You have some protections, but there are clear gaps worth closing soon.',
  Moderate: 'You have a reasonable base. A handful of fixes will tighten things up.',
  Low: 'You have strong basics in place. Keep them up and review once a year.',
};

function RiskCard({ s, rank, open, onToggle }: { s: ScenarioResult; rank: number; open: boolean; onToggle: () => void }) {
  const b = BAND_STYLES[s.band];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-controls={`risk-story-${s.id}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`group flex cursor-pointer flex-col rounded-2xl border p-5 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${b.soft} ${
        open ? 'border-slate-800 shadow-md ring-2 ring-slate-800' : `${b.ring} hover:-translate-y-0.5 hover:shadow-md`
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SCENARIO_COLORS[s.id] }} />#{rank}
        </div>
        <BandBadge band={s.band} />
      </div>
      <h3 className="mt-2 text-lg font-bold leading-snug text-slate-900">{s.name}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">{s.description}</p>
      <div className="mt-3 flex gap-4 text-sm text-slate-600">
        <span>
          Chance <b className="tabular-nums text-slate-900">{Math.round(s.likelihood.final * 100)}%</b>
        </span>
        <span>
          Impact <b className="tabular-nums text-slate-900">{s.impact.final.toFixed(1)}/5</b>
        </span>
        <span>
          Risk <b className="tabular-nums text-slate-900">{s.risk.toFixed(2)}</b>
        </span>
      </div>
      {s.contributors.length > 0 && (
        <div className="mt-3 border-t border-slate-200/70 pt-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Biggest reasons</div>
          <ul className="space-y-1">
            {s.contributors.map((c) => (
              <li key={c.questionId} className="flex items-start gap-2 text-sm text-slate-800">
                <span className={`mt-0.5 font-bold ${c.answer === 'unsure' ? 'text-slate-500' : b.text}`}>{c.answer === 'unsure' ? '?' : '✕'}</span>
                <span>
                  {c.label}
                  {c.answer === 'partial' && <span className="text-slate-500"> (partly)</span>}
                  {c.answer === 'unsure' && <span className="text-slate-500"> (not sure)</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="no-print mt-auto pt-3 text-sm font-semibold text-slate-700 group-hover:text-slate-900">
        {open ? 'Hide the full story ▴' : 'See the full story ▾'}
      </div>
    </div>
  );
}

function Block({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`mt-12 ${className}`}>{children}</section>;
}

export default function Results({ app, onReset }: { app: AppApi; onReset: () => void }) {
  const { state, go } = app;
  const { profile, answers } = state;
  const { assessment, plan, ranked, unsure, flow, cccs, cis } = useResults(profile, answers, state.rankingMode);
  const [mathOpen, setMathOpen] = useState(false);
  const [standardsOpen, setStandardsOpen] = useState(false);
  const [openRisk, setOpenRisk] = useState<ScenarioId | null>(null);
  const [mathFocus, setMathFocus] = useState<ScenarioId | null>(null);
  const [flowFocus, setFlowFocus] = useState<string | null>(null);

  if (!profile.sector) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">No answers yet</h1>
        <p className="mt-2 text-slate-600">Start the check-up or load the demo company to see results.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => go('profile')}>Start check-up</Button>
          <Button variant="secondary" onClick={app.loadDemo}>
            Load demo company
          </Button>
        </div>
      </div>
    );
  }

  const top = assessment.scenarios[0];
  const first = plan.top[0];
  const band = assessment.posture.band;
  const bs = BAND_STYLES[band];
  const sector = profileQuestions.find((q) => q.id === 'sector')?.options.find((o) => o.value === profile.sector)?.label;
  const summary = first
    ? `Your biggest exposure is ${scenarioById[top.id].phrase}, and your first fix ${timePhrase(first.action.time)}.`
    : `Your biggest remaining exposure is ${scenarioById[top.id].phrase}, and you have already done every fix on our list.`;
  const topRisks = assessment.scenarios.slice(0, 3);
  const otherRisks = assessment.scenarios.slice(3);

  const toggleRisk = (id: ScenarioId) => setOpenRisk((o) => (o === id ? null : id));
  const story = openRisk ? explainRisk(openRisk, profile, answers, ranked) : null;

  /** Scroll to an element and briefly highlight it. */
  const jumpTo = (elementId: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash-target');
    void el.offsetWidth; // restart the animation if it is already running
    el.classList.add('flash-target');
    window.setTimeout(() => el.classList.remove('flash-target'), 1900);
  };

  const storyPanel = story && (
    <RiskStory
      story={story}
      onClose={() => setOpenRisk(null)}
      onSeeFix={(id) => jumpTo(`fix-${id}`)}
      onSeeMath={() => {
        setMathOpen(true);
        setMathFocus(story.id);
        // Wait for the math panel to render before scrolling to it
        window.setTimeout(() => jumpTo(`math-${story.id}`), 60);
      }}
      onSeeFlow={() => {
        setFlowFocus(story.id);
        jumpTo('risk-flow');
      }}
    />
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => go('summary')}>Supplier Security Summary</Button>
      <ShareButton state={state} />
      <Button variant="secondary" onClick={() => go('profile')}>
        Edit answers
      </Button>
      <Button variant="ghost" onClick={onReset}>
        Start over
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6">
      {/* 1. Overall posture */}
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-[auto_1fr]">
          <div className={`flex flex-col items-center justify-center gap-1 px-10 py-8 ${bs.solid}`}>
            <div className="text-sm font-semibold uppercase tracking-widest opacity-90">Overall risk</div>
            <div className="text-5xl font-extrabold tracking-tight">{band}</div>
            <div className="text-sm tabular-nums opacity-90">{assessment.posture.score.toFixed(2)} of 5</div>
          </div>
          <div className="p-6 md:p-8">
            <div className="text-sm font-semibold text-slate-500">
              {sector}
              {state.domain && <> · {state.domain}</>}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{state.company || 'Your business'}</h1>
            <p className="mt-3 text-xl leading-relaxed text-slate-800">{summary}</p>
            <p className="mt-2 text-slate-600">{POSTURE_TEXT[band]}</p>
            <div className="no-print mt-5">{actions}</div>
          </div>
        </div>
      </Card>

      {/* 2. Top risks */}
      <Block>
        <SectionTitle sub="Ranked by how likely each one is for a business like yours, times how much it would hurt. Click any risk to see why, and what fixes it.">
          Your top risks
        </SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          {topRisks.map((s, i) => (
            <RiskCard key={s.id} s={s} rank={i + 1} open={openRisk === s.id} onToggle={() => toggleRisk(s.id)} />
          ))}
        </div>
        {story && topRisks.some((s) => s.id === openRisk) && <div className="mt-4">{storyPanel}</div>}
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {otherRisks.map((s, i) => {
            const open = openRisk === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleRisk(s.id)}
                aria-expanded={open}
                aria-controls={`risk-story-${s.id}`}
                className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-2.5 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${
                  open ? 'border-slate-800 ring-2 ring-slate-800' : 'border-slate-200 hover:border-slate-400 hover:shadow-sm'
                }`}
              >
                <span className="w-6 text-sm font-semibold text-slate-400">#{i + 4}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SCENARIO_COLORS[s.id] }} />
                <span className="flex-1 font-medium text-slate-800">{s.name}</span>
                <span className="text-sm tabular-nums text-slate-500">{s.risk.toFixed(2)}</span>
                <BandBadge band={s.band} size="sm" />
                <span className="no-print text-slate-400" aria-hidden>
                  {open ? '▴' : '▾'}
                </span>
              </button>
            );
          })}
        </div>
        {story && otherRisks.some((s) => s.id === openRisk) && <div className="mt-4">{storyPanel}</div>}
      </Block>

      {/* 3. Do these first */}
      <Block>
        <SectionTitle
          sub={
            state.rankingMode === 'cost'
              ? 'Ranked by how much risk each fix removes for the effort and money it takes. Tap “See the effect” to preview the change.'
              : 'Ranked by how much risk each fix removes for the effort it takes. Tap “See the effect” to preview the change.'
          }
        >
          Do these first
        </SectionTitle>
        <div className="mb-4">
          <RankingToggle mode={state.rankingMode} onChange={(m) => app.update({ rankingMode: m })} />
        </div>
        {plan.top.length === 0 ? (
          <Card className="p-6 text-slate-700">Every fix on our list is already in place. Nice work.</Card>
        ) : (
          <div className="space-y-4">
            {plan.top.map((r, i) => (
              <ActionCard key={r.action.id} r={r} rank={i + 1} />
            ))}
          </div>
        )}
      </Block>

      {/* 4. 30/60/90 plan */}
      {ranked.length > plan.top.length && (
        <Block>
          <SectionTitle
            sub={
              state.rankingMode === 'cost'
                ? 'Everything else, grouped by how much work it takes (essential recovery fixes no later than 60 days). Best value first.'
                : 'Everything else, grouped by how much work it takes. Quick wins first.'
            }
          >
            Your 30 / 60 / 90 day plan
          </SectionTitle>
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ['Next 30 days', 'Quick wins', plan.days30],
                ['Next 60 days', 'A few days of work', plan.days60],
                ['Next 90 days', 'Bigger projects', plan.days90],
              ] as const
            ).map(([title, sub, items]) => (
              <div key={title} className="rounded-2xl bg-slate-100/80 p-4">
                <div className="mb-3">
                  <div className="font-bold text-slate-900">{title}</div>
                  <div className="text-sm text-slate-600">{sub}</div>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="text-sm text-slate-500">Nothing here.</p>
                  ) : (
                    items.map((r) => <CompactAction key={r.action.id} r={r} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {/* 5. Risk flow */}
      <Block>
        <SectionTitle sub="How your biggest gaps could spill over onto the customers and partners who depend on you. Hover over any box to trace its path.">
          How your gaps reach your supply chain
        </SectionTitle>
        <Card id="risk-flow" className="scroll-mt-24 p-4 md:p-6">
          <RiskFlow graph={flow} focusId={flowFocus} />
        </Card>
      </Block>

      {/* 8. Things worth checking */}
      <Block>
        <SectionTitle sub="You answered “Not sure” to these. We counted them as No, so checking could lower your risk.">Things worth checking</SectionTitle>
        {unsure.length === 0 ? (
          <Card className="p-5 text-slate-700">Nothing to check. You answered every question with confidence.</Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {unsure.map((q) => (
              <Card key={q.id} className="p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{q.topic}</div>
                <div className="mt-1 font-semibold text-slate-900">{q.text}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{q.why}</p>
                <p className="mt-2 text-sm font-medium text-brand-800">Ask your IT provider or whoever set up your equipment.</p>
              </Card>
            ))}
          </div>
        )}
      </Block>

      {/* 6. Show the math */}
      <Block>
        <button
          type="button"
          onClick={() => setMathOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4 text-left shadow-sm hover:bg-slate-50"
          aria-expanded={mathOpen}
        >
          <div>
            <div className="text-xl font-bold text-slate-900">Show the math</div>
            <div className="text-slate-600">Every number on this page, traced back to your answers.</div>
          </div>
          <span className={`text-2xl text-slate-400 transition-transform ${mathOpen ? 'rotate-90' : ''}`}>›</span>
        </button>
        {mathOpen && (
          <div className="fade-in mt-4">
            <ShowTheMath assessment={assessment} ranked={ranked} profile={profile} mode={state.rankingMode} focusId={mathFocus} />
          </div>
        )}
      </Block>

      {/* Standards mapping */}
      <Block className="mt-4">
        <button
          type="button"
          onClick={() => setStandardsOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4 text-left shadow-sm hover:bg-slate-50"
          aria-expanded={standardsOpen}
        >
          <div>
            <div className="text-xl font-bold text-slate-900">How this maps to CCCS and CIS</div>
            <div className="text-slate-600">Canadian Centre for Cyber Security baseline controls and CIS Controls v8.1, traced to your answers.</div>
          </div>
          <span className={`text-2xl text-slate-400 transition-transform ${standardsOpen ? 'rotate-90' : ''}`}>›</span>
        </button>
        {standardsOpen && (
          <div className="fade-in mt-4">
            <StandardsPanel cccs={cccs} cis={cis} />
          </div>
        )}
      </Block>

      <div className="no-print mt-12 flex justify-center">{actions}</div>
    </div>
  );
}
