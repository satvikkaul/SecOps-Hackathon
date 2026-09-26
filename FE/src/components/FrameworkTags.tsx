import { frameworkRefs } from '../engine/controls';
import { cisById, ciosc as cioscCatalog } from '../engine/data';
import { useTemplate } from '../state';

const cioscName = Object.fromEntries(cioscCatalog.sections.map((s) => [s.id, s.name]));

/** Compact "CCCS BC.5.1 · CIS 6.3" (or "CIOSC 5.5") references for a set of questions, in the chosen report template. */
export default function FrameworkTags({ questionIds, className = '' }: { questionIds: string[]; className?: string }) {
  const template = useTemplate();
  const { cccs, cis, ciosc } = frameworkRefs(questionIds);
  if (template === 'ciosc' ? ciosc.length === 0 : cccs.length === 0 && cis.length === 0) {
    const outside = template === 'ciosc' ? 'CyberSecure Canada' : 'CCCS and CIS';
    return <span className={`text-xs text-slate-500 ${className}`}>Payment procedure, outside the {outside} baselines</span>;
  }
  if (template === 'ciosc') {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1 text-xs ${className}`}>
        <span className="rounded bg-teal-50 px-1.5 py-0.5 font-semibold text-teal-800" title={ciosc.map((id) => `${id} ${cioscName[id]}`).join('\n')}>
          CIOSC {ciosc.join(', ')}
        </span>
      </span>
    );
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 text-xs ${className}`}>
      {cccs.length > 0 && (
        <span className="rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-800" title="Canadian Centre for Cyber Security baseline controls">
          CCCS {cccs.join(', ')}
        </span>
      )}
      {cis.length > 0 && (
        <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-800" title={cis.map((id) => `${id} ${cisById[id].title}`).join('\n')}>
          CIS {cis.join(', ')}
        </span>
      )}
    </span>
  );
}
