import { useState } from 'react';
import type { CccsResult, CisResult, ControlStatus, Evidence } from '../engine/controls';
import { cccs as cccsCatalog, cis as cisCatalog, questionById, questions } from '../engine/data';
import type { AnswerValue } from '../engine/types';

export const STATUS_STYLE: Record<ControlStatus, string> = {
  Met: 'bg-emerald-100 text-emerald-800',
  'Partially met': 'bg-amber-100 text-amber-900',
  'Not yet met': 'bg-rose-100 text-rose-800',
  'Not assessed': 'bg-slate-100 text-slate-500',
};

const ANSWER: Record<AnswerValue, string> = { yes: 'Yes', partial: 'Partly', no: 'No', unsure: 'Not sure', na: 'Does not apply' };

export function StatusPill({ status }: { status: ControlStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{status}</span>;
}

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) return <span className="text-slate-400">No questions cover this</span>;
  return (
    <ul className="space-y-0.5">
      {evidence.map((e) => (
        <li key={e.questionId}>
          <span className="font-semibold text-slate-700">{e.questionId}</span> {questionById[e.questionId].topic}:{' '}
          <span className="font-medium text-slate-900">{ANSWER[e.answer]}</span>
          {e.strength === 'partial' && <span className="text-slate-500"> (partial fit)</span>}
        </li>
      ))}
    </ul>
  );
}

function CccsTable({ rows }: { rows: CccsResult[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Control</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Requirements checked</th>
            <th className="px-3 py-2">Based on your answers</th>
            <th className="px-3 py-2">Related CIS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-slate-100 align-top">
              <td className="px-3 py-2">
                <span className="font-mono text-xs text-slate-500">{c.id}</span>
                <div className="font-medium text-slate-900">{c.name}</div>
              </td>
              <td className="px-3 py-2">
                <StatusPill status={c.status} />
              </td>
              <td className="px-3 py-2 text-slate-600">
                <div className="font-mono text-xs">{c.reqsAssessed.join(', ') || '—'}</div>
                <div className="text-xs text-slate-500">
                  {c.reqsAssessed.length} of {c.reqsTotal}
                </div>
              </td>
              <td className="px-3 py-2 text-slate-600">
                <EvidenceList evidence={c.evidence} />
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-600">{c.cisIds.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CisTable({ rows }: { rows: CisResult[] }) {
  const groups = [...new Set(rows.map((r) => r.control))];
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Safeguard</th>
            <th className="px-3 py-2">IG</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Based on your answers</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <FragmentRows key={g} title={`Control ${g}: ${cisCatalog.controls[g]}`} rows={rows.filter((r) => r.control === g)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRows({ title, rows }: { title: string; rows: CisResult[] }) {
  return (
    <>
      <tr className="border-t border-slate-200 bg-slate-50/60">
        <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold text-slate-600">
          {title}
        </td>
      </tr>
      {rows.map((s) => (
        <tr key={s.id} className="border-t border-slate-100 align-top">
          <td className="px-3 py-2">
            <span className="font-mono text-xs text-slate-500">{s.id}</span> <span className="font-medium text-slate-900">{s.title}</span>
          </td>
          <td className="px-3 py-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${s.ig === 1 ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'}`}>IG{s.ig}</span>
          </td>
          <td className="px-3 py-2">
            <StatusPill status={s.status} />
          </td>
          <td className="px-3 py-2 text-slate-600">
            <EvidenceList evidence={s.evidence} />
          </td>
        </tr>
      ))}
    </>
  );
}

function MappingNotes() {
  const noted = questions.filter((q) => q.mappingNote);
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {noted.map((q) => (
        <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div className="font-semibold text-slate-900">
            <span className="font-mono text-xs text-slate-500">{q.id}</span> {q.topic}
          </div>
          <p className="mt-1 leading-relaxed text-slate-600">{q.mappingNote}</p>
        </div>
      ))}
    </div>
  );
}

type Tab = 'cccs' | 'cis' | 'notes';

export default function StandardsPanel({ cccs, cis }: { cccs: CccsResult[]; cis: CisResult[] }) {
  const [tab, setTab] = useState<Tab>('cccs');
  const tabs: [Tab, string][] = [
    ['cccs', 'CCCS baseline controls'],
    ['cis', 'CIS Controls v8.1'],
    ['notes', 'Mapping notes'],
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${tab === id ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'cccs' && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Status uses every question that maps to the control: all Yes = Met, all No or Not sure = Not yet met, anything else = Partially met.
            "Requirements checked" shows which of the control's numbered requirements our questions actually cover.
          </p>
          <CccsTable rows={cccs} />
        </>
      )}
      {tab === 'cis' && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Only the safeguards our questions genuinely cover are listed. Where no safeguard fits a question, we leave it unmapped rather than forcing a match. IG1 is
            the "essential cyber hygiene" set every organization should meet.
          </p>
          <CisTable rows={cis} />
        </>
      )}
      {tab === 'notes' && (
        <>
          <p className="mb-3 text-sm text-slate-600">Why some questions only partly match a control, or match none.</p>
          <MappingNotes />
        </>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Sources:{' '}
        <a className="underline" href={cccsCatalog.url} target="_blank" rel="noreferrer">
          {cccsCatalog.source}
        </a>
        ;{' '}
        <a className="underline" href={cisCatalog.url} target="_blank" rel="noreferrer">
          {cisCatalog.source}
        </a>
        .
      </p>
    </div>
  );
}
