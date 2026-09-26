import { useState } from 'react';
import { createShare } from '../api';
import { useAppStore } from '../store/appStore';
import { Button } from './ui';

/** Saves a snapshot to the BE and shows a read-only link for a broker or grocery DC. */
export default function ShareButton() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      setUrl(await createShare(useAppStore.getState()));
    } catch {
      setError("Couldn't create a link right now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

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
      <div className="flex flex-col gap-1">
        <Button variant="secondary" onClick={share} disabled={busy}>
          {busy ? 'Creating link…' : 'Share with a partner'}
        </Button>
        {error && <span className="text-sm text-rose-700">{error}</span>}
      </div>
    );

  return (
    <div className="flex w-full flex-col gap-1 sm:w-auto">
      <label htmlFor="share-url" className="text-sm font-semibold text-slate-700">
        Read-only link for your customers and brokers
      </label>
      <div className="flex gap-2">
        <input
          id="share-url"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm sm:w-80"
        />
        <Button onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
    </div>
  );
}
