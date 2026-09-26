import { parseChatReply, type Span } from './chatFormat';

function Spans({ spans }: { spans: Span[] }) {
  return spans.map((span, i) =>
    span.kind === 'strong' ? (
      <strong key={i} className="font-semibold text-slate-900">
        {span.text}
      </strong>
    ) : (
      <span key={i}>{span.text}</span>
    ),
  );
}

/** Assistant text, with topic cards and numbered steps instead of raw markdown asterisks. */
export function AssistantMessage({ text }: { text: string }) {
  const blocks = parseChatReply(text);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        if (block.kind === 'items') {
          return (
            <ul key={i} className="space-y-2">
              {block.items.map((item, j) => (
                <li key={j} className="rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-brand-100">
                  <div className="flex gap-2">
                    <span className="mt-0.5 text-xs font-bold text-brand-600">{j + 1}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{item.title}</div>
                      {item.body.length > 0 && (
                        <p className="mt-0.5 text-slate-600">
                          <Spans spans={item.body} />
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'steps') {
          return (
            <ol key={i} className="space-y-2">
              {block.steps.map((step) => (
                <li key={step.n} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{step.n}</span>
                  <span className="text-slate-700">
                    <Spans spans={step.body} />
                  </span>
                </li>
              ))}
            </ol>
          );
        }
        return (
          <div key={i} className="space-y-1.5">
            {block.lines.map((line, j) => (
              <p key={j} className={line.bullet ? 'flex gap-2' : undefined}>
                {line.bullet && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />}
                <span>
                  <Spans spans={line.spans} />
                </span>
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
