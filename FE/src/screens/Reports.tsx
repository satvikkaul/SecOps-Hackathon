import { ArrowRight, FolderOpen, Inbox } from 'lucide-react';
import { useMyReports, useOpenReport } from '../api/hooks';
import { BandBadge, Button, Card } from '../components/ui';
import type { Band } from '../engine/types';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

/** Saved check-ups for the signed-in caller. Opening one restores it into the results screen. */
export default function Reports({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  const reports = useMyReports(signedIn);
  const open = useOpenReport();

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 sm:px-6">
        <Card className="p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Your reports</h1>
          <p className="mt-2 text-slate-600">Sign in to see the check-ups you've saved.</p>
          <Button onClick={onSignIn} className="mt-5">
            Sign in
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-slate-900">
            <FolderOpen className="h-7 w-7 text-brand-700" aria-hidden />
            Your reports
          </h1>
          <p className="mt-1 text-slate-600">Check-ups you've saved. Open one to pick up the plan, or save a new one from your results.</p>
        </div>
      </div>

      {reports.isPending && (
        <div className="mt-8 grid gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      )}

      {reports.isError && (
        <Card className="mt-8 p-6 text-sm text-rose-700">Couldn't load your reports. Check your connection and refresh.</Card>
      )}

      {reports.data && reports.data.length === 0 && (
        <Card className="mt-8 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Inbox className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-3 text-lg font-bold text-slate-900">No saved reports yet</h2>
          <p className="mt-1 text-slate-600">Finish a check-up, then choose Save your score. It will show up here.</p>
        </Card>
      )}

      {reports.data && reports.data.length > 0 && (
        <ul className="mt-8 grid gap-3">
          {reports.data.map((r) => {
            const opening = open.isPending && open.variables === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => open.mutate(r.id)}
                  disabled={open.isPending}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-bold text-slate-900">{r.company}</div>
                    <div className="mt-0.5 truncate text-sm text-slate-500">
                      {r.domain ? `${r.domain} · ` : ''}
                      Saved {fmtDate(r.createdAt)}
                    </div>
                  </div>
                  {r.band && <BandBadge band={r.band as Band} />}
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700">
                    {opening ? 'Opening…' : 'Open'}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open.isError && <p className="mt-3 text-sm text-rose-700">Couldn't open that report. It may have been removed.</p>}
    </div>
  );
}
