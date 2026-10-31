// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createMatch, seedBasicTestData } from '../../utils/pg-fixtures';
import { games } from '../../../lib/db/schema';
import { markSystemReady, setSystemStatus } from '../../../lib/db/system-status';
import { setAppSetting } from '../../../src/lib/settings';
import { getPgTestDb } from '../../utils/pg-test-db';
import { count } from 'drizzle-orm';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile({ seed: true });

describe('GET /api/db-status', () => {
  it('reports not ready before the migrator has written a status row', async () => {
    const res = await appRequest('/api/db-status');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ ready: false, progress: 'Initializing database...' });
    expect(typeof res.data.timestamp).toBe('number');
  });

  it('mirrors system_status progress and readiness', async () => {
    await setSystemStatus({ phase: 'seeding', message: 'Seeding game data (2/10)...', progress: 40 });
    let res = await appRequest('/api/db-status');
    expect(res.data).toMatchObject({ ready: false, progress: 'Seeding game data (2/10)...', phase: 'seeding', percent: 40 });

    await markSystemReady();
    res = await appRequest('/api/db-status');
    expect(res.data).toMatchObject({ ready: true, phase: 'ready', percent: 100 });
  });

  it('is reachable without a session even when auth is enabled', async () => {
    process.env.ADMIN_PASSWORD = 'pw';
    try {
      expect((await appRequest('/api/db-status')).status).toBe(200);
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });
});

describe('GET /api/version', () => {
  it('returns version info with update flags from app_settings', async () => {
    await setAppSetting('update_available', 'true');
    await setAppSetting('latest_version', 'v9.9.9');
    const res = await appRequest('/api/version');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ updateAvailable: true, latestVersion: 'v9.9.9' });
    expect(res.data).toHaveProperty('version');
    expect(res.data).toHaveProperty('branch');
  });

  it('defaults to no update', async () => {
    // app_settings is a preserved reference table: restore the seeded defaults the previous test changed
    await setAppSetting('update_available', 'false');
    await setAppSetting('latest_version', '');
    const res = await appRequest('/api/version');
    expect(res.data).toMatchObject({ updateAvailable: false, latestVersion: '' });
  });
});

describe('GET /api/metrics', () => {
  it('serves Prometheus text with process, count and size metrics', async () => {
    const { game, mode } = await seedBasicTestData();
    await createMatch(game.id, mode.id, { status: 'battle' });
    const res = await appRequest('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = String(res.data);
    const [{ n }] = await getPgTestDb().select({ n: count() }).from(games);
    expect(text).toContain('matchexec_uptime_seconds');
    expect(text).toContain('matchexec_memory_rss_bytes');
    expect(text).toContain('# HELP matchexec_matches_total');
    expect(text).toMatch(/matchexec_matches_total\{status="battle"\} 1/);
    expect(text).toMatch(/matchexec_matches_count 1\n/);
    expect(text).toMatch(/matchexec_matches_active 1\n/);
    expect(text).toContain(`matchexec_games_count ${n}\n`);
    expect(text).toMatch(/matchexec_matches_created_24h 1\n/);
    expect(text).toContain('matchexec_tournaments_count');
    expect(text).toContain('matchexec_match_participants_total');
    expect(text).toContain('matchexec_discord_queue_pending');
    expect(text).toContain('matchexec_database_size_bytes');
    expect(text).not.toContain('matchexec_database_up');
  });

  it('reports heartbeat ages', async () => {
    await setAppSetting('scheduler_last_heartbeat', new Date(Date.now() - 120_000).toISOString());
    const text = String((await appRequest('/api/metrics')).data);
    const m = /matchexec_scheduler_heartbeat_age_seconds (\d+)/.exec(text);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(119);
  });

  it('falls back to process metrics plus database_up 0 when the database fails', async () => {
    const spy = vi.spyOn(getPgTestDb(), 'select').mockImplementation(() => { throw new Error('down'); });
    const text = String((await appRequest('/api/metrics')).data);
    spy.mockRestore();
    expect(text).toContain('matchexec_uptime_seconds');
    expect(text).toContain('matchexec_database_up');
  });
});
