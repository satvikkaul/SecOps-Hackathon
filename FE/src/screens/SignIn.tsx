import { useState, type FormEvent } from 'react';
import { Button, Card } from '../components/ui';
import { useAuthStore } from '../store/authStore';

/** The magic-link form itself. Rendered inside a modal from the header's "Sign in" button, or
 * inline as a "save your score" prompt on Results — never as a full-page gate. */
export default function SignIn({ onClose }: { onClose?: () => void }) {
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      await signInWithEmail(email);
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  };

  return (
    <Card className="relative w-full p-6">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          ✕
        </button>
      )}
      {status === 'sent' ? (
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">Check your email</h2>
          <p className="mt-2 text-slate-600">
            We sent a sign-in link to <span className="font-medium text-slate-900">{email}</span>. Open it on this device to continue. You stay signed in
            until you refresh or close the tab.
          </p>
          <Button variant="ghost" className="mt-4" onClick={() => setStatus('idle')}>
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <h2 className="text-xl font-bold text-slate-900">Sign in</h2>
          <p className="mt-1 text-slate-600">Enter your email and we'll send you a link to sign in — no password needed.</p>
          <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5 focus:border-brand-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
          />
          {status === 'error' && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          <Button type="submit" disabled={status === 'sending'} className="mt-4 w-full">
            {status === 'sending' ? 'Sending…' : 'Send magic link'}
          </Button>
        </form>
      )}
    </Card>
  );
}
