import { useState } from 'react';
import { Button, Card, Field, LinkButton, OrDivider, inputClass } from './ui';
import { CameraIcon, CheckIcon, EyeIcon, EyeOffIcon, MicIcon } from './icons';
import { Wordmark } from './Wordmark';

const PERKS = [
  { Icon: CameraIcon, text: 'Snap a photo and Angalia works out what the food is. That part is always free.' },
  { Icon: MicIcon, text: 'No photo? Type or say what you ate, like "2 slices of pepperoni pizza".' },
  { Icon: CheckIcon, text: 'Get the nutrition facts: free lookups every day, or unlimited with your own Wolfram Alpha App ID.' },
];

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
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Desktop only: what the app does, beside the form. */}
      <aside className="hidden flex-col gap-6 bg-hero px-12 py-12 text-white lg:flex">
        <Wordmark className="text-3xl text-gold" />
        <h1 className="mt-10 text-4xl leading-tight font-extrabold text-balance">What are you eating?</h1>
        <ul className="flex max-w-[42ch] flex-col gap-4">
          {PERKS.map(({ Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <Icon className="mt-0.5 size-5 text-gold" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </aside>

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 lg:max-w-sm lg:justify-center lg:px-0">
        <Wordmark className="text-2xl text-brand lg:hidden" />
        <div className="lg:hidden">
          <h1 className="text-2xl font-extrabold text-balance">What are you eating?</h1>
          <p className="text-sm text-sub">Sign in to snap your food and get a nutrition breakdown.</p>
        </div>

        <Card as="form" onSubmit={handleSubmit}>
          <h2 className="hidden text-xl font-extrabold lg:block">{mode === 'signin' ? 'Sign in' : 'Create an account'}</h2>
          <Field label="Email" htmlFor="auth-email">
            <input
              id="auth-email"
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Password" htmlFor="auth-password">
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                className={`${inputClass} pr-11`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={6}
                required
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center text-sub hover:text-brand"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
              </button>
            </div>
          </Field>
          <Button type="submit" disabled={submitting}>
            {mode === 'signin' ? 'Sign in' : 'Sign up'}
          </Button>
          <p className="text-sm text-sub">
            {mode === 'signin' ? 'No account yet? ' : 'Already have an account? '}
            <LinkButton onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </LinkButton>
          </p>
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {error}
            </p>
          )}
        </Card>

        <OrDivider />
        <Button variant="ghost" onClick={handleContinueWithoutAccount} disabled={submitting}>
          Continue without an account
        </Button>
      </main>
    </div>
  );
}
