import { Check, Zap } from 'lucide-react';
import { TechTag } from '../components/Expertise';
import FrameworkTags from '../components/FrameworkTags';
import { Button, Card, OptionCard, ProgressBar, WhyWeAsk } from '../components/ui';
import { questionById, sections } from '../engine/data';
import {
  firstOpenSection,
  ladderAnswers,
  ladderSelection,
  ladderUnsure,
  minutesFor,
  promptComplete,
  promptIntro,
  promptQuestionIds,
  quickCheck,
  quickPrompts,
  rowLabel,
  visiblePrompts,
  type LadderPrompt,
  type Prompt,
  type PromptRow,
  type RowsPrompt,
} from '../engine/prompts';
import { coverage } from '../engine/scoring';
import type { AnswerValue } from '../engine/types';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';

const TONE: Record<string, 'yes' | 'partial' | 'no' | 'neutral'> = { yes: 'yes', partial: 'partial', no: 'no', na: 'neutral' };

function NotSure({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium transition ${
        selected ? 'bg-slate-700 text-white' : 'text-slate-500 underline decoration-dotted underline-offset-4 hover:text-slate-800'
      }`}
    >
      {selected ? (
        <>
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> Not sure, we'll add it to your list to check
        </>
      ) : (
        'Not sure'
      )}
    </button>
  );
}

function AutoTag() {
  return (
    <span className="ml-2 inline-flex rounded-full bg-sky-100 px-2 py-0.5 align-middle text-xs font-semibold text-sky-800">Filled in from domain check</span>
  );
}

function Row({ row, showLabel }: { row: PromptRow; showLabel: boolean }) {
  const current = useAppStore((s) => s.answers[row.question]);
  const profile = useAppStore((s) => s.profile);
  const expertise = useAppStore((s) => s.expertise);
  const q11AutoFilled = useAppStore((s) => !!s.autoFilled.Q11);
  const setAnswer = useAppStore((s) => s.setAnswer);
  const choices: { value: AnswerValue; label: string }[] = [...row.options, ...(row.na ? [{ value: 'na' as const, label: row.na }] : [])];
  return (
    <div>
      {showLabel && (
        <div className="font-medium leading-snug text-slate-900">
          {rowLabel(row, profile, expertise)}
          {row.question === 'Q11' && q11AutoFilled && <AutoTag />}
        </div>
      )}
      {expertise === 'expert' && <TechTag>{questionById[row.question].tech}</TechTag>}
      <div className={`mt-2.5 grid gap-2 sm:grid-cols-2 ${choices.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {choices.map((o) => (
          <OptionCard key={o.value} label={o.label} tone={TONE[o.value]} selected={current === o.value} onClick={() => setAnswer(row.question, o.value)} />
        ))}
      </div>
      <NotSure selected={current === 'unsure'} onClick={() => setAnswer(row.question, 'unsure')} />
    </div>
  );
}

function RowsCard({ p }: { p: RowsPrompt }) {
  // A single-row card whose title already asks the question does not need the row label repeated.
  const single = p.rows.length === 1;
  return (
    <div className={single ? '' : 'divide-y divide-slate-100'}>
      {p.rows.map((r) => (
        <div key={r.question} className={single ? 'mt-3' : 'py-4 first:pt-3 last:pb-0'}>
          <Row row={r} showLabel={!single || r.label !== p.title} />
        </div>
      ))}
    </div>
  );
}

function LadderCard({ p }: { p: LadderPrompt }) {
  const answers = useAppStore((s) => s.answers);
  const expertise = useAppStore((s) => s.expertise);
  const setAnswers = useAppStore((s) => s.setAnswers);
  const selected = ladderSelection(p, answers);
  return (
    <div className="mt-3">
      {expertise === 'expert' && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {p.questions.map((id) => (
            <TechTag key={id}>{questionById[id].tech}</TechTag>
          ))}
        </div>
      )}
      <div className="grid gap-2">
        {p.options.map((o, i) => (
          <OptionCard key={o.label} label={o.label} selected={selected === i} onClick={() => setAnswers(ladderAnswers(p, i))} />
        ))}
      </div>
      <NotSure selected={ladderUnsure(p, answers)} onClick={() => setAnswers(ladderAnswers(p, 'unsure'))} />
    </div>
  );
}

function PromptCard({ p, number }: { p: Prompt; number: number }) {
  const expertise = useAppStore((s) => s.expertise);
  const q11AutoFilled = useAppStore((s) => !!s.autoFilled.Q11);
  return (
    <Card className="p-6">
      <div className="flex gap-3">
        <span className="mt-0.5 text-sm font-bold text-slate-400">{number}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-snug text-slate-900">
            {p.title}
            {p.type === 'rows' && p.rows.length === 1 && p.rows[0].question === 'Q11' && q11AutoFilled && <AutoTag />}
          </h2>
          <WhyWeAsk>
            {p.why}
            {expertise !== 'basic' && (
              <span className="mt-2 flex">
                <FrameworkTags questionIds={promptQuestionIds(p)} />
              </span>
            )}
          </WhyWeAsk>
          {p.type === 'rows' ? <RowsCard p={p} /> : <LadderCard p={p} />}
        </div>
      </div>
    </Card>
  );
}

/** Quick tier: the few questions that matter most, on one page. */
function QuickQuestionnaire() {
  const state = useAppStore(useShallow((s) => ({ profile: s.profile, answers: s.answers })));
  const go = useAppStore((s) => s.go);
  const update = useAppStore((s) => s.update);
  const quick = quickPrompts(state.profile);
  const done = quick.filter((p) => promptComplete(p, state.answers)).length;
  const left = quick.length - done;
  const quickCount = quick.flatMap(promptQuestionIds).length;
  const cov = coverage(state.profile, state.answers);
  const rest = cov.notAsked.filter((id) => !quick.some((p) => promptQuestionIds(p).includes(id))).length;

  const switchToFull = () => {
    update({ tier: 'full' });
    go('questions', firstOpenSection(state.profile, state.answers));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <ProgressBar value={quick.length ? done / quick.length : 0} label={`Step 3 of 3 · Quick check · ${done} of ${quick.length} cards done`} />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Quick check</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-800">
          <Zap className="h-4 w-4" aria-hidden /> {quickCount} questions · about {minutesFor(quickCount)} min
        </span>
      </div>
      <p className="mt-1 text-lg text-slate-600">{quickCheck.intro}</p>
      <p className="mt-3 rounded-xl bg-brand-50 px-4 py-3 text-slate-700">{promptIntro}</p>

      <div className="fade-in mt-6 space-y-5">
        {quick.map((p, i) => (
          <PromptCard key={p.id} p={p} number={i + 1} />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => go('domain')}>
          ← Back
        </Button>
        <div className="flex items-center gap-3">
          {left > 0 && <span className="text-sm text-slate-500">Finish {left === 1 ? '1 more card' : `${left} more cards`} to continue</span>}
          <Button disabled={left > 0} onClick={() => go('results')} className="px-6 py-3">
            See my results →
          </Button>
        </div>
      </div>
      {rest > 0 && (
        <p className="mt-6 text-center text-sm text-slate-500">
          Rather answer everything now?{' '}
          <button type="button" onClick={switchToFull} className="font-semibold text-brand-700 underline hover:text-brand-800">
            Switch to the full check-up
          </button>{' '}
          ({rest} more questions, about {minutesFor(rest)} min). Your answers carry over.
        </p>
      )}
    </div>
  );
}

export default function Questionnaire() {
  const tier = useAppStore((s) => s.tier);
  return tier === 'quick' ? <QuickQuestionnaire /> : <FullQuestionnaire />;
}

/** Full tier: every card, section by section. Cards can be skipped and answered later from the results. */
function FullQuestionnaire() {
  const state = useAppStore(useShallow((s) => ({ sectionIndex: s.sectionIndex, profile: s.profile, answers: s.answers })));
  const go = useAppStore((s) => s.go);
  const idx = Math.min(state.sectionIndex, sections.length - 1);
  const section = sections[idx];
  const all = visiblePrompts(state.profile);
  const here = all.filter((p) => p.section === section.id);

  const doneCount = all.filter((p) => promptComplete(p, state.answers)).length;
  const leftHere = here.filter((p) => !promptComplete(p, state.answers)).length;
  const last = idx === sections.length - 1;
  const numberOf = (id: string) => all.findIndex((p) => p.id === id) + 1;
  const anyAnswered = Object.keys(state.answers).length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <ProgressBar
        value={all.length ? doneCount / all.length : 0}
        label={`Step 3 of 3 · Section ${idx + 1} of ${sections.length} · ${doneCount} of ${all.length} cards done`}
      />

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Sections">
        {sections.map((s, i) => {
          const sp = all.filter((p) => p.section === s.id);
          const complete = sp.length > 0 && sp.every((p) => promptComplete(p, state.answers));
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go('questions', i)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium transition ${
                i === idx ? 'bg-brand-600 text-white' : complete ? 'bg-brand-100 text-brand-800 hover:bg-brand-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            >
              {complete && i !== idx && <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
              {s.title}
            </button>
          );
        })}
      </nav>

      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900">{section.title}</h1>
      <p className="mt-1 text-lg text-slate-600">{section.intro}</p>
      {idx === 0 && <p className="mt-3 rounded-xl bg-brand-50 px-4 py-3 text-slate-700">{promptIntro}</p>}

      <div key={section.id} className="fade-in mt-6 space-y-5">
        {here.map((p) => (
          <PromptCard key={p.id} p={p} number={numberOf(p.id)} />
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => (idx === 0 ? go('domain') : go('questions', idx - 1))}>
          ← Back
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {leftHere > 0 && (
            <span className="text-sm text-slate-500">
              {leftHere === 1 ? '1 card' : `${leftHere} cards`} left here. You can skip and come back later.
            </span>
          )}
          {!last && anyAnswered && (
            <Button variant="ghost" onClick={() => go('results')}>
              Results so far
            </Button>
          )}
          <Button
            variant={leftHere > 0 ? 'secondary' : 'primary'}
            onClick={() => (last ? go('results') : go('questions', idx + 1))}
            className="px-6 py-3"
          >
            {last ? 'See my results →' : leftHere > 0 ? 'Skip for now →' : 'Next section →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
