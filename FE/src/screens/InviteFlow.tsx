import { useEffect, useState } from 'react';
import { useInviteStatus, useSubmitInvite, useVerifyInvitePin } from '../api/hooks';
import type { ShareChoice } from '../api/endpoints';
import DomainCheck from './DomainCheck';
import ProfileScreen from './ProfileScreen';
import Questionnaire from './Questionnaire';
import { Button, Card, OptionCard } from '../components/ui';
import { useAppStore } from '../store/appStore';

const SHARE_CHOICES: { value: ShareChoice; label: string; detail: string }[] = [
  { value: 'score', label: 'Just the score', detail: 'Overall risk band only — High/Elevated/Moderate/Low, nothing else.' },
  { value: 'report', label: 'The full report', detail: 'Top risks, recommended fixes, and standards coverage — the same summary a partner share link shows.' },
  { value: 'both', label: 'Both', detail: 'The score up front, plus the full report.' },
];

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-20">
      <Card className="p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {body && <p className="mt-2 text-slate-600">{body}</p>}
      </Card>
    </div>
  );
}

function PinForm({ onSubmit, pending, error }: { onSubmit: (pin: string) => void; pending: boolean; error: string | null }) {
  const [pin, setPin] = useState('');
  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <Card className="p-8">
        <h1 className="text-xl font-bold text-slate-900">You've been asked to complete a check-up</h1>
        <p className="mt-2 text-slate-600">Enter the 6-digit PIN from your invite email to continue.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.length === 6) onSubmit(pin);
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-[0.5em] focus:border-brand-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          />
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          <Button type="submit" disabled={pin.length !== 6 || pending} className="mt-4 w-full">
            {pending ? 'Checking…' : 'Continue'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function FilledByBuyerToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        I'm filling this in on behalf of the supplier
      </label>
    </div>
  );
}

function ShareChoiceStep({
  inviterCompany,
  filledByBuyer,
  onSubmit,
  pending,
  error,
}: {
  inviterCompany?: string;
  filledByBuyer: boolean;
  onSubmit: (choice: ShareChoice) => void;
  pending: boolean;
  error: string | null;
}) {
  const [choice, setChoice] = useState<ShareChoice | null>(null);
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Card className="p-8">
        <h1 className="text-xl font-bold text-slate-900">What do you want {inviterCompany || 'them'} to see?</h1>
        <p className="mt-2 text-slate-600">
          Your raw answers are never shared, regardless of what you choose below — only the summary you pick.
        </p>
        <div className="mt-5 grid gap-2">
          {SHARE_CHOICES.map((c) => (
            <OptionCard key={c.value} label={`${c.label} — ${c.detail}`} selected={choice === c.value} onClick={() => setChoice(c.value)} />
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <Button disabled={!choice || pending} onClick={() => choice && onSubmit(choice)} className="mt-5 w-full">
          {pending ? 'Submitting…' : filledByBuyer ? 'Submit on their behalf' : 'Submit my check-up'}
        </Button>
      </Card>
    </div>
  );
}

/** `?invite=<token>`: a supplier completing a check-up someone else asked for. Follows the same
 * query-param-takes-over-the-app pattern as `?share=<token>` (see App.tsx / SharedSummary.tsx),
 * but reuses the existing Profile/Domain/Questionnaire screens verbatim rather than a read-only
 * view — the only new UI is the PIN gate and the final "what do you want them to see" step. */
export default function InviteFlow({ token }: { token: string }) {
  const status = useInviteStatus(token);
  const verifyPin = useVerifyInvitePin(token);
  const submit = useSubmitInvite(token);

  const [phase, setPhase] = useState<'pin' | 'assessment' | 'done'>('pin');
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifiedPin, setVerifiedPin] = useState<string | null>(null);
  const [inviterCompany, setInviterCompany] = useState<string>();
  const [filledByBuyer, setFilledByBuyer] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const screen = useAppStore((s) => s.screen);

  // Quick tier skips the Template screen (framework choice), which isn't this supplier's decision
  // to make — it goes straight to Profile. If they somehow back out to Landing, bounce right back.
  useEffect(() => {
    if (phase === 'assessment' && screen === 'landing') useAppStore.getState().startCheck('quick');
  }, [phase, screen]);

  const submitPin = (pin: string) => {
    setPinError(null);
    verifyPin.mutate(pin, {
      onSuccess: (lookup) => {
        if (lookup.status === 'found' && lookup.invite.verified) {
          setVerifiedPin(pin);
          setInviterCompany(lookup.invite.inviterCompany);
          useAppStore.getState().startCheck('quick');
          setPhase('assessment');
        } else {
          setPinError('Incorrect PIN — check your invite email and try again.');
        }
      },
      onError: () => setPinError("Couldn't check that PIN. Check your connection and try again."),
    });
  };

  const submitAssessment = (shareChoice: ShareChoice) => {
    if (!verifiedPin) return;
    setSubmitError(null);
    submit.mutate(
      { pin: verifiedPin, shareChoice, filledByBuyer },
      {
        onSuccess: () => setPhase('done'),
        onError: () => setSubmitError("Couldn't submit right now. Check your connection and try again."),
      },
    );
  };

  if (status.isPending) return <Message title="Loading…" />;
  if (status.isError) return <Message title="Couldn't load this invite" body="Check your connection and refresh the page." />;
  if (status.data.status === 'missing') return <Message title="Invite not found" body="This link is wrong or no longer exists. Ask the sender for a new one." />;
  if (phase === 'pin' && status.data.invite.completed)
    return <Message title="This check-up has already been completed" body="If that doesn't seem right, ask the sender for a new invite." />;
  if (phase === 'pin' && status.data.invite.expired)
    return <Message title="This invite has expired" body="Ask the sender to send you a new one." />;

  if (phase === 'pin') return <PinForm onSubmit={submitPin} pending={verifyPin.isPending} error={pinError} />;

  if (phase === 'done')
    return (
      <Message
        title="Thanks — your check-up is submitted"
        body={`${inviterCompany || 'They'} will see the summary you chose to share. You can close this page.`}
      />
    );

  // phase === 'assessment'
  if (screen === 'results')
    return (
      <ShareChoiceStep
        inviterCompany={inviterCompany}
        filledByBuyer={filledByBuyer}
        onSubmit={submitAssessment}
        pending={submit.isPending}
        error={submitError}
      />
    );
  return (
    <>
      <FilledByBuyerToggle checked={filledByBuyer} onChange={setFilledByBuyer} />
      {screen === 'profile' && <ProfileScreen />}
      {screen === 'domain' && <DomainCheck />}
      {screen === 'questions' && <Questionnaire />}
    </>
  );
}
