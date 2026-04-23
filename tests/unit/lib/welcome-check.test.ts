import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must be hoisted before any imports that use these modules
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

// @/lib/database/status resolves to lib/database/status.ts via tsconfig fallback.
// In vitest the alias @/lib maps only to src/lib, so we mock through the real module path.
vi.mock('@lib/database/status', () => ({
  readDbStatus: vi.fn().mockReturnValue({ ready: true, progress: 'Done', timestamp: Date.now() }),
}));

import { redirect } from 'next/navigation';
import { readDbStatus } from '@lib/database/status';
import { isWelcomeComplete, requireWelcomeComplete, requireWelcomeIncomplete } from '@/lib/welcome-check';
import { getTestDb, type TestDatabase } from '../../utils/test-db';

const mockRedirect = redirect as unknown as ReturnType<typeof vi.fn>;
const mockReadDbStatus = readDbStatus as ReturnType<typeof vi.fn>;

describe('welcome-check', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = getTestDb();
    vi.clearAllMocks();
    // Default: DB is ready
    mockReadDbStatus.mockReturnValue({ ready: true, progress: 'Done', timestamp: Date.now() });
  });

  // ─── isWelcomeComplete ────────────────────────────────────────────────────

  describe('isWelcomeComplete', () => {
    it('returns true when welcome_flow_completed is set to "true" in the DB', async () => {
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('welcome_flow_completed', 'true')`
      );

      const result = await isWelcomeComplete();

      expect(result).toBe(true);
    });

    it('returns false when welcome_flow_completed is "false" in the DB', async () => {
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('welcome_flow_completed', 'false')`
      );

      const result = await isWelcomeComplete();

      expect(result).toBe(false);
    });

    it('returns false when the welcome_flow_completed setting is not in the DB', async () => {
      const result = await isWelcomeComplete();

      // No app_settings rows exist after resetTestDatabase() — should return false
      expect(result).toBe(false);
    });

    it('returns false when the database is not ready', async () => {
      mockReadDbStatus.mockReturnValue({ ready: false, progress: 'Initializing', timestamp: Date.now() });

      const result = await isWelcomeComplete();

      expect(result).toBe(false);
    });

    it('returns false and does not throw when a DB error occurs', async () => {
      // Simulate DB read error by inserting an unparseable scenario — we test via a
      // module-level approach: break the test DB instance temporarily
      vi.spyOn(db, 'get').mockRejectedValueOnce(new Error('DB error'));

      const result = await isWelcomeComplete();

      expect(result).toBe(false);

      // Restore
      vi.restoreAllMocks();
    });
  });

  // ─── requireWelcomeComplete ───────────────────────────────────────────────

  describe('requireWelcomeComplete', () => {
    it('does not redirect when welcome flow is complete', async () => {
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('welcome_flow_completed', 'true')`
      );

      await requireWelcomeComplete();

      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('redirects to /welcome when welcome flow is not complete', async () => {
      await requireWelcomeComplete();

      expect(mockRedirect).toHaveBeenCalledOnce();
      expect(mockRedirect).toHaveBeenCalledWith('/welcome');
    });
  });

  // ─── requireWelcomeIncomplete ─────────────────────────────────────────────

  describe('requireWelcomeIncomplete', () => {
    it('does not redirect when welcome flow is not yet complete', async () => {
      await requireWelcomeIncomplete();

      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('redirects to / when welcome flow is already complete', async () => {
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('welcome_flow_completed', 'true')`
      );

      await requireWelcomeIncomplete();

      expect(mockRedirect).toHaveBeenCalledOnce();
      expect(mockRedirect).toHaveBeenCalledWith('/');
    });
  });
});
