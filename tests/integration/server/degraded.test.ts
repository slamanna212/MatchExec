// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { isDegraded } from '@/server/middleware/degraded';
import { getSystemStatus, setSystemStatus } from '@lib/db/system-status';
import { recordMigrationFailure } from '@lib/db/migrate-cli';
import { resolveBindHost, resolvePort } from '@/server/index';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

setupPgTestFile();

describe('degraded mode (failed migration in the all-in-one container)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('is off unless MATCHEXEC_DEGRADED=true', () => {
    expect(isDegraded({})).toBe(false);
    expect(isDegraded({ MATCHEXEC_DEGRADED: 'false' })).toBe(false);
    expect(isDegraded({ MATCHEXEC_DEGRADED: 'true' })).toBe(true);
  });

  it('keeps serving /api/db-status, answers /api/health with 503 and blocks other API calls and uploads', async () => {
    vi.stubEnv('MATCHEXEC_DEGRADED', 'true');
    const status = await appRequest('/api/db-status');
    expect(status.status).toBe(200);
    const health = await appRequest('/api/health');
    expect(health.status).toBe(503);
    expect(health.data).toMatchObject({ status: 'degraded' });
    const games = await appRequest('/api/games');
    expect(games.status).toBe(503);
    expect(games.data).toMatchObject({ degraded: true });
    const upload = await appRequest('/uploads/events/x.png');
    expect(upload.status).toBe(503);
  });

  it('does not interfere in normal mode', async () => {
    const health = await appRequest('/api/health');
    expect(health.status).toBe(200);
  });
});

describe('server bind address', () => {
  it('uses BIND_HOST and never the Kubernetes pod name in HOSTNAME', () => {
    expect(resolveBindHost({})).toBe('0.0.0.0');
    expect(resolveBindHost({ HOSTNAME: 'matchexec-web-7d9f' })).toBe('0.0.0.0');
    expect(resolveBindHost({ BIND_HOST: '127.0.0.1' })).toBe('127.0.0.1');
    expect(resolveBindHost({ BIND_HOST: '  ' })).toBe('0.0.0.0');
  });

  it('resolves the port', () => {
    expect(resolvePort({ PORT: '8080' })).toBe(8080);
    expect(resolvePort({ NODE_ENV: 'production' })).toBe(3000);
  });
});

describe('recordMigrationFailure', () => {
  it('stores the error so /api/db-status can show it, without overwriting an importer report', async () => {
    await recordMigrationFailure(new Error('pg_dump exploded'));
    expect(await getSystemStatus()).toMatchObject({ phase: 'error', report: { error: 'pg_dump exploded' } });
    const res = await appRequest('/api/db-status');
    expect(res.data).toMatchObject({ ready: false, phase: 'error', error: { message: 'pg_dump exploded' } });

    await setSystemStatus({ phase: 'error', message: 'import failed', report: { error: 'import preflight failed', issues: [] } });
    await recordMigrationFailure(new Error('second'));
    expect((await getSystemStatus())?.report).toMatchObject({ error: 'import preflight failed' });
  });
});
