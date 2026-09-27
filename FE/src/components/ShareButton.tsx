import { Lock } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCreateShare } from '../api/hooks';
import { PasswordField } from './PasswordField';
import { Button } from './ui';

const MIN_LENGTH = 8;

/** Saves a password-protected snapshot to the BE and shows a read-only link for a broker or grocery DC. */
export default function ShareButton() {
  const share = useCreateShare();
  const url = share.data?.shareUrl;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url!);
      setCopied(true);
    } catch {
      /* the link is selectable in the input */
    }
  };

  if (!url)
    return (
      <>
        <Button variant="secondary" onClick={() => setOpen(true)} className="w-full py-2 text-sm">
          Share with a partner
        </Button>
        {open && <PasswordDialog share={share} onClose={() => setOpen(false)} />}
      </>
    );

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <label htmlFor="share-url" className="text-sm font-semibold text-slate-700">
        Read-only link for your customers and brokers
      </label>
      <div className="flex min-w-0 gap-2">
        <input
          id="share-url"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="w-full min-w-0 flex-1 truncate rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <Button onClick={copy} className="shrink-0 px-3 py-2 text-sm">
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <span className="flex items-start gap-1.5 text-xs text-slate-500">
        <Lock size={12} className="mt-0.5 shrink-0" />
        <span>
          Viewers need the password you chose. Send it separately from the link, for example by phone. The link works until{' '}
          {new Date(share.data!.expiresAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}.
        </span>
      </span>
    </div>
  );
}

function PasswordDialog({ share, onClose }: { share: ReturnType<typeof useCreateShare>; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const problem =
    password.length < MIN_LENGTH ? `Use at least ${MIN_LENGTH} characters.` : password !== confirm ? "The two passwords don't match." : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    share.mutate(password, { onSuccess: onClose });
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current.close()}
      aria-labelledby="share-dialog-title"
      className="w-[min(28rem,calc(100vw-2rem))] rounded-2xl p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <div>
          <h2 id="share-dialog-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Lock size={18} className="text-brand-600" /> Protect the link with a password
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Anyone opening the link will be asked for this password. We store only a scrambled (hashed) version and can't recover it, so keep a note of it.
          </p>
        </div>
        <PasswordField id="share-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
        <PasswordField id="share-password-confirm" label="Type it again" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {touched && problem && <p className="text-sm text-rose-700">{problem}</p>}
        {share.isError && <p className="text-sm text-rose-700">Couldn't create a link right now. Try again in a moment.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => ref.current?.close()} className="py-2 text-sm">
            Cancel
          </Button>
          <Button type="submit" disabled={share.isPending} className="py-2 text-sm">
            {share.isPending ? 'Creating link…' : 'Create link'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
