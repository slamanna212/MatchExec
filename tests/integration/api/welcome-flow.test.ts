import { describe, it, expect, beforeEach, vi } from 'vitest';

// The welcome-flow route imports '@/lib/database/status' which under the vitest
// alias resolves to src/lib/database/status (doesn't exist — the real file is
// lib/database/status). We mock the import so the route loads.
vi.mock('@/lib/database/status', () => ({
  readDbStatus: vi.fn().mockReturnValue({ ready: true, progress: 'Done', timestamp: Date.now() }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import { createMockRequest, parseResponse } from '../../utils/api-helpers';
import { getTestDb } from '../../utils/test-db';
import { GET, PUT } from '@/app/api/welcome-flow/route';

// NOTE: welcome-flow/screen/route.ts is intentionally not tested here.
// That route bypasses getDbInstance() and opens a raw sqlite3 connection
// directly to `app_data/data/matchexec.db` — a hardcoded path that differs
// from the per-worker test DB. Logged in BUGS_FOUND.md.

describe('Welcome Flow API', () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    // Ensure the welcome_flow_completed row exists (seeded by migrations)
    await db.run(
      `INSERT OR IGNORE INTO app_settings (setting_key, setting_value)
       VALUES ('welcome_flow_completed', 'false')`
    );
  });

  describe('GET /api/welcome-flow', () => {
    it('returns isFirstRun=true and completed=false when not completed', async () => {
      const res = await GET();
      const { status, data } = await parseResponse(res);

      expect(status).toBe(200);
      expect(data.completed).toBe(false);
      expect(data.isFirstRun).toBe(true);
      expect(data.dbReady).toBe(true);
    });

    it('returns completed=true and isFirstRun=false after completion', async () => {
      await db.run(
        `UPDATE app_settings SET setting_value = 'true' WHERE setting_key = 'welcome_flow_completed'`
      );

      const res = await GET();
      const { status, data } = await parseResponse(res);

      expect(status).toBe(200);
      expect(data.completed).toBe(true);
      expect(data.isFirstRun).toBe(false);
      expect(data.dbReady).toBe(true);
    });

    it('returns metadata field in response', async () => {
      const res = await GET();
      const { data } = await parseResponse(res);
      expect(data).toHaveProperty('metadata');
    });
  });

  describe('PUT /api/welcome-flow', () => {
    it('marks welcome flow complete with pro_mode setupType', async () => {
      const req = createMockRequest('PUT', '/api/welcome-flow', { setupType: 'pro_mode' });
      const res = await PUT(req);
      const { status, data } = await parseResponse(res);

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const row = await db.get<{ setting_value: string }>(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'welcome_flow_completed'`
      );
      expect(row?.setting_value).toBe('true');
    });

    it('marks welcome flow complete with get_started setupType', async () => {
      const req = createMockRequest('PUT', '/api/welcome-flow', { setupType: 'get_started' });
      const res = await PUT(req);
      const { status, data } = await parseResponse(res);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 400 for invalid setupType', async () => {
      const req = createMockRequest('PUT', '/api/welcome-flow', { setupType: 'invalid' });
      const res = await PUT(req);
      const { status, data } = await parseResponse(res);

      expect(status).toBe(400);
      expect(data.error).toMatch(/setupType/i);
    });

    it('returns 400 when setupType is missing', async () => {
      const req = createMockRequest('PUT', '/api/welcome-flow', {});
      const res = await PUT(req);
      const { status } = await parseResponse(res);

      expect(status).toBe(400);
    });

    it('is idempotent — completing twice still returns success', async () => {
      const makeReq = () => createMockRequest('PUT', '/api/welcome-flow', { setupType: 'pro_mode' });
      const res1 = await PUT(makeReq());
      const res2 = await PUT(makeReq());

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('stores pro_mode metadata with screens_completed=[1]', async () => {
      const req = createMockRequest('PUT', '/api/welcome-flow', { setupType: 'pro_mode' });
      await PUT(req);

      const row = await db.get<{ metadata: string }>(
        `SELECT metadata FROM app_settings WHERE setting_key = 'welcome_flow_completed'`
      );
      const meta = JSON.parse(row!.metadata);
      expect(meta.setup_type).toBe('pro_mode');
      expect(meta.screens_completed).toEqual([1]);
    });

    it('stores get_started metadata with screens_completed=[1,2,3]', async () => {
      const req = createMockRequest('PUT', '/api/welcome-flow', { setupType: 'get_started' });
      await PUT(req);

      const row = await db.get<{ metadata: string }>(
        `SELECT metadata FROM app_settings WHERE setting_key = 'welcome_flow_completed'`
      );
      const meta = JSON.parse(row!.metadata);
      expect(meta.setup_type).toBe('get_started');
      expect(meta.screens_completed).toEqual([1, 2, 3]);
    });
  });
});
