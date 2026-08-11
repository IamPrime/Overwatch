import { useState } from 'react';

// Standard eye / eye-with-a-slash glyphs (the conventional show/hide-password icon pair),
// as inline SVG rather than an icon font/library dependency for a two-icon need.
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// Always rendered whenever there's no session - regardless of whether this looks like
// an installed PWA or a browser tab - so a standalone-detection miss (see useStandalone)
// costs the user one extra tap on "Continue without an account" instead of leaving them
// stuck with no way in.
export function AuthPanel({ onSignIn, onSignUp, onContinueWithoutAccount, error }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        <div className="password-field">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
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

      <button type="button" className="link-button" onClick={handleContinueWithoutAccount} disabled={submitting}>
        Continue without an account
      </button>
    </div>
  );
}
