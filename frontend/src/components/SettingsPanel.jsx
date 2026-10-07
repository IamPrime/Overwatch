import { useState } from 'react';
import { saveWolframKey, deleteWolframKey } from '../lib/api';
import { friendlyMessage } from '../lib/errors';
import { Button, Card, Field, inputClass } from './ui';
import { Dialog } from './Dialog';
import { ExternalIcon } from './icons';
import { AccountSection } from './AccountSection';

const SETTINGS_FAILED = "Couldn't update your Wolfram Alpha settings - please try again.";

const APPEARANCE_CHOICES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function SectionTitle({ children }) {
  return <h3 className="-mb-1 text-xs font-extrabold tracking-wider text-sub uppercase">{children}</h3>;
}

// The App ID form lives in a dialog (a bottom sheet on phones, centred on desktop) so the
// Settings page itself stays a short summary.
function AppIdDialog({ open, onClose, onSave, busy, error }) {
  const [appId, setAppId] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (await onSave(appId.trim())) setAppId('');
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="app-id-title"
      className="mx-0 mt-auto mb-0 w-full max-w-full rounded-t-2xl p-0 sm:m-auto sm:max-w-md sm:rounded-2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
        <h2 id="app-id-title" className="text-lg font-extrabold">
          Your Wolfram Alpha App ID
        </h2>
        <Field label="App ID" htmlFor="app-id">
          <input
            id="app-id"
            type="text"
            className={inputClass}
            placeholder="XXXXXX-XXXXXXXXXX"
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
            autoComplete="off"
            required
          />
        </Field>
        <p className="text-sm text-sub">
          Get a free one at{' '}
          <a
            href="https://developer.wolframalpha.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-bold text-brand underline underline-offset-2"
          >
            developer.wolframalpha.com
            <ExternalIcon className="size-3" />
          </a>
          . It's saved to your account, not this device.
        </p>
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={busy || !appId.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function SettingsPanel({
  token,
  usage,
  onUsageChange,
  appearance,
  onAppearanceChange,
  user,
  onSignOut,
  onAddEmail,
  onSetPassword,
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(appId) {
    setBusy(true);
    setError(null);
    try {
      await saveWolframKey(appId, token);
      await onUsageChange();
      setDialogOpen(false);
      return true;
    } catch (err) {
      setError(friendlyMessage(err, SETTINGS_FAILED));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await deleteWolframKey(token);
      await onUsageChange();
    } catch (err) {
      setError(friendlyMessage(err, SETTINGS_FAILED));
    } finally {
      setBusy(false);
    }
  }

  function openDialog() {
    setError(null);
    setDialogOpen(true);
  }

  const remainingShare = usage && !usage.hasOwnKey && usage.limit ? usage.remaining / usage.limit : 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h2 className="text-2xl font-extrabold lg:text-3xl">Settings</h2>

      <SectionTitle>Lookups</SectionTitle>
      <Card>
        {usage == null ? (
          <p className="text-sm text-sub">Checking your usage…</p>
        ) : usage.hasOwnKey ? (
          <p className="font-bold">Unlimited lookups with your own Wolfram Alpha App ID.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2 tabular-nums">
              <span className="text-2xl font-extrabold whitespace-nowrap">
                {usage.remaining} of {usage.limit}
              </span>
              <span className="text-right text-xs text-sub">free lookups left today</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-field"
              role="meter"
              aria-label="Free lookups left today"
              aria-valuemin={0}
              aria-valuemax={usage.limit}
              aria-valuenow={usage.remaining}
            >
              <div className="h-full rounded-full bg-gold" style={{ width: `${remainingShare * 100}%` }} />
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold">Wolfram Alpha App ID</div>
            <div className="text-xs text-sub">
              {usage?.hasOwnKey ? 'Saved to your account' : 'Add your own for unlimited lookups'}
            </div>
          </div>
          {usage?.hasOwnKey ? (
            <Button variant="ghost" size="sm" onClick={handleRemove} disabled={busy}>
              Remove
            </Button>
          ) : (
            <Button size="sm" onClick={openDialog} disabled={busy || usage == null}>
              Add App ID
            </Button>
          )}
        </div>
        {error && !dialogOpen && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <div role="radiogroup" aria-label="Appearance" className="flex gap-1 rounded-[10px] border border-rule p-1">
          {APPEARANCE_CHOICES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={appearance === value}
              onClick={() => onAppearanceChange(value)}
              className={`flex-1 cursor-pointer rounded-lg px-2 py-2 text-sm font-bold transition ${
                appearance === value ? 'bg-brand text-brand-ink' : 'text-sub hover:bg-field'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <SectionTitle>Account</SectionTitle>
      <AccountSection user={user} onSignOut={onSignOut} onAddEmail={onAddEmail} onSetPassword={onSetPassword} />

      <AppIdDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSave={handleSave} busy={busy} error={error} />
    </div>
  );
}
