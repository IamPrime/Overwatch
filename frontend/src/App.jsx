import { useAuth } from './hooks/useAuth';
import { useWolframUsage } from './hooks/useWolframUsage';
import { AuthPanel } from './components/AuthPanel';
import { UploadForm } from './components/UploadForm';
import { SettingsPanel } from './components/SettingsPanel';

function App() {
  const { session, loading, error, signInWithPassword, signUp, continueWithoutAccount, signOut } = useAuth();
  const token = session?.access_token;
  const { usage, refresh: refreshUsage, applyPartial } = useWolframUsage(token);

  if (loading) {
    return (
      <div className="wrapper">
        <p>Loading…</p>
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
    <div className="wrapper">
      <h1>What are you eating?</h1>
      <h2>Snap a photo of your food & upload for a nutritional breakdown.</h2>

      <UploadForm token={token} onUsageChange={applyPartial} />

      <SettingsPanel token={token} usage={usage} onUsageChange={refreshUsage} />

      <button type="button" className="link-button" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}

export default App;
