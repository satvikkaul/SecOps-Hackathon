import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Sign-in is optional: without these, the check-up still works and sign-in is simply hidden (throwing here blanked the whole app). */
export const authEnabled = !!url && !!publishableKey;
if (!authEnabled) console.warn('Sign-in disabled: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable it.');

/** Access and refresh tokens stay in this tab's memory instead of localStorage, where any injected
 * script could read them. The trade-off: a refresh signs the user out. */
function memoryStorage(): SupportedStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

/** Earlier builds let supabase-js keep the session in localStorage (sb-<project>-auth-token). */
function dropStoredSessions() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable */
  }
}

if (authEnabled) dropStoredSessions();

/** Browser-safe client. Uses the publishable key only — never import the secret key here. */
export const supabase: SupabaseClient | null = authEnabled ? createClient(url, publishableKey, {
  auth: {
    storage: memoryStorage(),
    persistSession: true,
    autoRefreshToken: true,
    // Magic-link sign-in appends the session token to the redirect URL; this picks it up on load.
    detectSessionInUrl: true,
  },
}) : null;
