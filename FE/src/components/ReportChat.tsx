import { MessageCircle, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSendChatMessage } from '../api/hooks';
import { useAppStore } from '../store/appStore';
import { AssistantMessage } from './ChatReply';
import { Button, Card } from './ui';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  /** Set to the scenario's label when this came from "Try an example", not a real question — rendered with a label. */
  demo?: string;
}

interface TestScenario {
  label: string;
  message: string;
}

// A handful of fictional examples for the demo, each checked against a different real control —
// not a general scenario library, just enough to show the assistant grounding different answers.
const TEST_SCENARIOS: TestScenario[] = [
  {
    label: 'Fake payment email',
    message:
      "Hi, this is Northline Produce Supply — we've changed our banking details, please redirect this week's " +
      "payment to the new account ending in 4521. Can you confirm today, it's time-sensitive?",
  },
  {
    label: 'Phishing link',
    message:
      "Your email storage is almost full and messages will start bouncing. Sign in here to increase your limit " +
      "before it's too late: http://mail-storage-upgrade.example.net/login",
  },
  {
    label: 'Vendor remote-access request',
    message:
      "Hi, this is your refrigeration monitoring provider — we need to push a critical update to your controller " +
      'today. Click this link and run the installer so we can connect remotely: http://coldchain-support-tools.example.net/update',
  },
  {
    label: 'Load redirect request',
    message:
      "Hey, it's Danielle from Fairview Logistics — small change, can you have your driver drop tomorrow's load " +
      'at our secondary warehouse on Route 12 instead? Same paperwork, just a different dock this time.',
  },
];

const HINTS: Record<string, string> = {
  results: 'Ask things like "why is BEC my biggest risk?" or "what are the steps for my first fix?" — answers are grounded in your report.',
  summary: 'Ask things like "why is BEC my biggest risk?" or "what are the steps for my first fix?" — answers are grounded in your report.',
  questions: 'Ask things like "what does this question mean?" or "why does this matter?" — answers are grounded in the questions on screen.',
};
const DEFAULT_HINT = 'Ask what Chain of Custody is, how the check-up works, or anything about a question once you get to one.';

/** Floating chat available on every screen: a product guide before there's a report, a way to ask
 * about the current questions during the check-up, and grounded Q&A about the report once there is one.
 * Session id/history live only in this component's state — a new tab or refresh starts fresh, by design. */
export default function ReportChat() {
  const screen = useAppStore((s) => s.screen);
  const [sessionId] = useState(() => crypto.randomUUID());
  // Separate from sessionId so the canned examples never mix into the person's own chat history.
  const [testSessionId] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const chat = useSendChatMessage(sessionId);
  const exampleChat = useSendChatMessage(testSessionId);
  const sending = chat.isPending || exampleChat.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    chat.mutate(text, { onSuccess: (reply) => setMessages((m) => [...m, { role: 'assistant', text: reply }]) });
  };

  const tryExample = (scenario: TestScenario) => {
    if (sending) return;
    setOpen(true);
    setMessages((m) => [...m, { role: 'user', text: scenario.message, demo: scenario.label }]);
    exampleChat.mutate(scenario.message, {
      onSuccess: (reply) => setMessages((m) => [...m, { role: 'assistant', text: reply, demo: scenario.label }]),
    });
  };

  const examplePicker = screen === 'results' && (
    <div className="border-t border-slate-200 px-4 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Try an example</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {TEST_SCENARIOS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => tryExample(s)}
            disabled={sending}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print fixed bottom-5 left-5 z-30 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 font-semibold text-white shadow-lg transition hover:bg-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
      >
        <MessageCircle className="h-5 w-5" aria-hidden /> Ask a question
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
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && <p className="text-sm text-slate-500">{HINTS[screen] ?? DEFAULT_HINT}</p>}
          {messages.map((m, i) => (
            <div key={i}>
              {m.demo && m.demo !== messages[i - 1]?.demo && (
                <div className="mb-1.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Example: {m.demo}</div>
              )}
              <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user' ? 'whitespace-pre-wrap bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {m.role === 'assistant' ? <AssistantMessage text={m.text} /> : m.text}
                </div>
              </div>
            </div>
          ))}
          {sending && <div className="text-sm text-slate-500">Thinking…</div>}
          {(chat.isError || exampleChat.isError) && (
            <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">Couldn't reach the assistant. Check your connection and try again.</div>
          )}
        </div>

        {examplePicker}

        <form onSubmit={submit} className={`flex items-center gap-2 p-3 ${screen === 'results' ? '' : 'border-t border-slate-200'}`}>
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
