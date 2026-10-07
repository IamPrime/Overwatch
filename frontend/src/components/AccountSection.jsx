import { useState } from 'react';
import { Button, Card, Field, inputClass } from './ui';
import { Dialog } from './Dialog';

function DialogBody({ titleId, title, children }) {
  return (
    <div className="flex flex-col gap-4 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
      <h2 id={titleId} className="text-lg font-extrabold">
        {title}
      </h2>
      {children}
    </div>
  );
}

const SHEET_CLASS = 'mx-0 mt-auto mb-0 w-full max-w-full rounded-t-2xl p-0 sm:m-auto sm:max-w-md sm:rounded-2xl';

function ErrorText({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm font-semibold text-danger">
      {children}
    </p>
  );
}

// Step 1 of creating an account from a guest session: attach an email.
function CreateAccountDialog({ open, onClose, onSubmit, onConfirmed }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sentTo, setSentTo] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await onSubmit(email.trim());
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.confirmed) onConfirmed();
    else setSentTo(email.trim());
  }

  function handleClose() {
    setSentTo(null);
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} aria-labelledby="create-account-title" className={SHEET_CLASS}>
      {sentTo ? (
        <DialogBody titleId="create-account-title" title="Check your inbox">
          <p className="text-sm text-sub">
            We sent a confirmation link to <span className="font-bold text-ink">{sentTo}</span>. Open it on this
            device, then come back to Settings to choose a password.
          </p>
          <Button onClick={handleClose}>Done</Button>
        </DialogBody>
      ) : (
        <form onSubmit={handleSubmit}>
          <DialogBody titleId="create-account-title" title="Create an account">
            <p className="text-sm text-sub">
              Your saved Wolfram Alpha App ID and today's lookups move to the new account, and you can sign in on
              other devices.
            </p>
            <Field label="Email" htmlFor="create-account-email">
              <input
                id="create-account-email"
                type="email"
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={busy || !email.trim()}>
                Continue
              </Button>
            </div>
          </DialogBody>
        </form>
      )}
    </Dialog>
  );
}

// Step 2: choose a password, once the account has a confirmed email.
function SetPasswordDialog({ open, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await onSubmit(password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
    } else {
      setPassword('');
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="set-password-title" className={SHEET_CLASS}>
      <form onSubmit={handleSubmit}>
        <DialogBody titleId="set-password-title" title="Choose a password">
          <p className="text-sm text-sub">You'll use it with your email to sign in on other devices.</p>
          <Field label="Password" htmlFor="set-password">
            <input
              id="set-password"
              type="password"
              className={inputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              Later
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || password.length < 6}>
              Save password
            </Button>
          </div>
        </DialogBody>
      </form>
    </Dialog>
  );
}

// Signing out of a guest session throws it away for good, so it asks first.
function LeaveGuestDialog({ open, onClose, onLeave }) {
  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="leave-guest-title" className={SHEET_CLASS}>
      <DialogBody titleId="leave-guest-title" title="Leave guest mode?">
        <p className="text-sm text-sub">
          You'll lose this guest session for good, including any Wolfram Alpha App ID you've saved. Create an
          account instead to keep it.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </DialogBody>
    </Dialog>
  );
}

export function AccountSection({ user, onSignOut, onAddEmail, onSetPassword }) {
  const [dialog, setDialog] = useState(null); // 'create' | 'password' | 'leave' | null
  const close = () => setDialog(null);

  const isGuest = Boolean(user?.is_anonymous);
  // Set by addEmailToGuest; only accounts that started as guests have it.
  const needsPassword = !isGuest && user?.user_metadata?.password_set === false;
  // A guest who asked for an account but hasn't clicked the confirmation link yet.
  const pendingEmail = isGuest ? user?.new_email : null;

  return (
    <Card>
      {isGuest ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold">Guest</div>
              <div className="text-xs wrap-anywhere text-sub">
                {pendingEmail
                  ? `Confirmation sent to ${pendingEmail} - open the link to finish.`
                  : 'Create an account to use your settings on other devices.'}
              </div>
            </div>
            <Button size="sm" onClick={() => setDialog('create')}>
              {pendingEmail ? 'Resend' : 'Create account'}
            </Button>
          </div>
          <button
            type="button"
            className="cursor-pointer self-start text-sm font-bold text-danger underline underline-offset-2"
            onClick={() => setDialog('leave')}
          >
            Leave guest mode
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold">Signed in</div>
              <div className="text-xs wrap-anywhere text-sub">{user?.email}</div>
            </div>
            <button type="button" onClick={onSignOut} className="cursor-pointer font-bold text-danger">
              Sign out
            </button>
          </div>
          {needsPassword && (
            <div className="flex items-center justify-between gap-3 rounded-[10px] bg-gold/15 p-3">
              <p className="text-sm">Choose a password so you can sign in on other devices.</p>
              <Button size="sm" variant="gold" onClick={() => setDialog('password')}>
                Set password
              </Button>
            </div>
          )}
        </>
      )}

      <CreateAccountDialog
        open={dialog === 'create'}
        onClose={close}
        onSubmit={onAddEmail}
        onConfirmed={() => setDialog('password')}
      />
      <SetPasswordDialog open={dialog === 'password'} onClose={close} onSubmit={onSetPassword} />
      <LeaveGuestDialog
        open={dialog === 'leave'}
        onClose={close}
        onLeave={() => {
          close();
          onSignOut();
        }}
      />
    </Card>
  );
}
