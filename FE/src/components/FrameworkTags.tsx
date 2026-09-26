import { frameworkRefs } from '../engine/controls';
import { cisById } from '../engine/data';

/** Compact "CCCS BC.5.1 · CIS 6.3" references for a set of questions. */
export default function FrameworkTags({ questionIds, className = '' }: { questionIds: string[]; className?: string }) {
  const { cccs, cis } = frameworkRefs(questionIds);
  if (cccs.length === 0 && cis.length === 0) {
    return <span className={`text-xs text-slate-500 ${className}`}>Payment procedure, outside the CCCS and CIS baselines</span>;
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
