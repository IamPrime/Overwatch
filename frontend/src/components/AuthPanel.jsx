import { useState } from 'react';

// Always rendered whenever there's no session - regardless of whether this looks like
// an installed PWA or a browser tab - so a standalone-detection miss (see useStandalone)
// costs the user one extra tap on "Continue without an account" instead of leaving them
// stuck with no way in.
export function AuthPanel({ onSignIn, onSignUp, onContinueWithoutAccount, error }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    if (mode === 'signin') {
      await onSignIn(email, password);
    } else {
      await onSignUp(email, password);
    }
    setSubmitting(false);
  }

  async function handleContinueWithoutAccount() {
    setSubmitting(true);
    await onContinueWithoutAccount();
    setSubmitting(false);
  }

  return (
    <div className="wrapper auth-panel">
      <h1>What are you eating?</h1>
      <h2>Sign in to snap a photo of your food & get a nutritional breakdown.</h2>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          minLength={6}
          required
        />
        <button type="submit" disabled={submitting}>
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      <button
        type="button"
        className="link-button"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>

      {error && <p className="auth-error">{error}</p>}

      <div className="auth-divider">or</div>

      <button type="button" className="link-button" onClick={handleContinueWithoutAccount} disabled={submitting}>
        Continue without an account
      </button>
    </div>
  );
}
