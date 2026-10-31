// @vitest-environment node
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
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { activityFeed } from '../../../lib/db/schema';
import { getAppSetting, setAppSetting } from '../../../src/lib/settings';

const mockLogFeedEvent = logFeedEvent as ReturnType<typeof vi.fn>;

const CURRENT_VERSION = (() => {
   
  const pkg = require('../../../package.json');
  return pkg.version as string;
})();

async function resetUpdateSettings() {
  await setAppSetting('update_check_enabled', 'true');
  await setAppSetting('latest_version', '');
  await setAppSetting('update_check_last_run', '');
  await setAppSetting('update_available', 'false');
}

setupPgTestFile({ seed: true });

const getRow = async (key: string) => ({ setting_value: await getAppSetting(key) });

describe('UpdateCheckJob', () => {
  let job: UpdateCheckJob;

  beforeEach(async () => {
    await resetUpdateSettings();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    job = new UpdateCheckJob(getPgTestDb());
  });

  describe('checkForUpdate', () => {
    it('does nothing when update_check_enabled is false', async () => {
      await setAppSetting('update_check_enabled', 'false');
      await job.checkForUpdate();
      expect(fetch).not.toHaveBeenCalled();
      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });

    it('skips when last run was within 23 hours', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await setAppSetting('update_check_last_run', oneHourAgo);
      await job.checkForUpdate();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('fetches GitHub API with correct User-Agent header', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: `v${CURRENT_VERSION}` }),
      } as Response);

      await job.checkForUpdate();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/slamanna212/matchexec/releases/latest',
        expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': 'MatchExec' }) })
      );
    });

    it('sets update_available to true and updates app_settings when newer version found', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v9.9.9' }),
      } as Response);

      await job.checkForUpdate();

      const row = await getRow('update_available');
      expect(row?.setting_value).toBe('true');

      const latestRow = await getRow('latest_version');
      expect(latestRow?.setting_value).toBe('v9.9.9');

      const lastRunRow = await getRow('update_check_last_run');
      expect(lastRunRow?.setting_value).toBeTruthy();
    });

    it('does not set update_available when GitHub returns same version', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: `v${CURRENT_VERSION}` }),
      } as Response);

      await job.checkForUpdate();

      const row = await getRow('update_available');
      expect(row?.setting_value).toBe('false');
      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });

    it('does not set update_available when GitHub returns older version', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v0.1.0' }),
      } as Response);

      await job.checkForUpdate();

      const row = await getRow('update_available');
      expect(row?.setting_value).toBe('false');
      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });

    it('calls logFeedEvent when newer version available and no existing feed event', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v9.9.9' }),
      } as Response);

      await job.checkForUpdate();

      expect(mockLogFeedEvent).toHaveBeenCalledOnce();
      expect(mockLogFeedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'update_available',
          metadata: expect.objectContaining({ latestVersion: 'v9.9.9' }),
        })
      );
    });

    it('does NOT call logFeedEvent when feed event for this version already exists', async () => {
      await getPgTestDb().insert(activityFeed).values({
        id: 'test-dedup-1', event_type: 'update_available', priority: 2, title: 'Test', metadata: { latestVersion: 'v9.9.9' },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v9.9.9' }),
      } as Response);

      await job.checkForUpdate();

      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });

    it('skips pre-release tags containing a dash', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v9.9.9-rc1' }),
      } as Response);

      await job.checkForUpdate();

      const row = await getRow('update_available');
      expect(row?.setting_value).toBe('false');
      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });

    it('handles GitHub API fetch failure gracefully without throwing', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'));
      await expect(job.checkForUpdate()).resolves.toBeUndefined();
      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });

    it('handles non-OK GitHub response gracefully without throwing', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response);
      await expect(job.checkForUpdate()).resolves.toBeUndefined();
      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });

    it('handles malformed tag_name gracefully without throwing', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'not-a-version' }),
      } as Response);
      await expect(job.checkForUpdate()).resolves.toBeUndefined();
    });

    it('handles 429 rate limit response gracefully', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
      } as Response);
      await expect(job.checkForUpdate()).resolves.toBeUndefined();
      expect(mockLogFeedEvent).not.toHaveBeenCalled();
    });
  });
});
