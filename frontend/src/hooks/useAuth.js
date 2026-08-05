import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { isStandalone } from './useStandalone';

// Tracks the Supabase session and offers the sign-in actions the UI needs. On first
// mount, if there's no existing session: an installed/standalone PWA auto-signs in
// anonymously (no password, matching "installed on device" from the product decision),
// while a regular browser tab is left to show its own login form - see App.jsx, which
// always renders that form regardless of the standalone check so a detection miss is
// just "one extra tap" via the manual "Continue without an account" button, not a dead end.
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const triedAutoAnonymous = useRef(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      if (!active) return;

      if (!existing && isStandalone() && !triedAutoAnonymous.current) {
        triedAutoAnonymous.current = true;
        const { error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) setError(signInError.message);
      } else {
        setSession(existing);
      }

      if (active) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signInWithPassword(email, password) {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    return !signInError;
  }

  async function signUp(email, password) {
    setError(null);
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) setError(signUpError.message);
    return !signUpError;
  }

  async function continueWithoutAccount() {
    setError(null);
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) setError(signInError.message);
    return !signInError;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return { session, loading, error, signInWithPassword, signUp, continueWithoutAccount, signOut };
}
