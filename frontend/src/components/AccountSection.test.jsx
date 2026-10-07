import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccountSection } from './AccountSection';

afterEach(cleanup);

const guest = { is_anonymous: true, user_metadata: {} };

function renderAccount(user, overrides = {}) {
  const props = {
    user,
    onSignOut: vi.fn(),
    onAddEmail: vi.fn().mockResolvedValue({ confirmed: false }),
    onSetPassword: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  render(<AccountSection {...props} />);
  return props;
}

function createAccountWith(email) {
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('AccountSection for a guest', () => {
  test('offers to create an account instead of a plain sign out', () => {
    renderAccount(guest);

    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  test('leaving guest mode asks first, and only signs out once confirmed', () => {
    const { onSignOut } = renderAccount(guest);

    fireEvent.click(screen.getByRole('button', { name: 'Leave guest mode' }));
    expect(onSignOut).not.toHaveBeenCalled();
    expect(screen.getByText(/lose this guest session/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  test('creating an account with email confirmation on says to check the inbox', async () => {
    const { onAddEmail, onSetPassword } = renderAccount(guest);

    createAccountWith('sam@example.com');

    expect(await screen.findByText('Check your inbox')).toBeTruthy();
    expect(onAddEmail).toHaveBeenCalledWith('sam@example.com');
    expect(onSetPassword).not.toHaveBeenCalled();
  });

  test('creating an account with email confirmation off goes straight to choosing a password', async () => {
    const { onSetPassword } = renderAccount(guest, { onAddEmail: vi.fn().mockResolvedValue({ confirmed: true }) });

    createAccountWith('sam@example.com');

    fireEvent.change(await screen.findByLabelText('Password'), { target: { value: 'hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(onSetPassword).toHaveBeenCalledWith('hunter22');
  });

  test('shows where the confirmation went while it is still pending', () => {
    renderAccount({ ...guest, new_email: 'sam@example.com' });

    expect(screen.getByText(/confirmation sent to sam@example.com/i)).toBeTruthy();
  });
});

describe('AccountSection for an account', () => {
  test('signs out directly', () => {
    const { onSignOut } = renderAccount({ is_anonymous: false, email: 'sam@example.com', user_metadata: {} });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Set password' })).toBeNull();
  });

  test('a former guest who confirmed their email is prompted for a password', () => {
    renderAccount({ is_anonymous: false, email: 'sam@example.com', user_metadata: { password_set: false } });

    expect(screen.getByRole('button', { name: 'Set password' })).toBeTruthy();
  });
});
