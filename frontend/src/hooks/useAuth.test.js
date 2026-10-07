import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabaseClient';
import { expectFriendly } from '../test/rawErrors';

vi.mock('./useStandalone', () => ({ isStandalone: () => false }));
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInAnonymously: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

async function errorAfter(action, supabaseError) {
  const { result } = renderHook(() => useAuth());
  await waitFor(() => expect(result.current.loading).toBe(false));
  supabase.auth[action.supabaseMethod].mockResolvedValue({ data: {}, error: supabaseError });
  await act(() => result.current[action.hookMethod]('person@example.com', 'hunter22'));
  return result.current.error;
}

const SIGN_IN = { hookMethod: 'signInWithPassword', supabaseMethod: 'signInWithPassword' };
const SIGN_UP = { hookMethod: 'signUp', supabaseMethod: 'signUp' };
const GUEST = { hookMethod: 'continueWithoutAccount', supabaseMethod: 'signInAnonymously' };

// Shapes Supabase's auth client really returns (supabase-js v2).
const supabaseError = (name, message, extra = {}) => Object.assign(new Error(message), { name, ...extra });

describe('useAuth error messages', () => {
  test.each([
    ['sign in, offline', SIGN_IN, supabaseError('AuthRetryableFetchError', 'Failed to fetch', { status: 0 })],
    ['sign up, offline', SIGN_UP, supabaseError('AuthRetryableFetchError', 'Load failed', { status: 0 })],
    ['guest, offline', GUEST, supabaseError('AuthRetryableFetchError', 'NetworkError when attempting to fetch resource.', { status: 0 })],
    ['guest, anonymous sign-ins turned off', GUEST, supabaseError('AuthApiError', 'Anonymous sign-ins are disabled', { status: 422, code: 'anonymous_provider_disabled' })],
    ['sign in, wrong password', SIGN_IN, supabaseError('AuthApiError', 'Invalid login credentials', { status: 400, code: 'invalid_credentials' })],
    ['sign up, existing email', SIGN_UP, supabaseError('AuthApiError', 'User already registered', { status: 422, code: 'user_already_exists' })],
    ['sign up, weak password', SIGN_UP, supabaseError('AuthWeakPasswordError', 'Password should be at least 6 characters.', { status: 422, code: 'weak_password' })],
    ['sign in, too many attempts', SIGN_IN, supabaseError('AuthApiError', 'Request rate limit reached', { status: 429, code: 'over_request_rate_limit' })],
    ['sign in, server error', SIGN_IN, supabaseError('AuthUnknownError', '{}', { status: 500 })],
    ['sign up, unrecognized error', SIGN_UP, supabaseError('AuthApiError', 'Request failed with status code 503', { status: 503 })],
  ])('%s', async (_case, action, error) => {
    expectFriendly(await errorAfter(action, error));
  });
});

describe('useAuth guest to account', () => {
  async function renderReady() {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result;
  }

  // Supabase either sends a confirmation email (email not applied yet, held in new_email) or, with
  // confirmation turned off, applies it straight away.
  test.each([
    ['confirmation email sent', { email: null, new_email: 'sam@example.com' }, false],
    ['applied straight away', { email: 'sam@example.com' }, true],
  ])('adding an email to the same user (%s) flags the password as still owed', async (_case, user, confirmed) => {
    supabase.auth.updateUser.mockResolvedValue({ data: { user }, error: null });
    const result = await renderReady();

    const outcome = await act(() => result.current.addEmailToGuest('sam@example.com'));

    expect(supabase.auth.updateUser).toHaveBeenCalledWith(
      { email: 'sam@example.com', data: { password_set: false } },
      expect.objectContaining({ emailRedirectTo: expect.any(String) }),
    );
    expect(outcome).toEqual({ confirmed });
  });

  test('an email that already has an account gets a plain message', async () => {
    supabase.auth.updateUser.mockResolvedValue({
      data: {},
      error: supabaseError('AuthApiError', 'A user with this email address has already been registered', { status: 422, code: 'email_exists' }),
    });
    const result = await renderReady();

    const { error } = await act(() => result.current.addEmailToGuest('taken@example.com'));
    expect(error).toMatch(/already exists/);
    expectFriendly(error);
  });

  test('setting the password clears the owed flag', async () => {
    supabase.auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    const result = await renderReady();

    expect(await act(() => result.current.setPassword('hunter22'))).toEqual({});
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'hunter22', data: { password_set: true } });
  });
});

describe('useAuth sign-up', () => {
  test("the confirmation link returns to the address the person signed up on", async () => {
    supabase.auth.signUp.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.signUp('sam@example.com', 'hunter22'));

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'sam@example.com',
      password: 'hunter22',
      options: { emailRedirectTo: window.location.origin },
    });
  });
});
