import FrameworkTags from '../components/FrameworkTags';
import RiskRegisterButton from '../components/RiskRegisterButton';
import { StatusPill } from '../components/StandardsPanel';
import { Button } from '../components/ui';
import { countStatuses, type CioscResult } from '../engine/controls';
import { cccs as cccsCatalog, ciosc as cioscCatalog, cis as cisCatalog, profileQuestions, ranking } from '../engine/data';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { useResults } from '../useResults';

function CioscSummary({ rows }: { rows: CioscResult[] }) {
  const counts = countStatuses(rows);
  return (
    <section className="mt-4 print-avoid-break">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">CyberSecure Canada baseline (CAN/CIOSC 104:2021)</h2>
        <div className="text-sm text-slate-600">
          {counts.Met} met · {counts['Partially met']} partly · {counts['Not yet met']} not yet · {counts['Not assessed']} not assessed
        </div>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-1 pr-3 font-semibold">Section</th>
            <th className="py-1 pr-3 font-semibold">Assessed through CCCS</th>
            <th className="py-1 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-slate-100">
              <td className="py-1 pr-3 text-slate-800">
                <span className="mr-1.5 font-mono text-xs text-slate-500">{s.id}</span>
                <span className="font-medium">{s.name}</span>
              </td>
              <td className="py-1 pr-3 font-mono text-xs text-slate-600">{s.cccsIds.join(', ') || '—'}</td>
              <td className="py-1">
                <StatusPill status={s.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-xs text-slate-500">
        Section numbers follow the OCI Digital Competence Centre Cybersecurity Workbook. Sections marked Not assessed are outside what this check-up asks about.
      </p>
    </section>
  );
}

export default function Summary() {
  const state = useAppStore(
    useShallow((s) => ({ company: s.company, domain: s.domain, profile: s.profile, answers: s.answers, rankingMode: s.rankingMode, template: s.template })),
  );
  const go = useAppStore((s) => s.go);
  const { assessment, ranked, cccs, cis, ciosc, otherPractices, plan } = useResults(state.profile, state.answers, state.rankingMode);
  const sector = profileQuestions.find((q) => q.id === 'sector')?.options.find((o) => o.value === state.profile.sector)?.label ?? '—';
  const date = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const cccsCounts = countStatuses(cccs);
  const cisAssessed = cis.filter((s) => s.status !== 'Not assessed');
  const cisCounts = countStatuses(cisAssessed);
  const ig1 = cisAssessed.filter((s) => s.ig === 1);
  const ig1Met = ig1.filter((s) => s.status === 'Met').length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => go('results')}>
          ← Back to results
        </Button>
        <div className="flex flex-wrap gap-2">
          <RiskRegisterButton assessment={assessment} ranked={ranked} profile={state.profile} answers={state.answers} company={state.company} />
          <Button onClick={() => window.print()}>Print / Save as PDF</Button>
        </div>
      </div>

      <article className="print-page rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-widest text-brand-700">Supplier Security Summary</div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">{state.company || 'Your business'}</h1>
            <div className="mt-1 text-slate-600">
              {sector}
              {state.domain && <> · {state.domain}</>}
            </div>
          </div>
          <div className="text-right text-sm text-slate-600">
            <div className="font-semibold text-slate-800">{date}</div>
            <div>Self-assessed using Chain of Custody</div>
          </div>
        </header>

        {state.template === 'ciosc' ? (
          <CioscSummary rows={ciosc} />
        ) : (
          <section className="mt-4 print-avoid-break">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">CCCS baseline security controls</h2>
              <div className="text-sm text-slate-600">
                {cccsCounts.Met} met · {cccsCounts['Partially met']} partly · {cccsCounts['Not yet met']} not yet · {cccsCounts['Not assessed']} not assessed
              </div>
            </div>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3 font-semibold">Control</th>
                  <th className="py-1 pr-3 font-semibold">Requirements checked</th>
                  <th className="py-1 pr-3 font-semibold">Related CIS v8.1</th>
                  <th className="py-1 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {cccs.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-1 pr-3 text-slate-800">
                      <span className="mr-1.5 font-mono text-xs text-slate-500">{c.id}</span>
                      <span className="font-medium">{c.name}</span>
                    </td>
                    <td className="py-1 pr-3 text-xs text-slate-600">
                      {c.reqsAssessed.length} of {c.reqsTotal}
                      {c.reqsAssessed.length > 0 && <span className="text-slate-400"> ({c.reqsAssessed.map((r) => r.replace(`${c.id}.`, '.')).join(' ')})</span>}
                    </td>
                    <td className="py-1 pr-3 font-mono text-xs text-slate-600">{c.cisIds.join(', ') || '—'}</td>
                    <td className="py-1">
                      <StatusPill status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-xs text-slate-500">
              CIS Controls v8.1: {cisAssessed.length} safeguards assessed ({cisCounts.Met} met, {cisCounts['Partially met']} partly, {cisCounts['Not yet met']} not yet),
              including {ig1.length} from Implementation Group 1 ({ig1Met} met).
            </p>
          </section>
        )}

        {otherPractices.length > 0 && (
          <section className="mt-4 print-avoid-break">
            <h2 className="text-lg font-bold text-slate-900">Payment and shipment safeguards</h2>
            <p className="text-xs text-slate-500">
              Business procedures that the {state.template === 'ciosc' ? 'CyberSecure Canada' : 'CCCS and CIS'} baselines do not cover.
            </p>
            <ul className="mt-1.5 space-y-1 text-sm">
              {otherPractices.map((p) => (
                <li key={p.question.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1">
                  <span className="font-medium text-slate-800">{p.question.topic}</span>
                  <StatusPill status={p.status} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-4 print-avoid-break">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900">Our improvement commitments</h2>
            <span className="text-xs text-slate-500">Prioritized by {ranking.modes[state.rankingMode].label.toLowerCase()}</span>
          </div>
          {plan.top.length === 0 ? (
            <p className="mt-2 text-slate-700">All recommended baseline improvements are in place.</p>
          ) : (
            <ol className="mt-1.5 space-y-1.5">
              {plan.top.map((r, i) => (
                <li key={r.action.id} className="flex items-start gap-3 text-sm">
                  <span className="w-5 shrink-0 font-bold text-slate-500">{i + 1}.</span>
                  <span className="flex-1 text-slate-800">
                    <b>{r.action.title}.</b> {r.action.whatToDo} <FrameworkTags questionIds={r.action.questionIds} className="ml-1 align-middle" />
                  </span>
                  <span className="shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-800">Within {r.timeframe} days</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="mt-4 border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-500">
          This summary is self-reported and is not a certification. Statuses come from answers to a plain-language questionnaire. A status covers only the requirements
          listed as checked; other requirements in a control were not assessed. References:{' '}
          {state.template === 'ciosc' ? `${cioscCatalog.source}; ${cccsCatalog.source}` : `${cccsCatalog.source}; ${cisCatalog.source}`}.
        </footer>
      </article>
    </div>
  );
}
