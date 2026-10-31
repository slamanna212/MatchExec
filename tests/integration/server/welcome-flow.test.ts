// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { appSettings } from '../../../lib/db/schema';
import { markSystemReady } from '../../../lib/db/system-status';
import { getAppSettingRow } from '../../../src/lib/settings';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile({ seed: true });

const reset = () => getPgTestDb().update(appSettings).set({ setting_value: 'false', metadata: null }).where(eq(appSettings.setting_key, 'welcome_flow_completed'));
const put = (json: unknown) => appRequest('/api/welcome-flow', { method: 'PUT', json });

beforeEach(async () => { await reset(); });

describe('GET /api/welcome-flow', () => {
  it('reports dbReady=false until the migrator has finished', async () => {
    const res = await appRequest('/api/welcome-flow');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      isFirstRun: true, completed: false, dbReady: false,
      metadata: { screens_completed: [], completion_date: null, setup_type: null },
    });
  });

  it('reports first run when ready and not completed', async () => {
    await markSystemReady();
    const res = await appRequest('/api/welcome-flow');
    expect(res.data).toMatchObject({ isFirstRun: true, completed: false, dbReady: true });
    expect(res.data.metadata).toEqual({ screens_completed: [], completion_date: null, setup_type: null });
  });

  it('is public even when auth is enabled', async () => {
    process.env.ADMIN_PASSWORD = 'pw';
    try {
      expect((await appRequest('/api/welcome-flow')).status).toBe(200);
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });
});

describe('PUT /api/welcome-flow', () => {
  it('completes with pro_mode, stores metadata and sets the cookie', async () => {
    await markSystemReady();
    const res = await put({ setupType: 'pro_mode' });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('welcome_flow_completed=true');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=2592000');

    const row = await getAppSettingRow('welcome_flow_completed');
    expect(row?.setting_value).toBe('true');
    expect(row?.metadata).toMatchObject({ screens_completed: [1], setup_type: 'pro_mode' });

    const get = await appRequest('/api/welcome-flow');
    expect(get.data).toMatchObject({ isFirstRun: false, completed: true, dbReady: true });
    expect(get.data.metadata.setup_type).toBe('pro_mode');
    expect(new Date(get.data.metadata.completion_date).toString()).not.toBe('Invalid Date');
  });

  it('get_started stores all three screens and is idempotent', async () => {
    expect((await put({ setupType: 'get_started' })).status).toBe(200);
    expect((await put({ setupType: 'get_started' })).status).toBe(200);
    expect((await getAppSettingRow('welcome_flow_completed'))?.metadata).toMatchObject({ screens_completed: [1, 2, 3], setup_type: 'get_started' });
  });

  it.each([{ setupType: 'nope' }, {}])('rejects %j with 400', async (body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(res.data.error).toContain('setupType must be one of: pro_mode, get_started');
  });

  it('returns 500 when the settings row is missing', async () => {
    await getPgTestDb().delete(appSettings).where(eq(appSettings.setting_key, 'welcome_flow_completed'));
    const res = await put({ setupType: 'pro_mode' });
    expect(res.status).toBe(500);
    await getPgTestDb().insert(appSettings).values({ setting_key: 'welcome_flow_completed', setting_value: 'false', data_type: 'boolean' });
  });
});

describe('PUT /api/welcome-flow/screen', () => {
  it('succeeds (no-op when the optional row does not exist) and updates the row when present', async () => {
    expect((await appRequest('/api/welcome-flow/screen', { method: 'PUT', json: { screen: 2 } })).data).toEqual({ success: true });
    await getPgTestDb().insert(appSettings).values({ setting_key: 'welcome_flow_current_screen', setting_value: '1' });
    await appRequest('/api/welcome-flow/screen', { method: 'PUT', json: { screen: 3 } });
    const row = await getAppSettingRow('welcome_flow_current_screen');
    expect(row?.setting_value).toBe('3');
    expect(row?.metadata).toMatchObject({ total_screens: 3 });
    await getPgTestDb().delete(appSettings).where(eq(appSettings.setting_key, 'welcome_flow_current_screen'));
  });

  it('returns 500 when screen is missing', async () => {
    const res = await appRequest('/api/welcome-flow/screen', { method: 'PUT', json: {} });
    expect(res.status).toBe(500);
    expect(res.data).toEqual({ error: 'Failed to update screen' });
  });
});
