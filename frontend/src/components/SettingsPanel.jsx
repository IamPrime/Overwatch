import { useState } from 'react';
import { saveWolframKey, deleteWolframKey } from '../lib/api';

export function SettingsPanel({ token, usage, onUsageChange }) {
  const [appId, setAppId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSave(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveWolframKey(appId.trim(), token);
      setAppId('');
      await onUsageChange();
    } catch (err) {
      setError(err.message);
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
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel">
      <h3>Wolfram Alpha access</h3>

      {usage == null ? (
        <p className="usage-status">Checking your usage…</p>
      ) : usage.hasOwnKey ? (
        <p className="usage-status">Using your own Wolfram Alpha key — unlimited lookups.</p>
      ) : (
        <p className="usage-status">
          Using the shared key — {usage.remaining}/{usage.limit} free lookups left today.
        </p>
      )}

      {usage?.hasOwnKey ? (
        <button type="button" onClick={handleRemove} disabled={busy}>
          Remove my Wolfram Alpha App ID
        </button>
      ) : (
        <form onSubmit={handleSave}>
          <input
            type="text"
            placeholder="Your Wolfram Alpha App ID"
            value={appId}
            onChange={(event) => setAppId(event.target.value)}
            required
          />
          <button type="submit" disabled={busy || !appId.trim()}>
            Save for unlimited lookups
          </button>
        </form>
      )}

      {error && <p className="auth-error">{error}</p>}

      <p className="settings-hint">
        Get a free App ID from{' '}
        <a href="https://developer.wolframalpha.com/" target="_blank" rel="noreferrer">
          developer.wolframalpha.com
        </a>
        .
      </p>
    </div>
  );
}
