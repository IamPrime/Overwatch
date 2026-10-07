import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { isStandalone } from './useStandalone';
import { authErrorMessage } from '../lib/errors';

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
        if (signInError) setError(authErrorMessage(signInError));
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
    if (signInError) setError(authErrorMessage(signInError));
    return !signInError;
  }

  // Confirmation links (sign-up and guest-to-account) return to the address the person is using -
  // Netlify, Render or localhost - so each must be in Supabase's Redirect URLs list.
  async function signUp(email, password) {
    setError(null);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (signUpError) setError(authErrorMessage(signUpError));
    return !signUpError;
  }

  async function continueWithoutAccount() {
    setError(null);
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) setError(authErrorMessage(signInError));
    return !signInError;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // Turning a guest (anonymous) session into a real account keeps the same user, so their saved
  // Wolfram App ID and today's usage carry over. Supabase only allows a password once the
  // account has an email, and with email confirmation on that's after the confirmation link is
  // clicked - so this is two steps. password_set in user_metadata tracks whether step two is
  // still owed (Settings prompts for it). Returns { error } or { confirmed } - confirmed is false
  // when Supabase sent a confirmation email instead of applying the email straight away.
  async function addEmailToGuest(email) {
    const { data, error: updateError } = await supabase.auth.updateUser(
      { email, data: { password_set: false } },
      { emailRedirectTo: window.location.origin },
    );
    if (updateError) return { error: authErrorMessage(updateError) };
    return { confirmed: data.user?.email === email };
  }

  async function setPassword(password) {
    const { error: updateError } = await supabase.auth.updateUser({ password, data: { password_set: true } });
    return updateError ? { error: authErrorMessage(updateError) } : {};
  }

  return {
    session,
    loading,
    error,
    signInWithPassword,
    signUp,
    continueWithoutAccount,
    signOut,
    addEmailToGuest,
    setPassword,
  };
}
