import { useState, type FormEvent } from 'react';
import { sendChatMessage } from '../api';
import { buildChatContext } from '../chatContext';
import type { AppApi } from '../state';
import { Button, Card } from './ui';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const HINTS: Record<string, string> = {
  results: 'Ask things like "why is BEC my biggest risk?" or "what are the steps for my first fix?" — answers are grounded in your report.',
  summary: 'Ask things like "why is BEC my biggest risk?" or "what are the steps for my first fix?" — answers are grounded in your report.',
  questions: 'Ask things like "what does this question mean?" or "why does this matter?" — answers are grounded in the questions on screen.',
};
const DEFAULT_HINT = 'Ask what Chain of Custody is, how the check-up works, or anything about a question once you get to one.';

/** Floating chat available on every screen: a product guide before there's a report, a way to ask
 * about the current questions during the check-up, and grounded Q&A about the report once there is one.
 * Session id/history live only in this component's state — a new tab or refresh starts fresh, by design. */
export default function ReportChat({ app }: { app: AppApi }) {
  const { state } = app;
  const [sessionId] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError(null);
    setMessages((m) => [...m, { role: 'user', text }]);
    setSending(true);
    try {
      const reply = await sendChatMessage(sessionId, text, buildChatContext(state));
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } catch {
      setError("Couldn't reach the assistant. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print fixed bottom-5 left-5 z-30 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 font-semibold text-white shadow-lg transition hover:bg-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
      >
        <span aria-hidden>💬</span> Ask a question
      </button>
    );

  return (
    <div className="no-print fixed bottom-5 left-5 z-30 flex max-h-[70vh] w-[min(24rem,calc(100vw-2.5rem))] flex-col">
      <Card className="fade-in flex max-h-[70vh] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="font-bold text-slate-900">Ask a question</div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && <p className="text-sm text-slate-500">{HINTS[state.screen] ?? DEFAULT_HINT}</p>}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {sending && <div className="text-sm text-slate-500">Thinking…</div>}
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </div>

        <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-200 p-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={sending}
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          />
          <Button type="submit" disabled={sending || !input.trim()} className="px-4 py-2 text-sm">
            Send
          </Button>
        </form>
      </Card>
    </div>
  );
}
