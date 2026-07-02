import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Database } from '../../../lib/database/connection';
import { createMigrationRunner } from '../../../lib/database/migrations';
import { DatabaseSeeder } from '../../../lib/database/seeder';

const GAMES_DATA_DIR = path.join(process.cwd(), 'data', 'games');

function makeDbPath(suffix: string) {
  return path.join(process.cwd(), 'app_data', 'data', `migrations-idempotency-${suffix}.db`);
}

async function openFreshDb(suffix: string): Promise<{ db: Database; dbPath: string }> {
  const dbPath = makeDbPath(suffix);
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const db = new Database(dbPath);
  await db.connect();
  return { db, dbPath };
}

async function teardown(db: Database, dbPath: string) {
  await db.close();
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
  }
}

const migrationsDir = path.join(process.cwd(), 'migrations');

describe('Database Migrations — idempotency extended', () => {
  const openedDbs: Array<{ db: Database; dbPath: string }> = [];

  afterAll(async () => {
    for (const { db, dbPath } of openedDbs) {
      await teardown(db, dbPath);
    }
  });

  it('records each migration exactly once even when runner.up() is called twice', async () => {
    const ctx = await openFreshDb('exact-once');
    openedDbs.push(ctx);
    const { db } = ctx;

    const runner = createMigrationRunner(db, migrationsDir, undefined);
    await runner.up();
    await runner.up(); // second call should be a no-op

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const records = await db.all<{ filename: string; COUNT: number }>(
      `SELECT filename, COUNT(*) as COUNT FROM migrations GROUP BY filename`
    );

    for (const file of migrationFiles) {
      const rec = records.find(r => r.filename === file);
      expect(rec).toBeDefined();
      expect(rec!.COUNT).toBe(1);
    }
  });

  it('records exactly 23 migration files', async () => {
    const ctx = await openFreshDb('count-23');
    openedDbs.push(ctx);
    const { db } = ctx;

    const runner = createMigrationRunner(db, migrationsDir, undefined);
    await runner.up();

    const count = await db.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM migrations`
    );
    expect(count!.cnt).toBe(23);
  });

  it('does not alter seeded game rows when migrations run a second time', async () => {
    const ctx = await openFreshDb('seed-preserve');
    openedDbs.push(ctx);
    const { db } = ctx;

    const runner = createMigrationRunner(db, migrationsDir, undefined);
    await runner.up();

    const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
    await seeder.seedDatabase();

    const beforeGames = await db.all<{ id: string; name: string }>(
      `SELECT id, name FROM games ORDER BY id`
    );

    // Run migrations again (no-op)
    await runner.up();

    const afterGames = await db.all<{ id: string; name: string }>(
      `SELECT id, name FROM games ORDER BY id`
    );

    expect(afterGames).toEqual(beforeGames);
  });

  it('does not alter seeded mode rows when migrations run a second time', async () => {
    const ctx = await openFreshDb('modes-preserve');
    openedDbs.push(ctx);
    const { db } = ctx;

    const runner = createMigrationRunner(db, migrationsDir, undefined);
    await runner.up();

    const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
    await seeder.seedDatabase();

    const beforeCount = await db.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM game_modes`);
    await runner.up();
    const afterCount = await db.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM game_modes`);

    expect(afterCount!.cnt).toBe(beforeCount!.cnt);
  });

  it('schema includes expected performance indexes from migration 013', async () => {
    const ctx = await openFreshDb('indexes');
    openedDbs.push(ctx);
    const { db } = ctx;

    const runner = createMigrationRunner(db, migrationsDir, undefined);
    await runner.up();

    const indexes = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name`
    );
    const indexNames = indexes.map(i => i.name);

    // Spot-check indexes that should exist from migration 013
    expect(indexNames).toContain('idx_matches_status');
    expect(indexNames).toContain('idx_match_participants_match_id');
    expect(indexNames).toContain('idx_match_games_match_id');
  });

  it('all expected core tables are present after full migration run', async () => {
    const ctx = await openFreshDb('tables-check');
    openedDbs.push(ctx);
    const { db } = ctx;

    const runner = createMigrationRunner(db, migrationsDir, undefined);
    await runner.up();

    const tables = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );
    const tableNames = tables.map(t => t.name);

    const expectedTables = [
      'matches', 'match_participants', 'match_games',
      'tournaments', 'tournament_teams', 'tournament_matches',
      'games', 'game_modes', 'game_maps',
      'discord_settings', 'app_settings',
      'activity_feed', 'migrations',
    ];

    for (const t of expectedTables) {
      expect(tableNames).toContain(t);
    }
  });
});
