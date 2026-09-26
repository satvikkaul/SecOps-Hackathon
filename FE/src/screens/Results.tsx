import { useState, type ReactNode } from 'react';
import ActionCard, { CompactAction, pct } from '../components/ActionCard';
import RiskFlow from '../components/RiskFlow';
import RiskStory from '../components/RiskStory';
import ShowTheMath from '../components/ShowTheMath';
import RankingToggle from '../components/RankingToggle';
import RiskRegisterButton from '../components/RiskRegisterButton';
import StandardsPanel from '../components/StandardsPanel';
import { BAND_STYLES, BandBadge, Button, Card, SCENARIO_COLORS, SectionTitle } from '../components/ui';
import { profileQuestions, scenarioById, templateById } from '../engine/data';
import { explainRisk } from '../engine/explain';
import type { ScenarioResult } from '../engine/scoring';
import type { Band, ScenarioId } from '../engine/types';
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
  return <section className={className}>{children}</section>;
}

function SideCard({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function StatChip({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200">
      <b className="tabular-nums text-slate-900">{value}</b> {label}
    </span>
  );
}

/** Half-circle meter for the overall score out of 5. */
function RiskGauge({ score, band }: { score: number; band: Band }) {
  const frac = Math.min(1, Math.max(0, score / 5));
  const r = 80;
  const arc = Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 116" className="w-52" role="img" aria-label={`Overall risk ${band}, ${score.toFixed(2)} of 5`}>
        <path d="M20,100 A80,80 0 0 1 180,100" fill="none" stroke="#e2e8f0" strokeWidth="18" strokeLinecap="round" />
        <path
          d="M20,100 A80,80 0 0 1 180,100"
          fill="none"
          stroke={BAND_STYLES[band].hex}
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={`${arc * frac} ${arc}`}
        />
        <text x="100" y="84" textAnchor="middle" className="fill-slate-900 text-[30px] font-extrabold">
          {band}
        </text>
        <text x="100" y="106" textAnchor="middle" className="fill-slate-500 text-[13px] font-semibold">
          {score.toFixed(2)} of 5
        </text>
      </svg>
      <div className="-mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Overall risk</div>
    </div>
  );
}

export default function Results({ app, onReset }: { app: AppApi; onReset: () => void }) {
  const { state, go } = app;
  const { profile, answers } = state;
  const { assessment, plan, ranked, unsure, flow, cccs, cis, ciosc } = useResults(profile, answers, state.rankingMode);
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

  const openRiskFromGlance = (id: ScenarioId) => {
    setOpenRisk(id);
    // Wait for the story panel to render before scrolling to it
    window.setTimeout(() => jumpTo(`risk-story-${id}`), 60);
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => go('summary')}>Supplier Security Summary</Button>
      <RiskRegisterButton assessment={assessment} ranked={ranked} profile={profile} answers={answers} company={state.company} />
      <Button variant="secondary" onClick={() => go('profile')}>
        Edit answers
      </Button>
      <Button variant="ghost" onClick={onReset}>
        Start over
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6">
      {/* Overall posture */}
      <Card className={`overflow-hidden ${bs.ring}`}>
        <div className={`grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center md:p-8 ${bs.soft}`}>
          <RiskGauge score={assessment.posture.score} band={band} />
          <div>
            <div className="text-sm font-semibold text-slate-500">
              {sector}
              {state.domain && <> · {state.domain}</>}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              {state.company ? `Here's how ${state.company} is doing` : "Here's how your business is doing"}
            </h1>
            <p className="mt-3 text-xl leading-relaxed text-slate-800">{summary}</p>
            <p className="mt-2 text-slate-600">{POSTURE_TEXT[band]}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatChip value={assessment.scenarios.filter((s) => s.band === 'High' || s.band === 'Elevated').length} label="risks need attention" />
              <StatChip value={ranked.length} label={ranked.length === 1 ? 'fix to do' : 'fixes to do'} />
              {unsure.length > 0 && <StatChip value={unsure.length} label={unsure.length === 1 ? 'answer to double-check' : 'answers to double-check'} />}
            </div>
            <div className="no-print mt-5 xl:hidden">{actions}</div>
          </div>
        </div>
      </Card>

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-12">
          {/* Top risks */}
          <Block>
            <SectionTitle icon="🎯" sub="Ranked by how likely each one is for a business like yours, times how much it would hurt. Click any risk to see why, and what fixes it.">
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

          {/* Do these first */}
          <Block>
            <SectionTitle
              icon="🛠️"
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

          {/* 30/60/90 plan */}
          {ranked.length > plan.top.length && (
            <Block>
              <SectionTitle
                icon="🗓️"
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

          {/* Risk flow */}
          <Block>
            <SectionTitle icon="🔗" sub="How your biggest gaps could spill over onto the customers and partners who depend on you.">
              How your gaps reach your supply chain
            </SectionTitle>
            <Card id="risk-flow" className="scroll-mt-24 p-4 md:p-6">
              <RiskFlow graph={flow} focusId={flowFocus} />
            </Card>
          </Block>

          {/* Show the math and standards mapping */}
          <Block className="space-y-4">
            <div>
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
            </div>
            <div>
              <button
                type="button"
                onClick={() => setStandardsOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4 text-left shadow-sm hover:bg-slate-50"
                aria-expanded={standardsOpen}
              >
                <div>
                  {state.template === 'ciosc' ? (
                    <>
                      <div className="text-xl font-bold text-slate-900">How this maps to CyberSecure Canada</div>
                      <div className="text-slate-600">The 18 sections of CAN/CIOSC 104:2021, numbered as in the OCI Cybersecurity Workbook, traced to your answers.</div>
                    </>
                  ) : (
                    <>
                      <div className="text-xl font-bold text-slate-900">How this maps to CCCS and CIS</div>
                      <div className="text-slate-600">Canadian Centre for Cyber Security baseline controls and CIS Controls v8.1, traced to your answers.</div>
                    </>
                  )}
                </div>
                <span className={`text-2xl text-slate-400 transition-transform ${standardsOpen ? 'rotate-90' : ''}`}>›</span>
              </button>
              {standardsOpen && (
                <div className="fade-in mt-4">
                  <StandardsPanel key={state.template} template={state.template} cccs={cccs} cis={cis} ciosc={ciosc} />
                </div>
              )}
            </div>
          </Block>
        </div>

        {/* Sidebar */}
        <aside className="no-print space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:pb-2">
          <SideCard title="Risks at a glance" icon="📊">
            <ul className="space-y-1">
              {assessment.scenarios.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => openRiskFromGlance(s.id)}
                    title={s.description}
                    className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SCENARIO_COLORS[s.id] }} />
                      <span className="flex-1 font-medium text-slate-800">{s.short}</span>
                      <span className={`text-xs font-semibold ${BAND_STYLES[s.band].text}`}>{s.band}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (s.risk / 5) * 100)}%`, background: BAND_STYLES[s.band].hex }} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </SideCard>

          <SideCard title="Your next step" icon="👉">
            {first ? (
              <>
                <div className="font-semibold leading-snug text-slate-900">{first.action.title}</div>
                <p className="mt-1 text-sm text-slate-600">
                  Cuts your total risk by <b className="text-brand-800">{pct(first.pctReduction)}</b> and {timePhrase(first.action.time)}.
                </p>
                <Button onClick={() => jumpTo(`fix-${first.action.id}`)} className="mt-3 w-full py-2 text-sm">
                  Show me how
                </Button>
              </>
            ) : (
              <p className="text-sm text-slate-700">Every fix on our list is already in place. Review your answers once a year.</p>
            )}
          </SideCard>

          <SideCard title="Share and save" icon="📄">
            <div className="grid gap-2">
              <Button onClick={() => go('summary')} className="w-full py-2 text-sm">
                Supplier Security Summary
              </Button>
              <RiskRegisterButton assessment={assessment} ranked={ranked} profile={profile} answers={answers} company={state.company} className="w-full py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => go('profile')} className="w-full px-2 py-2 text-sm">
                  Edit answers
                </Button>
                <Button variant="ghost" onClick={onReset} className="w-full px-2 py-2 text-sm">
                  Start over
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Reporting against <b className="text-slate-700">{templateById[state.template].name}</b>.{' '}
              <button type="button" onClick={() => go('template')} className="font-semibold text-brand-700 underline hover:text-brand-800">
                Change
              </button>
            </p>
          </SideCard>

          <SideCard title="Worth double-checking" icon="🔍">
            {unsure.length === 0 ? (
              <p className="text-sm text-slate-700">Nothing to check. You answered every question with confidence.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-slate-500">You said “Not sure” to these, so we counted them as No. Checking could lower your risk.</p>
                <ul className="space-y-2">
                  {unsure.map((q) => (
                    <li key={q.id} className="rounded-lg bg-slate-50 p-2.5" title={q.why}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{q.topic}</div>
                      <div className="mt-0.5 text-sm text-slate-800">{q.text}</div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs font-medium text-brand-800">Ask your IT provider or whoever set up your equipment.</p>
              </>
            )}
          </SideCard>
        </aside>
      </div>
    </div>
  );
}
