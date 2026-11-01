// @vitest-environment node
/** Boot sanity (ported from the SQLite full-suite-sanity test): migrations, seeded reference data, match creation through the app. */
import { describe, expect, it, vi } from 'vitest';
import { count, eq, sql } from 'drizzle-orm';
import { gameMaps, gameModes, games, matches } from '../../../lib/db/schema';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile({ seed: true });
const pg = () => getPgTestDb();

describe('full-suite sanity', () => {
  it('database connection is available and responding', async () => {
    const res = await pg().execute(sql`SELECT 1 AS ok`);
    expect((res as unknown as { rows: Array<{ ok: number }> }).rows[0].ok).toBe(1);
  });

  it('migrations have run: core tables exist', async () => {
    const res = await pg().execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    const names = (res as unknown as { rows: Array<{ tablename: string }> }).rows.map((r) => r.tablename);
    for (const table of ['games', 'game_modes', 'game_maps', 'matches', 'tournaments']) expect(names).toContain(table);
  });

  it('seeder seeds all game directories (>= 6 games, modes and maps present)', async () => {
    expect((await pg().select({ n: count() }).from(games))[0].n).toBeGreaterThanOrEqual(6);
    expect((await pg().select({ n: count() }).from(gameModes))[0].n).toBeGreaterThan(0);
    expect((await pg().select({ n: count() }).from(gameMaps))[0].n).toBeGreaterThan(0);
  });

  it('creates a match via POST /api/matches using seeded game data and persists it', async () => {
    const [game] = await pg().select().from(games).limit(1);
    const res = await appRequest<{ id: string; status: string }>('/api/matches', {
      method: 'POST',
      json: { name: 'Sanity Match', gameId: game.id, startDate: new Date().toISOString() },
    });
    expect(res.status).toBe(201);
    expect(res.data.status).toBe('created');
    const [row] = await pg().select().from(matches).where(eq(matches.id, res.data.id));
    expect(row?.status).toBe('created');
  });

  it('no console.error is fired during game seeding', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    const { seedDatabase } = await import('../../../lib/db/seed');
    await seedDatabase(pg());
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
