/**
 * Browser-side cache of `GET /api/settings/ui`. Every dashboard and detail page needs the auto-refresh interval; they now
 * share one request per page load instead of fetching it on every mount. The UI settings page calls
 * `invalidateUiSettings()` after saving so the next reader fetches the new values.
 */
import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger/client';

export interface UiSettingsResponse {
  auto_refresh_interval_seconds?: number;
  [key: string]: unknown;
}

export const DEFAULT_REFRESH_INTERVAL_SECONDS = 30;

let pending: Promise<UiSettingsResponse> | null = null;

/** The UI settings (fetched once, then shared). Resolves to `{}` when the request fails; a failure is not cached. */
export function getUiSettings(): Promise<UiSettingsResponse> {
  pending ??= fetch('/api/settings/ui')
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as UiSettingsResponse;
    })
    .catch((error: unknown) => {
      logger.error('Error fetching UI settings:', error);
      pending = null;
      return {};
    });
  return pending;
}

/** Forget the cached settings (after they were saved). */
export function invalidateUiSettings(): void {
  pending = null;
}

/** The configured auto-refresh interval in seconds (`initial` until the settings arrive, then the setting or 30). */
export function useRefreshInterval(initial = DEFAULT_REFRESH_INTERVAL_SECONDS): number {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    let alive = true;
    void getUiSettings().then((s) => {
      if (alive) setSeconds(s.auto_refresh_interval_seconds || DEFAULT_REFRESH_INTERVAL_SECONDS);
    });
    return () => { alive = false; };
  }, []);
  return seconds;
}
