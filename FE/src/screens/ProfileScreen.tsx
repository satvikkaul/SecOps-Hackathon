import { Button, Card, OptionCard, ProgressBar, WhyWeAsk } from '../components/ui';
import { profileQuestions } from '../engine/data';
import type { AppApi } from '../state';

/** emailProvider is optional here because the domain check on the next screen can fill it in. */
const OPTIONAL = new Set(['emailProvider']);

export default function ProfileScreen({ app }: { app: AppApi }) {
  const { state, update, setProfile, go } = app;
  const required = profileQuestions.filter((q) => !OPTIONAL.has(q.id));
  const answered = required.filter((q) => state.profile[q.id]).length;
  const done = answered === required.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <ProgressBar value={answered / required.length} label={`Step 1 of 3 · About your business · ${answered} of ${required.length} answered`} />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900">About your business</h1>
      <p className="mt-1 text-lg text-slate-600">This helps us understand what an attack would cost you. It takes about two minutes.</p>

      <div className="mt-8 space-y-5">
        <Card className="p-6">
          <label htmlFor="company" className="text-lg font-semibold text-slate-900">
            What is your business called? <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <p className="text-sm text-slate-500">Shown on your results and your Supplier Security Summary.</p>
          <input
            id="company"
            value={state.company}
            onChange={(e) => update({ company: e.target.value, isDemo: false })}
            placeholder="e.g. Maple Ridge Cold Storage"
            className="mt-3 w-full max-w-lg rounded-xl border border-slate-300 px-4 py-3 text-lg focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
        </Card>

        {profileQuestions.map((q, i) => (
          <Card key={q.id} className="p-6">
            <div className="flex gap-3">
              <span className="mt-0.5 text-sm font-bold text-slate-400">{i + 1}</span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold leading-snug text-slate-900">
                  {q.text}
                  {OPTIONAL.has(q.id) && <span className="font-normal text-slate-500"> (optional, the next step can fill this in)</span>}
                </h2>
                <WhyWeAsk>{q.why}</WhyWeAsk>
                <div className={`mt-4 grid gap-2.5 ${q.options.length > 4 ? 'sm:grid-cols-2 lg:grid-cols-3' : q.options.length > 2 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:max-w-md'}`}>
                  {q.options.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={o.label}
                      icon={o.icon}
                      selected={state.profile[q.id] === o.value}
                      onClick={() => setProfile(q.id, o.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => go('template')}>
          ← Back
        </Button>
        <div className="flex items-center gap-3">
          {!done && <span className="text-sm text-slate-500">Answer {required.length - answered} more to continue</span>}
          <Button disabled={!done} onClick={() => go('domain')} className="px-6 py-3">
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
