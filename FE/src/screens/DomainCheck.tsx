import { useState } from 'react';
import { Button, Card, OptionCard, ProgressBar } from '../components/ui';
import { demoPersona, profileQuestions } from '../engine/data';
import { prompts } from '../engine/prompts';
import { checkDomain, describeFindings, dmarcToAnswer, isValidDomain, normalizeDomain, type Indicator } from '../engine/dns';
import type { AnswerValue } from '../engine/types';
import type { AppApi } from '../state';

const DOT: Record<Indicator, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-400',
  red: 'bg-rose-500',
  grey: 'bg-slate-400',
};
const BG: Record<Indicator, string> = {
  green: 'border-emerald-200 bg-emerald-50',
  amber: 'border-amber-200 bg-amber-50',
  red: 'border-rose-200 bg-rose-50',
  grey: 'border-slate-200 bg-slate-50',
};

// Same answer wording as the DMARC row in the questionnaire
const q11Row = prompts.flatMap((p) => (p.type === 'rows' ? p.rows : [])).find((r) => r.question === 'Q11')!;
const Q11_OPTIONS: { value: AnswerValue; label: string; tone: 'yes' | 'partial' | 'no' | 'unsure' }[] = [
  ...q11Row.options.map((o) => ({ value: o.value, label: o.label, tone: o.value })),
  { value: 'unsure', label: 'Not sure', tone: 'unsure' },
];

export default function DomainCheck({ app }: { app: AppApi }) {
  const { state, update, go, setProfile, setAnswer } = app;
  const [input, setInput] = useState(state.domain);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const domain = normalizeDomain(input);
    if (!isValidDomain(domain)) {
      setError('That does not look like a domain. Try something like yourcompany.ca');
      return;
    }
    setError(null);
    setLoading(true);
    // The demo company uses stored results so the demo never depends on the network.
    const result = domain === demoPersona.domain ? demoPersona.dnsResult : await checkDomain(domain);
    setLoading(false);

    const q11 = dmarcToAnswer(result.dmarc);
    const provider = result.mx.provider;
    update({
      domain,
      dns: result,
      profile: provider ? { ...state.profile, emailProvider: provider } : state.profile,
      answers: q11 ? { ...state.answers, Q11: q11 } : state.answers,
      autoFilled: { emailProvider: !!provider, Q11: !!q11 },
    });
  };

  const dns = state.dns && state.dns.domain === normalizeDomain(input || state.domain) ? state.dns : null;
  const findings = dns ? describeFindings(dns) : [];
  const allFailed = findings.length > 0 && findings.every((f) => f.indicator === 'grey');
  const providerQ = profileQuestions.find((q) => q.id === 'emailProvider')!;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <ProgressBar value={1} label="Step 2 of 3 · Email domain check (optional)" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900">Check your email domain</h1>
      <p className="mt-1 text-lg leading-relaxed text-slate-600">
        We look up your domain's public email settings to see whether criminals could send fake emails in your name. It only reads public records and takes a few
        seconds.
      </p>

      <Card className="mt-6 p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <label htmlFor="domain" className="sr-only">
            Your email domain
          </label>
          <input
            id="domain"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="yourcompany.ca"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
          <Button type="submit" disabled={loading || !input.trim()} className="px-6 py-3">
            {loading ? 'Checking…' : 'Check domain'}
          </Button>
        </form>
        <p className="mt-2 text-sm text-slate-500">The part after the @ in your work email address.</p>
        {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

        {dns && (
          <div className="fade-in mt-6 space-y-3">
            {allFailed && (
              <p className="rounded-xl bg-slate-100 p-3 text-slate-700">
                Couldn't check right now (you may be offline). You can answer these manually below or in the questionnaire.
              </p>
            )}
            {findings.map((f) => (
              <div key={f.key} className={`flex gap-3 rounded-xl border p-4 ${BG[f.indicator]}`}>
                <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${DOT[f.indicator]}`} />
                <div>
                  <div className="font-semibold text-slate-900">{f.title}</div>
                  <p className="text-slate-700">{f.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {dns && (
        <Card className="fade-in mt-5 space-y-6 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {providerQ.text}
              {state.autoFilled.emailProvider && <AutoTag />}
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {providerQ.options.map((o) => (
                <OptionCard key={o.value} label={o.label} selected={state.profile.emailProvider === o.value} onClick={() => setProfile('emailProvider', o.value)} />
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Is your email domain protected against spoofing (DMARC)?
              {state.autoFilled.Q11 && <AutoTag />}
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {Q11_OPTIONS.map((o) => (
                <OptionCard key={o.value} label={o.label} tone={o.tone} selected={state.answers.Q11 === o.value} onClick={() => setAnswer('Q11', o.value)} />
              ))}
            </div>
          </div>
          <p className="text-sm text-slate-500">These were filled in from your domain check. Change them if they look wrong.</p>
        </Card>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => go('profile')}>
          ← Back
        </Button>
        <Button onClick={() => go('questions', 0)} className="px-6 py-3" variant={dns ? 'primary' : 'secondary'}>
          {dns ? 'Continue →' : 'Skip this step →'}
        </Button>
      </div>
    </div>
  );
}

function AutoTag() {
  return <span className="ml-2 inline-flex rounded-full bg-sky-100 px-2 py-0.5 align-middle text-xs font-semibold text-sky-800">Filled in from domain check</span>;
}
