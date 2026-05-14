import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('../../../src/lib/feed-helpers', () => ({
  logFeedEvent: vi.fn().mockResolvedValue(undefined),
}));

import { UpdateCheckJob } from '../../../processes/scheduler/jobs/check-for-update';
import { logFeedEvent } from '../../../src/lib/feed-helpers';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData } from '../../utils/fixtures';

const mockLogFeedEvent = logFeedEvent as ReturnType<typeof vi.fn>;

const CURRENT_VERSION = (() => {
  const pkg = require('../../../package.json');
  return pkg.version as string;
})();

async function seedUpdateSettings(db: ReturnType<typeof getTestDb>) {
  await db.run(
    `INSERT OR IGNORE INTO app_settings (setting_key, setting_value, data_type) VALUES
      ('update_check_enabled',  'true',  'boolean'),
      ('latest_version',        '',      'string'),
      ('update_check_last_run', '',      'string'),
      ('update_available',      'false', 'boolean')`
  );
}

describe('UpdateCheckJob — extended', () => {
  let job: UpdateCheckJob;
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await seedBasicTestData();
    await seedUpdateSettings(db);
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    job = new UpdateCheckJob(db as any);
  });

  describe('isRateLimited()', () => {
    it('returns false when update_check_last_run is empty', async () => {
      const result = await job.isRateLimited();
      expect(result).toBe(false);
    });

    it('returns true when last run was within 60 seconds', async () => {
      const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();
      await db.run(
        `UPDATE app_settings SET setting_value = ? WHERE setting_key = 'update_check_last_run'`,
        [tenSecondsAgo]
      );
      const result = await job.isRateLimited();
      expect(result).toBe(true);
    });

    it('returns false when last run was more than 60 seconds ago', async () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      await db.run(
        `UPDATE app_settings SET setting_value = ? WHERE setting_key = 'update_check_last_run'`,
        [twoMinutesAgo]
      );
      const result = await job.isRateLimited();
      expect(result).toBe(false);
    });

    it('returns false when last run was exactly 23 hours ago (only 60s rate limit applies)', async () => {
      const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
      await db.run(
        `UPDATE app_settings SET setting_value = ? WHERE setting_key = 'update_check_last_run'`,
        [twentyThreeHoursAgo]
      );
      const result = await job.isRateLimited();
      expect(result).toBe(false);
    });
  });

  describe('isWithinRateLimit()', () => {
    it('always returns false (stub method)', () => {
      expect(job.isWithinRateLimit()).toBe(false);
    });
  });

  describe('checkForUpdate — timestamp and state persistence', () => {
    it('updates update_check_last_run after successful check with same version', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: `v${CURRENT_VERSION}` }),
      } as Response);

      const before = new Date();
      await job.checkForUpdate();
      const after = new Date();

      const row = await db.get<{ setting_value: string }>(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'update_check_last_run'`
      );
      const lastRun = new Date(row!.setting_value);
      expect(lastRun.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(lastRun.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('updates update_check_last_run after successful check with newer version', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v9.9.9' }),
      } as Response);

      const before = new Date();
      await job.checkForUpdate();

      const row = await db.get<{ setting_value: string }>(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'update_check_last_run'`
      );
      const lastRun = new Date(row!.setting_value);
      expect(lastRun.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    });

    it('does NOT update update_check_last_run when check is skipped due to throttle', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await db.run(
        `UPDATE app_settings SET setting_value = ? WHERE setting_key = 'update_check_last_run'`,
        [oneHourAgo]
      );

      await job.checkForUpdate();

      const row = await db.get<{ setting_value: string }>(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'update_check_last_run'`
      );
      expect(row?.setting_value).toBe(oneHourAgo);
    });

    it('stores the latest_version tag even when no update is available', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: `v${CURRENT_VERSION}` }),
      } as Response);

      await job.checkForUpdate();

      const row = await db.get<{ setting_value: string }>(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'latest_version'`
      );
      expect(row?.setting_value).toBe(`v${CURRENT_VERSION}`);
    });
  });

  describe('checkForUpdate — feed event metadata', () => {
    it('feed event includes currentVersion, latestVersion, and releaseUrl in metadata', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v9.9.9' }),
      } as Response);

      await job.checkForUpdate();

      expect(mockLogFeedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            currentVersion: `v${CURRENT_VERSION}`,
            latestVersion: 'v9.9.9',
            releaseUrl: 'https://github.com/slamanna212/matchexec/releases/tag/v9.9.9',
          }),
        })
      );
    });

    it('feed event title contains the new version tag', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v9.9.9' }),
      } as Response);

      await job.checkForUpdate();

      expect(mockLogFeedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('v9.9.9'),
        })
      );
    });

    it('feed event priority is 2', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v9.9.9' }),
      } as Response);

      await job.checkForUpdate();

      expect(mockLogFeedEvent).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 2 })
      );
    });
  });

  describe('checkForUpdate — absent tag_name', () => {
    it('skips gracefully when tag_name is null', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: null }),
      } as Response);

      await expect(job.checkForUpdate()).resolves.toBeUndefined();
      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });

    it('skips gracefully when tag_name is missing from response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

      await expect(job.checkForUpdate()).resolves.toBeUndefined();
      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });

    it('skips gracefully when tag_name is empty string', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: '' }),
      } as Response);

      await expect(job.checkForUpdate()).resolves.toBeUndefined();
      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });
  });

  describe('checkForUpdate — update_available flag transitions', () => {
    it('sets update_available back to false when current version matches after prior update', async () => {
      await db.run(
        `UPDATE app_settings SET setting_value = 'true' WHERE setting_key = 'update_available'`
      );

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: `v${CURRENT_VERSION}` }),
      } as Response);

      await job.checkForUpdate();

      const row = await db.get<{ setting_value: string }>(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'update_available'`
      );
      expect(row?.setting_value).toBe('false');
    });
  });
});
