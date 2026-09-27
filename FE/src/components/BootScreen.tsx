import { Button, Card, Logo } from './ui';

/** Shown while the check-up's content loads from the server, and if it can't. Also reused for the
 * brief moment after a magic-link redirect while the pending save resolves (see main.tsx). */
export default function BootScreen({ failed, onRetry, message }: { failed?: boolean; onRetry?: () => void; message?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <Logo />
      {failed ? (
        <Card className="fade-in max-w-md p-6 text-center">
          <h1 className="text-xl font-bold text-slate-900">We can't reach our server right now</h1>
          <p className="mt-2 text-slate-600">The check-up needs a connection to load its questions. Check your internet, then try again.</p>
          <Button onClick={onRetry} className="mt-5">
            Try again
          </Button>
        </Card>
      ) : (
        <p className="text-slate-500" role="status">
          {message ?? 'Loading the check-up…'}
        </p>
      )}
    </div>
  );
}
