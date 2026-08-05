// Detects whether the page is running as an installed/standalone PWA rather than a
// regular browser tab. Each individual check is unreliable on its own (navigator.standalone
// is iOS-Safari-only and has been flaky across iOS versions; display-mode: standalone can
// false-negative depending on install path) - ORing them together reduces, but doesn't
// eliminate, false negatives. Callers must never treat a "false" result here as proof the
// user has no way to sign in without a password; it should only decide whether to
// *auto-trigger* anonymous sign-in, never gate the only path into the app.
export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}
