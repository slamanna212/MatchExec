/**
 * Postgres test harness (Drizzle). Per test FILE: a fresh database with the baseline migration applied and injected
 * into `lib/db` via `setDbForTesting`, so Hono routes / domain code using `db` see it.
 *
 *   - Default: in-process PGlite (no services needed).
 *   - TEST_DATABASE_URL set (`pnpm test:pg`, CI): real Postgres via node-postgres. Every test file creates its own
 *     throw-away DATABASE (`mxtest_<pid>_<rand>`) on that server and drops it in teardown, so parallel files never share state.
 *
 * Opt-in: call `setupPgTestFile()` at the top of a test file (registers beforeAll / afterEach / afterAll). Such files are
 * detected by `tests/setup.ts` (path under `tests/integration/server/`, or basename starting with `pg-`) and the old
 * SQLite per-file setup is skipped for them.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { resetDb, schema, setDbForTesting, type Db } from '../../lib/db';
import { applyMigrationsPglite, MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, resolveMigrationsFolder } from '../../lib/db/migrate';
import { seedDatabase } from '../../lib/db/seed';

export interface PgTestDbOptions {
  /** Seed the 10 games / voices / default settings once per file (default false). */
  seed?: boolean;
  /** Truncate all tables after each test (default true). With `seed`, reference tables are kept. */
  resetBetweenTests?: boolean;
}

export interface PgTestHandle {
  db: Db;
  mode: 'pglite' | 'postgres';
  close(): Promise<void>;
}

/** Tables holding seeded reference data; preserved by reset when the file was seeded. */
export const REFERENCE_TABLES = [
  'games', 'game_modes', 'game_maps', 'game_stat_definitions', 'data_versions', 'voices', 'voice_data_versions',
  'app_settings', 'stats_settings',
];

export const isRealPostgres = (): boolean => !!process.env.TEST_DATABASE_URL;

let current: (PgTestHandle & { seeded: boolean }) | null = null;

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

export async function createPgTestDb(): Promise<PgTestHandle> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    const { PGlite } = await import('@electric-sql/pglite');
    const client = new PGlite();
    const db = drizzlePglite(client, { schema }) as unknown as Db;
    await applyMigrationsPglite(db);
    return { db, mode: 'pglite', close: async () => { await client.close(); } };
  }

  const dbName = `mxtest_${process.pid}_${randomBytes(4).toString('hex')}`;
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
  const pool = new Pool({ connectionString: withDatabase(adminUrl, dbName), max: 5 });
  const db = drizzlePg(pool, { schema });
  await migratePg(db, { migrationsFolder: resolveMigrationsFolder(), migrationsTable: MIGRATIONS_TABLE, migrationsSchema: MIGRATIONS_SCHEMA });
  return {
    db: db as unknown as Db,
    mode: 'postgres',
    close: async () => {
      await pool.end();
      const dropper = new Pool({ connectionString: adminUrl, max: 1 });
      try {
        await dropper.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      } finally {
        await dropper.end();
      }
    },
  };
}

export async function setupPgTestDb(options: PgTestDbOptions = {}): Promise<PgTestHandle> {
  const handle = await createPgTestDb();
  if (options.seed) await seedDatabase(handle.db);
  setDbForTesting(handle.db);
  current = { ...handle, seeded: !!options.seed };
  return handle;
}

/** Truncate every table in `public` and `control` (except the migrations table). */
export async function resetPgTestDb(): Promise<void> {
  if (!current) return;
  const { db, seeded } = current;
  const res = await db.execute(sql`SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public','control') AND tablename <> ${MIGRATIONS_TABLE}`);
  const rows = (res as unknown as { rows: Array<{ schemaname: string; tablename: string }> }).rows;
  const tables = rows
    .filter((r) => !(seeded && r.schemaname === 'public' && REFERENCE_TABLES.includes(r.tablename)))
    .map((r) => `"${r.schemaname}"."${r.tablename}"`);
  if (tables.length === 0) return;
  await db.execute(sql.raw(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`));
}

export async function teardownPgTestDb(): Promise<void> {
  const handle = current;
  current = null;
  await resetDb(); // clears the test override
  if (handle) await handle.close();
}

export function getPgTestDb(): Db {
  if (!current) throw new Error('PG test database not set up: call setupPgTestFile() in the test file');
  return current.db;
}

/** Register the lifecycle hooks for a PG-backed test file. */
export function setupPgTestFile(options: PgTestDbOptions = {}): void {
  beforeAll(async () => { await setupPgTestDb(options); }, 60000);
  if (options.resetBetweenTests !== false) afterEach(async () => { await resetPgTestDb(); });
  afterAll(async () => { await teardownPgTestDb(); });
}

export { sql };
