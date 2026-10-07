import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useWolframUsage } from './hooks/useWolframUsage';
import { useAppearance } from './hooks/useAppearance';
import { AuthPanel } from './components/AuthPanel';
import { UploadForm } from './components/UploadForm';
import { SettingsPanel } from './components/SettingsPanel';
import { Wordmark } from './components/Wordmark';
import { Spinner } from './components/ui';
import { GearIcon, HomeIcon } from './components/icons';

const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'settings', label: 'Settings', Icon: GearIcon },
];

function UsageChip({ usage }) {
  if (!usage) return null;
  return (
    <span className="rounded-full bg-gold/20 px-2.5 py-1 text-xs font-bold whitespace-nowrap tabular-nums">
      {usage.hasOwnKey ? 'Unlimited lookups' : `${usage.remaining} of ${usage.limit} left today`}
    </span>
  );
}

function App() {
  const {
    session,
    loading,
    error,
    signInWithPassword,
    signUp,
    continueWithoutAccount,
    signOut,
    addEmailToGuest,
    setPassword,
  } = useAuth();
  const token = session?.access_token;
  const { usage, refresh: refreshUsage, applyPartial } = useWolframUsage(token);
  const [appearance, setAppearance] = useAppearance();
  // Tabs only switch what's shown - both stay mounted, so a result on Home survives a trip to
  // Settings and back. Clearing it is "New lookup"'s job.
  const [tab, setTab] = useState('home');

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (!session) {
    return (
      <AuthPanel
        onSignIn={signInWithPassword}
        onSignUp={signUp}
        onContinueWithoutAccount={continueWithoutAccount}
        error={error}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-rule bg-app/90 pt-[env(safe-area-inset-top)] backdrop-blur lg:bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-3 lg:px-8">
          <Wordmark className="mr-auto text-2xl text-brand" />
          {/* Desktop tabs; phones use the bottom bar below. */}
          <nav aria-label="Main" className="hidden gap-6 lg:flex">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`flex cursor-pointer items-center gap-1.5 border-b-2 py-1.5 font-bold ${
                  tab === id ? 'border-brand text-brand' : 'border-transparent text-sub hover:text-ink'
                }`}
              >
                <Icon className="size-4.5" />
                {label}
              </button>
            ))}
          </nav>
          <UsageChip usage={usage} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pt-5 pb-28 lg:px-8 lg:pt-8 lg:pb-12">
        <section hidden={tab !== 'home'} className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-extrabold text-balance lg:text-3xl">What are you eating?</h1>
            <p className="hidden text-sub lg:block">Drop in a photo or describe your meal to get its nutrition facts.</p>
          </div>
          <UploadForm token={token} onUsageChange={applyPartial} onOpenSettings={() => setTab('settings')} />
        </section>

        <section hidden={tab !== 'settings'}>
          <SettingsPanel
            token={token}
            usage={usage}
            onUsageChange={refreshUsage}
            appearance={appearance}
            onAppearanceChange={setAppearance}
            user={session.user}
            onSignOut={signOut}
            onAddEmail={addEmailToGuest}
            onSetPassword={setPassword}
          />
        </section>
      </main>

      {/* Phone tabs, fixed to the bottom and clear of the iOS home indicator. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-rule bg-surface px-2.5 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-1 text-[0.7rem] font-bold ${
              tab === id ? 'text-brand' : 'text-sub'
            }`}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
