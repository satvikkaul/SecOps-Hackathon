import FrameworkTags from '../components/FrameworkTags';
import { Button, Card, OptionCard, ProgressBar, WhyWeAsk } from '../components/ui';
import { sections } from '../engine/data';
import {
  ladderAnswers,
  ladderSelection,
  ladderUnsure,
  promptComplete,
  promptIntro,
  promptQuestionIds,
  rowLabel,
  visiblePrompts,
  type LadderPrompt,
  type PromptRow,
  type RowsPrompt,
} from '../engine/prompts';
import type { AnswerValue } from '../engine/types';
import type { AppApi } from '../state';

const TONE: Record<string, 'yes' | 'partial' | 'no' | 'neutral'> = { yes: 'yes', partial: 'partial', no: 'no', na: 'neutral' };

function NotSure({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`mt-2 rounded-lg px-2.5 py-1 text-sm font-medium transition ${
        selected ? 'bg-slate-700 text-white' : 'text-slate-500 underline decoration-dotted underline-offset-4 hover:text-slate-800'
      }`}
    >
      {selected ? "✓ Not sure, we'll add it to your list to check" : 'Not sure'}
    </button>
  );
}

function AutoTag() {
  return (
    <span className="ml-2 inline-flex rounded-full bg-sky-100 px-2 py-0.5 align-middle text-xs font-semibold text-sky-800">Filled in from domain check</span>
  );
}

function Row({ row, app, showLabel }: { row: PromptRow; app: AppApi; showLabel: boolean }) {
  const { state, setAnswer } = app;
  const current = state.answers[row.question];
  const choices: { value: AnswerValue; label: string }[] = [...row.options, ...(row.na ? [{ value: 'na' as const, label: row.na }] : [])];
  return (
    <div>
      {showLabel && (
        <div className="font-medium leading-snug text-slate-900">
          {rowLabel(row, state.profile)}
          {row.question === 'Q11' && state.autoFilled.Q11 && <AutoTag />}
        </div>
      )}
      <div className={`mt-2.5 grid gap-2 sm:grid-cols-2 ${choices.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {choices.map((o) => (
          <OptionCard key={o.value} label={o.label} tone={TONE[o.value]} selected={current === o.value} onClick={() => setAnswer(row.question, o.value)} />
        ))}
      </div>
      <NotSure selected={current === 'unsure'} onClick={() => setAnswer(row.question, 'unsure')} />
    </div>
  );
}

function RowsCard({ p, app }: { p: RowsPrompt; app: AppApi }) {
  // A single-row card whose title already asks the question does not need the row label repeated.
  const single = p.rows.length === 1;
  return (
    <div className={single ? '' : 'divide-y divide-slate-100'}>
      {p.rows.map((r) => (
        <div key={r.question} className={single ? 'mt-3' : 'py-4 first:pt-3 last:pb-0'}>
          <Row row={r} app={app} showLabel={!single || r.label !== p.title} />
        </div>
      ))}
    </div>
  );
}

function LadderCard({ p, app }: { p: LadderPrompt; app: AppApi }) {
  const { state, setAnswers } = app;
  const selected = ladderSelection(p, state.answers);
  return (
    <div className="mt-3">
      <div className="grid gap-2">
        {p.options.map((o, i) => (
          <OptionCard key={o.label} label={o.label} selected={selected === i} onClick={() => setAnswers(ladderAnswers(p, i))} />
        ))}
      </div>
      <NotSure selected={ladderUnsure(p, state.answers)} onClick={() => setAnswers(ladderAnswers(p, 'unsure'))} />
    </div>
  );
}

export default function Questionnaire({ app }: { app: AppApi }) {
  const { state, go } = app;
  const idx = Math.min(state.sectionIndex, sections.length - 1);
  const section = sections[idx];
  const all = visiblePrompts(state.profile);
  const here = all.filter((p) => p.section === section.id);

  const doneCount = all.filter((p) => promptComplete(p, state.answers)).length;
  const leftHere = here.filter((p) => !promptComplete(p, state.answers)).length;
  const last = idx === sections.length - 1;
  const numberOf = (id: string) => all.findIndex((p) => p.id === id) + 1;

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
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                i === idx ? 'bg-brand-600 text-white' : complete ? 'bg-brand-100 text-brand-800 hover:bg-brand-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            >
              {complete && i !== idx ? '✓ ' : ''}
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
          <Card key={p.id} className="p-6">
            <div className="flex gap-3">
              <span className="mt-0.5 text-sm font-bold text-slate-400">{numberOf(p.id)}</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-snug text-slate-900">
                  {p.title}
                  {p.type === 'rows' && p.rows.length === 1 && p.rows[0].question === 'Q11' && state.autoFilled.Q11 && <AutoTag />}
                </h2>
                <WhyWeAsk>
                  {p.why}
                  <span className="mt-2 flex">
                    <FrameworkTags questionIds={promptQuestionIds(p)} />
                  </span>
                </WhyWeAsk>
                {p.type === 'rows' ? <RowsCard p={p} app={app} /> : <LadderCard p={p} app={app} />}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => (idx === 0 ? go('domain') : go('questions', idx - 1))}>
          ← Back
        </Button>
        <div className="flex items-center gap-3">
          {leftHere > 0 && <span className="text-sm text-slate-500">Finish {leftHere === 1 ? '1 more card' : `${leftHere} more cards`} to continue</span>}
          <Button disabled={leftHere > 0} onClick={() => (last ? go('results') : go('questions', idx + 1))} className="px-6 py-3">
            {last ? 'See my results →' : 'Next section →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
