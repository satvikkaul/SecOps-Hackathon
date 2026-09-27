import { useState } from 'react';
import { useCreateShare } from '../api/hooks';
import { Button } from './ui';

/** Saves a snapshot to the BE and shows a read-only link for a broker or grocery DC. */
export default function ShareButton() {
  const share = useCreateShare();
  const url = share.data?.shareUrl;
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
      <div className="flex flex-col gap-1">
        <Button variant="secondary" onClick={() => share.mutate()} disabled={share.isPending} className="w-full py-2 text-sm">
          {share.isPending ? 'Creating link…' : 'Share with a partner'}
        </Button>
        {share.isError && <span className="text-sm text-rose-700">Couldn't create a link right now. Try again in a moment.</span>}
      </div>
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
      {share.data && (
        <span className="text-xs text-slate-500">
          Anyone with this link can view the summary until{' '}
          {new Date(share.data.expiresAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}.
        </span>
      )}
    </div>
  );
}
