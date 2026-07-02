/**
 * M2 — Full-Suite Sanity Smoke Test
 *
 * Verifies that the test environment boots correctly:
 * - DB migrations run (via test setup)
 * - All game directories are seeded with games, modes, and maps
 * - A match can be created end-to-end via the API
 * - console.error is not called during the boot sequence
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { DatabaseSeeder } from '../../../lib/database/seeder';
import type { Database } from '../../../lib/database/connection';
import { createMockRequest, parseResponse } from '../../utils/api-helpers';
import { POST as createMatch } from '@/app/api/matches/route';

vi.mock('../../../lib/database/status', () => ({
  markDbReady: vi.fn(),
  markDbNotReady: vi.fn(),
  getDbStatus: vi.fn().mockReturnValue({ ready: true, progress: 'done' }),
}));

describe('Full-Suite Sanity (M2)', () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    await seedBasicTestData();
    db = getTestDb();
  });

  // ─── DB is up ──────────────────────────────────────────────────────────────

  it('database connection is available and responding', async () => {
    const row = await db.get('SELECT 1 AS ok') as { ok: number } | null;
    expect(row?.ok).toBe(1);
  });

  it('migrations have run — core tables exist', async () => {
    const tables = await db.all(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ) as Array<{ name: string }>;
    const names = tables.map(t => t.name);

    for (const table of ['games', 'game_modes', 'game_maps', 'matches', 'tournaments']) {
      expect(names).toContain(table);
    }
  });

  // ─── Game seeding ──────────────────────────────────────────────────────────

  it('seeder seeds all game directories into the DB', async () => {
    const dataDir = path.resolve(
      __dirname,
      '../../../data/games'
    );
    const seeder = new DatabaseSeeder(db as unknown as Database, dataDir);
    await seeder.seedDatabase();

    const games = await db.all('SELECT id FROM games') as Array<{ id: string }>;
    expect(games.length).toBeGreaterThanOrEqual(6);
  });

  it('seeded game_modes count is > 0', async () => {
    const dataDir = path.resolve(__dirname, '../../../data/games');
    const seeder = new DatabaseSeeder(db as unknown as Database, dataDir);
    await seeder.seedDatabase();

    const modes = await db.all('SELECT id FROM game_modes') as Array<{ id: string }>;
    expect(modes.length).toBeGreaterThan(0);
  });

  it('seeded game_maps count is > 0', async () => {
    const dataDir = path.resolve(__dirname, '../../../data/games');
    const seeder = new DatabaseSeeder(db as unknown as Database, dataDir);
    await seeder.seedDatabase();

    const maps = await db.all('SELECT id FROM game_maps') as Array<{ id: string }>;
    expect(maps.length).toBeGreaterThan(0);
  });

  // ─── Match creation end-to-end ─────────────────────────────────────────────

  it('creates a match via POST /api/matches using seeded game data', async () => {
    const seed = await seedBasicTestData();
    const req = createMockRequest('POST', '/api/matches', {
      name: 'Sanity Match',
      gameId: seed.game.id,
      startDate: new Date().toISOString(),
    });
    const { status, data } = await parseResponse(await createMatch(req));

    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.status).toBe('created');
  });

  it('created match is persisted in the DB', async () => {
    const seed = await seedBasicTestData();
    const req = createMockRequest('POST', '/api/matches', {
      name: 'Sanity Persist Match',
      gameId: seed.game.id,
      startDate: new Date().toISOString(),
    });
    const { data } = await parseResponse(await createMatch(req));
    const matchId = data.id as string;

    const row = await db.get(
      'SELECT id, status FROM matches WHERE id = ?',
      [matchId]
    ) as { id: string; status: string } | null;

    expect(row?.id).toBe(matchId);
    expect(row?.status).toBe('created');
  });

  // ─── No spurious console.error during seeding ─────────────────────────────

  it('no console.error is fired during game seeding', async () => {
    const errorSpy = vi.spyOn(console, 'error');

    const dataDir = path.resolve(__dirname, '../../../data/games');
    const seeder = new DatabaseSeeder(db as unknown as Database, dataDir);
    await seeder.seedDatabase();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
