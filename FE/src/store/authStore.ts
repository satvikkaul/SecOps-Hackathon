import * as Sentry from '@sentry/react';
import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

/** Who is signed in, for the UI. Tokens are not kept here: the Supabase client holds them in memory. */
interface AuthStore {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(() => ({
  user: null,
  loading: true,

  signInWithEmail: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      Sentry.captureException(error);
      throw error;
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },
}));

let listening = false;

/** Subscribes once for the life of the page. Call before the first render. */
export function startAuthListener() {
  if (listening) return;
  listening = true;
  supabase.auth.getSession().then(({ data: { session } }) => {
    useAuthStore.setState({ user: session?.user ?? null, loading: false });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({ user: session?.user ?? null, loading: false });
  });
}
