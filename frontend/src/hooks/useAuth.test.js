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
