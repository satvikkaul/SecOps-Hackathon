import { useEffect } from 'react';
import { useSharedAssessment } from '../api/hooks';
import { StatusPill } from '../components/StandardsPanel';
import { BandBadge, Card } from '../components/ui';
import { describeFindings, type Indicator } from '../engine/dns';

const DOT: Record<Indicator, string> = { green: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-rose-500', grey: 'bg-slate-400' };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

/** Read-only view of a shared assessment (`?share=<token>`). Renders the stored snapshot; nothing is re-scored. */
export default function SharedSummary({ token }: { token: string }) {
  const lookup = useSharedAssessment(token);
  useNoIndex();

  if (lookup.isError) return <Message title="Couldn't load this summary" body="Check your connection and refresh the page." />;
  if (lookup.isPending) return <Message title="Loading…" />;
  if (lookup.data.status === 'missing') return <Message title="Link not found" body="This link is wrong or no longer exists. Ask the sender for a new one." />;
  if (lookup.data.status === 'expired') return <Message title="This link has expired" body="Share links stop working after a while. Ask the sender for a new one." />;

  const data = lookup.data.assessment;
  const { results: r, dns } = data;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-widest text-brand-700">Supplier Security Summary · Read-only</div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{data.company}</h1>
            <div className="mt-1 text-slate-600">
              {r.sector || '—'}
              {data.domain && <> · {data.domain}</>}
            </div>
          </div>
          <div className="text-right text-sm text-slate-600">
            <div className="font-semibold text-slate-800">Assessed {fmtDate(data.createdAt)}</div>
            {data.expiresAt && <div className="text-xs text-slate-500">Link valid until {fmtDate(data.expiresAt)}</div>}
            <div className="mt-1 flex items-center justify-end gap-2">
              Overall risk <BandBadge band={r.posture.band} />
            </div>
          </div>
        </header>

        <section className="mt-6">
          <h2 className="text-lg font-bold text-slate-900">Email spoofing check</h2>
          {dns ? (
            <>
              <p className="text-xs text-slate-500">
                Independently checked by Chain of Custody from public DNS records{dns.checkedAt && <> on {fmtDate(dns.checkedAt)}</>}. Not self-reported.
              </p>
              <ul className="mt-2 space-y-1.5">
                {describeFindings(dns).map((f) => (
                  <li key={f.key} className="flex gap-2 text-sm text-slate-800">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[f.indicator]}`} />
                    <span>
                      <b>{f.title}.</b> {f.message}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-600">No email domain was provided.</p>
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-bold text-slate-900">Biggest risks</h2>
          <ul className="mt-2 space-y-1.5">
            {r.scenarios.slice(0, 3).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5 text-sm">
                <span className="font-medium text-slate-800">{s.name}</span>
                <BandBadge band={s.band} size="sm" />
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-bold text-slate-900">Improvement commitments</h2>
          {r.topActions.length === 0 ? (
            <p className="mt-2 text-slate-700">All recommended baseline improvements are in place.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {r.topActions.map((a, i) => (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <span className="w-5 shrink-0 font-bold text-slate-500">{i + 1}.</span>
                  <span className="flex-1 text-slate-800">
                    <b>{a.title}.</b> {a.whatToDo}
                    {a.cccs.length > 0 && <span className="ml-1 font-mono text-xs text-slate-500">{a.cccs.join(' ')}</span>}
                  </span>
                  <span className="shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">Within {a.timeframe} days</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-6 overflow-x-auto">
          <h2 className="text-lg font-bold text-slate-900">CCCS baseline security controls</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {r.cccs.map((c) => (
                <tr key={c.control} className="border-b border-slate-100">
                  <td className="py-1 pr-3 text-slate-800">
                    <span className="mr-1.5 font-mono text-xs text-slate-500">{c.control}</span>
                    <span className="font-medium">{c.name}</span>
                  </td>
                  <td className="py-1 text-right">
                    <StatusPill status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="mt-6 border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-500">
          Control statuses and commitments are self-reported through a plain-language questionnaire and are not a certification. The email spoofing check is
          independently verified.
        </footer>
      </article>
    </div>
  );
}

/** A share link is a bearer secret: keep the page, and the company's summary, out of search results. */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

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
