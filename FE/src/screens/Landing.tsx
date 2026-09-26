import { Button, Card } from '../components/ui';
import { demoPersona } from '../engine/data';
import type { AppApi } from '../state';

const STEPS = [
  { title: 'Tell us about your business', body: 'Nine quick questions about what you do and what hurts most when things stop.' },
  { title: 'Answer in plain language', body: 'About 26 yes-or-no style questions. No jargon, and "Not sure" is always an option.' },
  { title: 'Get your fix-first list', body: 'Your top risks, the cheapest fixes that matter most, and a summary to share with customers.' },
];

export default function Landing({ app }: { app: AppApi }) {
  const { state, go, loadDemo } = app;
  const hasProgress = !state.isDemo && (Object.keys(state.profile).length > 0 || Object.keys(state.answers).length > 0);

  const start = () => {
    // Starting a real check-up after viewing the demo should not keep the demo answers.
    if (state.isDemo) app.reset();
    go(hasProgress ? (Object.keys(state.answers).length > 0 ? 'questions' : 'profile') : 'template');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-center gap-10 py-14 md:grid-cols-[1.25fr_1fr] md:py-20">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-800">
            For farms, food processors, cold storage, carriers, and brokers
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-5xl">
            Chain of Custody
          </h1>
          <p className="mt-4 text-xl leading-relaxed text-slate-700 md:text-2xl">
            Find out where your business is most exposed to cyberattacks and what to fix first, in 10 minutes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={start} className="px-6 py-3 text-lg">
              {hasProgress ? 'Continue check-up' : 'Start check-up'} →
            </Button>
            <Button variant="secondary" onClick={loadDemo} className="px-6 py-3 text-lg">
              Load demo company
            </Button>
          </div>
          <p className="mt-4 text-sm text-slate-500">No sign-up, no account. Your scores are calculated on this computer.</p>
        </div>

        <Card className="p-6">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Demo company</div>
          <div className="mt-2 text-xl font-bold text-slate-900">{demoPersona.company}</div>
          <div className="text-slate-600">{demoPersona.location}</div>
          <p className="mt-3 leading-relaxed text-slate-700">{demoPersona.blurb}</p>
          <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
            <li>• Any dispatcher can reroute a load from a single email</li>
            <li>• Dispatchers share one load board login</li>
            <li>• Refrigeration vendor has always-on TeamViewer</li>
            <li>• Backups live on a USB drive in the office</li>
          </ul>
          <Button variant="secondary" onClick={loadDemo} className="mt-5 w-full">
            See their results
          </Button>
        </Card>
      </section>

      <section className="grid gap-4 pb-10 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="p-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 font-bold text-white">{i + 1}</div>
            <h3 className="mt-3 text-lg font-bold text-slate-900">{s.title}</h3>
            <p className="mt-1 leading-relaxed text-slate-600">{s.body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
