import { useCallback, useEffect, useState } from 'react';
import { getWolframUsage } from '../lib/api';

// Shared between SettingsPanel (which shows the status line and owns the BYOK
// save/remove flow) and UploadForm (whose nutrition-image responses carry a fresher
// { used, limit } pair in headers than a fresh GET would after every single lookup).
export function useWolframUsage(token) {
  const [usage, setUsage] = useState(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setUsage(await getWolframUsage(token));
    } catch (err) {
      console.error('Failed to refresh Wolfram usage:', err);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Applies the { used, limit } pair returned in nutrition-image response headers so the
  // indicator updates immediately after a lookup, without waiting on a second round trip.
  const applyPartial = useCallback((partial) => {
    if (!partial) return;
    setUsage({
      hasOwnKey: false,
      used: partial.used,
      limit: partial.limit,
      remaining: Math.max(partial.limit - partial.used, 0),
    });
  }, []);

  return { usage, refresh, applyPartial };
}
