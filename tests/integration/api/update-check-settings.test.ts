import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRequest, parseResponse } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

vi.mock('@/lib/feed-helpers', () => ({
  logFeedEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('processes/scheduler/jobs/check-for-update', () => ({
  UpdateCheckJob: vi.fn().mockImplementation(() => ({
    checkForUpdate: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { GET, PUT, POST } from '@/app/api/settings/update-check/route';

async function seedUpdateSettings(db: ReturnType<typeof getTestDb>) {
  await db.run(
    `INSERT OR IGNORE INTO app_settings (setting_key, setting_value, data_type) VALUES
      ('update_check_enabled',  'false', 'boolean'),
      ('latest_version',        '',      'string'),
      ('update_check_last_run', '',      'string'),
      ('update_available',      'false', 'boolean')`
  );
}

describe('Update Check Settings Routes', () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    await seedBasicTestData();
    db = getTestDb();
    await seedUpdateSettings(db);
    vi.clearAllMocks();
  });

  // ─── GET /api/settings/update-check ──────────────────────────────────────

  describe('GET /api/settings/update-check', () => {
    it('returns all four fields with correct types', async () => {
      const response = await GET();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(typeof data.update_check_enabled).toBe('boolean');
      expect(typeof data.update_available).toBe('boolean');
      expect(typeof data.latest_version).toBe('string');
      expect(typeof data.update_check_last_run).toBe('string');
    });

    it('returns false for update_check_enabled when seeded as false', async () => {
      const response = await GET();
      const { data } = await parseResponse(response);
      expect(data.update_check_enabled).toBe(false);
    });

    it('returns true for update_check_enabled when set to true', async () => {
      await db.run(`UPDATE app_settings SET setting_value = 'true' WHERE setting_key = 'update_check_enabled'`);
      const response = await GET();
      const { data } = await parseResponse(response);
      expect(data.update_check_enabled).toBe(true);
    });

    it('returns true for update_available when set to true', async () => {
      await db.run(`UPDATE app_settings SET setting_value = 'true' WHERE setting_key = 'update_available'`);
      await db.run(`UPDATE app_settings SET setting_value = 'v9.9.9' WHERE setting_key = 'latest_version'`);
      const response = await GET();
      const { data } = await parseResponse(response);
      expect(data.update_available).toBe(true);
      expect(data.latest_version).toBe('v9.9.9');
    });
  });

  // ─── PUT /api/settings/update-check ──────────────────────────────────────

  describe('PUT /api/settings/update-check', () => {
    it('persists update_check_enabled: false', async () => {
      const request = createMockRequest('PUT', '/api/settings/update-check', { update_check_enabled: false });
      const response = await PUT(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.update_check_enabled).toBe(false);

      const row = await db.get<{ setting_value: string }>(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'update_check_enabled'`
      );
      expect(row?.setting_value).toBe('false');
    });

    it('persists update_check_enabled: true', async () => {
      const request = createMockRequest('PUT', '/api/settings/update-check', { update_check_enabled: true });
      const response = await PUT(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.update_check_enabled).toBe(true);

      const row = await db.get<{ setting_value: string }>(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'update_check_enabled'`
      );
      expect(row?.setting_value).toBe('true');
    });

    it('returns 400 when update_check_enabled is missing', async () => {
      const request = createMockRequest('PUT', '/api/settings/update-check', {});
      const response = await PUT(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when update_check_enabled is a string instead of boolean', async () => {
      const request = createMockRequest('PUT', '/api/settings/update-check', { update_check_enabled: 'yes' });
      const response = await PUT(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when update_check_enabled is a number', async () => {
      const request = createMockRequest('PUT', '/api/settings/update-check', { update_check_enabled: 1 });
      const response = await PUT(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });
  });

  // ─── POST /api/settings/update-check ─────────────────────────────────────

  describe('POST /api/settings/update-check', () => {
    it('calls UpdateCheckJob and returns success when not rate limited', async () => {
      const response = await POST();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.checked_at).toBeTruthy();
    });

    it('returns 429 when called within 60 seconds of last run', async () => {
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
      await db.run(
        `UPDATE app_settings SET setting_value = ? WHERE setting_key = 'update_check_last_run'`,
        [thirtySecondsAgo]
      );

      const response = await POST();
      const { status } = await parseResponse(response);
      expect(status).toBe(429);
    });

    it('does not rate limit when last run was over 60 seconds ago', async () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      await db.run(
        `UPDATE app_settings SET setting_value = ? WHERE setting_key = 'update_check_last_run'`,
        [twoMinutesAgo]
      );

      const response = await POST();
      const { status } = await parseResponse(response);
      expect(status).toBe(200);
    });
  });
});
