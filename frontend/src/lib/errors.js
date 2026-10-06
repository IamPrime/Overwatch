// What users see when something fails. Only messages written for users get shown as-is: the
// server's own `{ error }` messages and the ones below. Anything else - a browser's network error
// ("Failed to fetch", "Load failed"...), a decoder exception, a Supabase internal - is replaced by
// a plain fallback, since its wording is technical and varies by browser.

// An error whose message is safe to show to the user unchanged.
export class FriendlyError extends Error {}

export const NETWORK_MESSAGE = "Couldn't reach Overwatch - check your internet connection and try again.";

export function friendlyMessage(err, fallback) {
  return err instanceof FriendlyError ? err.message : fallback;
}

const AUTH_MESSAGES = {
  invalid_credentials: "That email and password don't match an account.",
  user_already_exists: 'An account with that email already exists - try signing in instead.',
  email_exists: 'An account with that email already exists - try signing in instead.',
  email_not_confirmed: 'Please confirm your email first - check your inbox for the link.',
  weak_password: 'That password is too weak - try a longer one with a mix of letters and numbers.',
  email_address_invalid: 'Please enter a valid email address.',
  validation_failed: 'Please enter a valid email address and password.',
  signup_disabled: "New accounts can't be created right now - please try again later.",
  anonymous_provider_disabled:
    "Continuing without an account isn't available right now - please sign in with an email and password.",
  over_request_rate_limit: 'Too many attempts - please wait a minute and try again.',
  over_email_send_rate_limit: 'Too many emails sent - please wait a few minutes and try again.',
};

// Supabase Auth errors carry a stable `code` (supabase-js v2), so they're matched on that rather
// than on wording. Network failures come back as AuthRetryableFetchError with status 0.
export function authErrorMessage(error) {
  if (!error) return null;
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return "Couldn't reach the sign-in service - check your internet connection and try again.";
  }
  if (AUTH_MESSAGES[error.code]) return AUTH_MESSAGES[error.code];
  if (error.status === 429) return AUTH_MESSAGES.over_request_rate_limit;
  return 'Something went wrong signing you in - please try again.';
}
