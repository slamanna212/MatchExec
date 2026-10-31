/**
 * In-memory stand-in for `src/lib/settings` for unit tests of bot/scheduler/stats code that still runs on the legacy
 * SQLite harness for other tables. Usage:
 *
 *   vi.mock('<path>/src/lib/settings', async () => (await import('<path>/tests/utils/settings-mock')).createSettingsModuleMock());
 *   import { settingsStore, resetSettingsStore } from '<path>/tests/utils/settings-mock';
 *   beforeEach(() => resetSettingsStore());
 */
import { vi } from 'vitest';

export const settingsStore = {
  app: new Map<string, string>(),
  discord: undefined as Record<string, unknown> | undefined,
  scheduler: undefined as Record<string, unknown> | undefined,
};

export function resetSettingsStore(): void {
  settingsStore.app.clear();
  settingsStore.discord = undefined;
  settingsStore.scheduler = undefined;
}

export function createSettingsModuleMock() {
  const get = async (key: string) => settingsStore.app.get(key);
  const set = async (key: string, value: string) => { settingsStore.app.set(key, value); };
  return {
    getAppSetting: vi.fn(get),
    getAppSettings: vi.fn(async (keys: string[]) => Object.fromEntries(keys.filter((k) => settingsStore.app.has(k)).map((k) => [k, settingsStore.app.get(k)]))),
    setAppSetting: vi.fn(set),
    updateAppSetting: vi.fn(async (key: string, value: string) => {
      if (!settingsStore.app.has(key)) return false;
      settingsStore.app.set(key, value);
      return true;
    }),
    getDiscordSettings: vi.fn(async () => settingsStore.discord),
    getAnyDiscordSettings: vi.fn(async () => settingsStore.discord),
    getSchedulerSettings: vi.fn(async () => settingsStore.scheduler),
  };
}
