import { Copy, Mail, Send, Users } from 'lucide-react';
import { useState } from 'react';
import { useInviteSupplier, useSupplyChain } from '../api/hooks';
import type { CreatedInvite, ShareChoice, SupplyChainSupplier } from '../api/endpoints';
import { useAppStore } from '../store/appStore';
import { BAND_STYLES, BandBadge, Button, Card, Pill } from './ui';

const inputClass =
  'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200';

const STATUS_LABELS: Record<SupplyChainSupplier['status'], string> = {
  pending: 'Waiting',
  submitted: 'Responded',
  filled_by_buyer: 'You filled it in',
  timed_out: 'No response',
};

const SHARED_LABELS: Record<ShareChoice, string> = {
  score: 'Score only',
  report: 'Report only',
  both: 'Score and report',
};

function CopyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className={`flex-1 truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-800 ring-1 ring-slate-200 ${mono ? 'text-base tracking-[0.3em]' : 'text-xs'}`}>
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/** What the buyer gets back for one invite. The PIN only comes back when the email didn't go out
 * (no Brevo key, or the send failed) — then the buyer has to pass it on themselves, so it's shown
 * prominently. A successful send never returns it, and this card says so instead. */
function InviteResult({ invite, supplierName }: { invite: CreatedInvite; supplierName: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-900">{supplierName}</span>
        {invite.emailSent ? (
          <Pill className="bg-emerald-100 text-emerald-800">
            <Mail className="h-3 w-3" aria-hidden /> Emailed
          </Pill>
        ) : (
          <Pill className="bg-amber-100 text-amber-900">Email not sent — send this yourself</Pill>
        )}
      </div>
      <div className="mt-2 grid gap-2">
        <CopyField label="Invite link" value={invite.inviteUrl} />
        {invite.pin ? (
          <CopyField label="PIN" value={invite.pin} mono />
        ) : (
          <p className="text-xs text-slate-500">The PIN was emailed to them and isn't shown here.</p>
        )}
      </div>
    </div>
  );
}

/** Screen 1: the buyer asks a supplier to complete their own check-up. */
function InviteSupplierForm() {
  const invite = useInviteSupplier();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ invite: CreatedInvite; supplierName: string }[]>([]);

  const submit = () => {
    const supplierName = name.trim();
    invite.mutate(
      { supplierName, supplierEmail: email.trim() },
      {
        onSuccess: (created) => {
          setSent((prev) => [{ invite: created, supplierName }, ...prev]);
          setName('');
          setEmail('');
        },
      },
    );
  };

  return (
    <Card className="p-4 md:p-6">
      <h3 className="flex items-center gap-2 font-bold text-slate-900">
        <Send className="h-4 w-4 text-brand-700" strokeWidth={2.25} aria-hidden />
        Invite a supplier
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        They get a link and a 6-digit PIN, complete the same check-up, and choose what to share back with you.
      </p>
      <form
        className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && email.trim()) submit();
        }}
      >
        <input className={inputClass} placeholder="Supplier name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputClass} type="email" placeholder="name@supplier.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={!name.trim() || !email.trim() || invite.isPending} className="px-4 py-2 text-sm">
          {invite.isPending ? 'Sending…' : 'Send invite'}
        </Button>
      </form>
      {invite.isError && <p className="mt-2 text-sm text-rose-700">Couldn't create that invite. Check the email address and try again.</p>}
      {sent.length > 0 && (
        <div className="mt-4 grid gap-2">
          {sent.map((s) => (
            <InviteResult key={s.invite.inviteId} invite={s.invite} supplierName={s.supplierName} />
          ))}
        </div>
      )}
    </Card>
  );
}

function SupplierRow({ supplier }: { supplier: SupplyChainSupplier }) {
  const band = supplier.shared.posture?.band;
  const responded = supplier.status === 'submitted' || supplier.status === 'filled_by_buyer';
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-100 px-3 py-2.5 first:border-t-0">
      <Pill>Tier {supplier.level}</Pill>
      <span className="flex-1 font-medium text-slate-800">{supplier.supplierName}</span>
      <span className={`text-sm ${responded ? 'text-slate-600' : supplier.status === 'timed_out' ? 'text-rose-700' : 'text-slate-500'}`}>
        {STATUS_LABELS[supplier.status]}
      </span>
      <span className="w-36 text-sm text-slate-500">{supplier.shareChoice ? SHARED_LABELS[supplier.shareChoice] : '—'}</span>
      {band ? <BandBadge band={band} size="sm" /> : <span className="text-sm text-slate-400">—</span>}
    </li>
  );
}

/** Screen 4: everything below this business in the chain, carrying only what each supplier agreed
 * to share. A supplier who shared just the report has no band here — that's the BE's filtering
 * showing through, not missing data. */
function SupplyChainReport({ assessmentId }: { assessmentId: string }) {
  const chain = useSupplyChain(assessmentId);

  if (chain.isPending) return <Card className="p-4 text-sm text-slate-500">Loading your chain…</Card>;
  if (chain.isError) return <Card className="p-4 text-sm text-rose-700">Couldn't load your supply chain. Refresh to try again.</Card>;
  if (chain.data.invited === 0) return null;

  const band = chain.data.highestRiskBand;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap gap-6 border-b border-slate-100 p-4 md:p-6">
        <div>
          <div className="text-3xl font-extrabold tabular-nums text-slate-900">{chain.data.respondedPct}%</div>
          <div className="text-sm text-slate-600">
            responded — {chain.data.responded} of {chain.data.invited}
          </div>
        </div>
        <div>
          <div className={`text-3xl font-extrabold ${band ? BAND_STYLES[band].text : 'text-slate-400'}`}>{band ?? '—'}</div>
          <div className="text-sm text-slate-600">{band ? 'highest risk in your chain' : 'no scores shared yet'}</div>
        </div>
      </div>
      <ul>
        {chain.data.suppliers.map((s, i) => (
          <SupplierRow key={`${s.supplierName}-${i}`} supplier={s} />
        ))}
      </ul>
    </Card>
  );
}

/** The buyer's half of supplier invites: send them (screen 1) and read what came back (screen 4).
 * Both need a saved assessment to hang off, so the report only appears once the first invite has
 * saved this check-up — before that there is, by definition, no chain to show. */
export default function SupplyChainPanel() {
  const assessmentId = useAppStore((s) => s.assessmentId);

  return (
    <div className="no-print mt-6 grid gap-4">
      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
        <Users className="h-4 w-4 text-brand-700" strokeWidth={2.25} aria-hidden />
        Your own suppliers
      </div>
      <InviteSupplierForm />
      {assessmentId && <SupplyChainReport assessmentId={assessmentId} />}
    </div>
  );
}
