import { templates } from '../engine/data';
import { useAppStore } from '../store/appStore';

/** Which standard the summary reports against. The answers are the same for every template, so switching is instant. */
export function TemplatePicker({ className = '' }: { className?: string }) {
  const template = useAppStore((s) => s.template);
  const update = useAppStore((s) => s.update);
  return (
    <div className={`no-print ${className}`}>
      <div className="text-sm font-semibold text-slate-700">Report against</div>
      <div role="radiogroup" aria-label="Report template" className="mt-1.5 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {templates.map((t) => {
          const selected = template === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              title={t.tagline}
              onClick={() => update({ template: t.id })}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${
                selected ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
