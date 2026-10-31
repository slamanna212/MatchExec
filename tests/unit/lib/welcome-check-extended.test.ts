import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('@lib/database/status', () => ({
  readDbStatus: vi.fn().mockReturnValue({ ready: true, progress: 'Done', timestamp: Date.now() }),
}));

import { readDbStatus } from '@lib/database/status';
import { isWelcomeComplete } from '@/lib/welcome-check';
import { getTestDb, type TestDatabase } from '../../utils/test-db';

const mockReadDbStatus = readDbStatus as ReturnType<typeof vi.fn>;

describe('isWelcomeComplete — extended', () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = getTestDb();
    vi.clearAllMocks();
    mockReadDbStatus.mockReturnValue({ ready: true, progress: 'Done', timestamp: Date.now() });
  });

  it('returns false and does not throw when DB errors', async () => {
    vi.spyOn(db, 'get').mockRejectedValueOnce(new Error('disk error'));
    const result = await isWelcomeComplete();
    expect(result).toBe(false);
    vi.restoreAllMocks();
  });

  it('returns false when DB is not ready', async () => {
    mockReadDbStatus.mockReturnValue({ ready: false, progress: 'Running migrations', timestamp: Date.now() });
    const result = await isWelcomeComplete();
    expect(result).toBe(false);
  });

  it('returns false when welcome_flow_completed is missing entirely (partial config)', async () => {
    // Only discord settings exist, not the welcome flow setting
    await db.run(
      `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
       VALUES ('discord_bot_token', 'fake-token')`
    );
    const result = await isWelcomeComplete();
    expect(result).toBe(false);
  });

  it('returns false when welcome_flow_completed is set to an unexpected value', async () => {
    await db.run(
      `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
       VALUES ('welcome_flow_completed', 'yes')`
    );
    const result = await isWelcomeComplete();
    // Only the exact string 'true' is accepted
    expect(result).toBe(false);
  });

  it('concurrent calls both return false when not completed (race-safe)', async () => {
    // Issue two simultaneous calls — both should resolve without conflict
    const [a, b] = await Promise.all([isWelcomeComplete(), isWelcomeComplete()]);
    expect(a).toBe(false);
    expect(b).toBe(false);
  });

  it('concurrent calls both return true when completed (race-safe)', async () => {
    await db.run(
      `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
       VALUES ('welcome_flow_completed', 'true')`
    );
    const [a, b] = await Promise.all([isWelcomeComplete(), isWelcomeComplete()]);
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it('returns false for multiple DB-not-ready states in a row', async () => {
    mockReadDbStatus.mockReturnValue({ ready: false, progress: 'Init', timestamp: Date.now() });
    expect(await isWelcomeComplete()).toBe(false);
    expect(await isWelcomeComplete()).toBe(false);
  });
});
