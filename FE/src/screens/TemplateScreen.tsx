import { useState } from 'react';
import { ExpertisePicker } from '../components/Expertise';
import { Button, ProgressBar } from '../components/ui';
import { templateById, templates } from '../engine/data';
import { visibleQuestions } from '../engine/scoring';
import type { AppApi } from '../state';

export default function TemplateScreen({ app }: { app: AppApi }) {
  const { state, update, go } = app;
  // Coming back from results to switch templates should not restart the check-up.
  const finished = !!state.profile.sector && visibleQuestions(state.profile).every((q) => state.answers[q.id]);
  // The standards choice is jargon for someone who asked for the simple view: default it, and offer it on request.
  const [showTemplates, setShowTemplates] = useState(state.expertise !== 'basic');
  const templatesVisible = showTemplates || state.expertise !== 'basic';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <ProgressBar value={0} label="Before you start" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900">How comfortable are you with tech?</h1>
      <p className="mt-1 text-lg text-slate-600">
        We'll word the questions and your results to match. Your scores come out the same either way, and you can switch any time on your results.
      </p>
      <div className="mt-6">
        <ExpertisePicker value={state.expertise} onChange={(expertise) => update({ expertise })} />
      </div>

      {!templatesVisible ? (
        <p className="mt-10 text-slate-600">
          We'll check you against the <b className="text-slate-800">{templateById[state.template].name}</b>, the Canadian baseline most customers and insurers ask
          about.{' '}
          <button type="button" onClick={() => setShowTemplates(true)} className="font-semibold text-brand-700 underline hover:text-brand-800">
            Choose a different standard
          </button>
        </p>
      ) : (
        <>
        <h2 className="mt-12 text-2xl font-bold tracking-tight text-slate-900">Which standard should we report against?</h2>
        <p className="mt-1 text-slate-600">
          You answer the same plain-language questions either way. This only changes which standard your results and Supplier Security Summary are measured
          against, and you can switch later.
        </p>

        <div role="radiogroup" aria-label="Report template" className="mt-6 grid gap-4 md:grid-cols-2">
          {templates.map((t) => {
            const selected = state.template === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => update({ template: t.id })}
                className={`flex flex-col rounded-2xl border bg-white p-6 text-left shadow-sm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${
                  selected ? 'border-brand-600 ring-2 ring-brand-600' : 'border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-bold text-slate-900">{t.name}</h2>
                  <span
                    aria-hidden
                    className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-brand-600' : 'border-slate-300'}`}
                  >
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
                  </span>
                </div>
                <p className="mt-1 leading-relaxed text-slate-700">{t.tagline}</p>
                <p className="mt-3 text-sm text-slate-600">
                  <b className="text-slate-800">Best for:</b> {t.bestFor}
                </p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  {t.reportsOn.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-slate-500">Not sure? Keep the first one. It is what most customers and insurers ask about.</p>
        </>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => go(finished ? 'results' : 'landing')}>
          ← Back
        </Button>
        <Button onClick={() => go(finished ? 'results' : 'profile')} className="px-6 py-3">
          {finished ? 'Show my results →' : 'Continue →'}
        </Button>
      </div>
    </div>
  );
}
