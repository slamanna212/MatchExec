// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { setAppSetting } from '../../../src/lib/settings';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile({ seed: true });

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('GET /api/health/ready', () => {
  it('returns 200 and reports every service; background services are down without heartbeats', async () => {
    const res = await appRequest('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.data.services.database.status).toBe('up');
    expect(res.data.services.web.status).toBe('up');
    expect(res.data.services.scheduler).toMatchObject({ status: 'down', message: 'No heartbeat recorded yet' });
    expect(res.data.services.stats_processor.status).toBe('down');
    expect(res.data.status).toBe('unhealthy');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('discord_bot explains the welcome flow when setup is incomplete, otherwise the missing heartbeat', async () => {
    let res = await appRequest('/api/health/ready');
    expect(res.data.services.discord_bot.message).toBe('Welcome flow not completed');
    await setAppSetting('welcome_flow_completed', 'true');
    res = await appRequest('/api/health/ready');
    expect(res.data.services.discord_bot.message).toBe('No heartbeat recorded yet');
  });

  it('marks services up for recent heartbeats and healthy when all are up', async () => {
    const recent = minutesAgo(1);
    await setAppSetting('scheduler_last_heartbeat', recent);
    await setAppSetting('discord_bot_last_heartbeat', recent);
    await setAppSetting('stats_processor_last_heartbeat', recent);
    const res = await appRequest('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('healthy');
    expect(res.data.services.scheduler).toMatchObject({ status: 'up', lastHeartbeat: recent });
  });

  it('marks old heartbeats degraded with the elapsed minutes, and overall degraded when none are down', async () => {
    await setAppSetting('scheduler_last_heartbeat', minutesAgo(30));
    await setAppSetting('discord_bot_last_heartbeat', minutesAgo(1));
    await setAppSetting('stats_processor_last_heartbeat', minutesAgo(1));
    const res = await appRequest('/api/health/ready');
    expect(res.data.services.scheduler.status).toBe('degraded');
    expect(res.data.services.scheduler.message).toMatch(/^No heartbeat for 30 minutes/);
    expect(res.data.status).toBe('degraded');
  });

  it('returns 503 when the database check fails', async () => {
    const spy = vi.spyOn(getPgTestDb(), 'execute').mockRejectedValueOnce(new Error('boom'));
    const res = await appRequest('/api/health/ready');
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(res.data).toMatchObject({ status: 'unhealthy', error: 'Database connection failed' });
    expect(res.data.services.database.status).toBe('down');
  });
});
