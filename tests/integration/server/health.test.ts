// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

setupPgTestFile();

describe('GET /api/health', () => {
  it('is healthy when the database answers', async () => {
    const res = await appRequest('/api/health');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: 'healthy', services: { database: 'up', web: 'up' } });
    expect(new Date(res.data.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('is unhealthy (503) when the database query fails', async () => {
    const spy = vi.spyOn(getPgTestDb(), 'execute').mockRejectedValueOnce(new Error('boom'));
    const res = await appRequest('/api/health');
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(res.data).toMatchObject({ status: 'unhealthy', error: 'Database connection failed' });
  });

  it('sets Cache-Control: no-store', async () => {
    const res = await appRequest('/api/health');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('works through the harness db', async () => {
    const r = await getPgTestDb().execute(sql`select 1 as one`);
    expect((r as unknown as { rows: unknown[] }).rows).toHaveLength(1);
  });
});
