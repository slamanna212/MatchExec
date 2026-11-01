/**
 * Schema migration + seeding entrypoint ("migrate" service) and the startup gate for every other service.
 *
 *   runMigrations()    : take a Postgres advisory lock, (pre-upgrade dump hook), apply Drizzle migrations, seed.
 *   waitForSchema()    : non-migrate services poll until the migrations table holds the latest migration.
 *
 * CLI: `pnpm db:migrate` (tsx lib/db/migrate-cli.ts); the production bundle is dist/migrate.js (same entrypoint).
 */
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { Pool } from 'pg';
import { getPool, schema, type Db } from './index';
import { seedDatabase, type SeedOptions } from './seed';
import { setSystemStatus } from './system-status';

const log = (...a: unknown[]) => { if (!process.env.VITEST) console.log('[migrate]', ...a); };

/** Constant key for pg_advisory_lock so two migrators (k8s Job + stray pod) can never run concurrently. */
export const MIGRATION_ADVISORY_LOCK_ID = 7_310_150_001;
export const MIGRATIONS_TABLE = '__drizzle_migrations';
export const MIGRATIONS_SCHEMA = 'public';

export function resolveMigrationsFolder(): string {
  return process.env.MATCHEXEC_MIGRATIONS_DIR ?? path.join(process.cwd(), 'drizzle');
}

/**
 * Extension points filled in by later stages. They are deliberately no-ops now.
 */
export const migrationHooks = {
  /**
   * TODO(Stage 6): take a pre-upgrade `pg_dump` (lib/backup) into MATCHEXEC_BACKUP_DIR.
   * Called only when the database already has applied migrations AND there are pending ones.
   */
  async preUpgradeDump(_ctx: { pool: Pool; pendingMigrations: number }): Promise<void> {},
  /**
   * TODO(Stage 5): import a legacy SQLite database (DATABASE_PATH / app_data/data/matchexec.db) into the fresh
   * schema, inside one transaction, updating system_status phase 'importing'. Return true when an import ran.
   * Called after migrations are applied and before seeding.
   */
  async importLegacySqlite(_ctx: { db: Db; pool: Pool }): Promise<boolean> {
    return false;
  },
};

interface LatestMigration {
  hash: string;
  folderMillis: number;
  count: number;
}

/** Reads drizzle/meta/_journal.json (via drizzle's own reader) and returns the newest migration. */
export function getExpectedLatestMigration(migrationsFolder = resolveMigrationsFolder()): LatestMigration {
  const files = readMigrationFiles({ migrationsFolder });
  if (files.length === 0) throw new Error(`No migrations found in ${migrationsFolder}`);
  const last = files[files.length - 1];
  return { hash: last.hash, folderMillis: last.folderMillis, count: files.length };
}

async function appliedMigrationCount(pool: Pool): Promise<number> {
  const exists = await pool.query(`SELECT to_regclass('"${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"') AS t`);
  if (!exists.rows[0]?.t) return 0;
  const r = await pool.query(`SELECT count(*)::int AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`);
  return r.rows[0].n as number;
}

export interface RunMigrationsOptions {
  /** Defaults to the shared pool from lib/db/index.ts. */
  pool?: Pool;
  migrationsFolder?: string;
  seed?: boolean;
  seedOptions?: SeedOptions;
}

/**
 * Apply pending Drizzle migrations to Postgres and seed reference data, under an advisory lock.
 * (Tests use PGlite and call `applyMigrationsPglite` + `seedDatabase` directly; there is no lock contention there.)
 */
export async function runMigrations(options: RunMigrationsOptions = {}): Promise<void> {
  const pool = options.pool ?? getPool();
  const migrationsFolder = options.migrationsFolder ?? resolveMigrationsFolder();
  const expected = getExpectedLatestMigration(migrationsFolder);

  // One dedicated connection holds the session-level advisory lock for the whole run.
  const lockClient = await pool.connect();
  try {
    log('waiting for migration lock...');
    await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
    try {
      const applied = await appliedMigrationCount(pool);
      const pending = expected.count - applied;
      if (applied > 0 && pending > 0) {
        log(`${pending} pending migration(s) on an existing database`);
        await migrationHooks.preUpgradeDump({ pool, pendingMigrations: pending });
      }

      const db = drizzle(pool, { schema });
      log(applied === 0 ? 'applying baseline schema...' : `applying ${Math.max(pending, 0)} pending migration(s)...`);
      await migrateNodePg(db, { migrationsFolder, migrationsTable: MIGRATIONS_TABLE, migrationsSchema: MIGRATIONS_SCHEMA });

      await setSystemStatus({ phase: 'migrating', message: 'Schema up to date', progress: 40 }, db as unknown as Db);
      await migrationHooks.importLegacySqlite({ db: db as unknown as Db, pool });

      if (options.seed !== false) {
        await setSystemStatus({ phase: 'seeding', message: 'Seeding game data...', progress: 70 }, db as unknown as Db);
        const n = await seedDatabase(db as unknown as Db, options.seedOptions);
        log(`seeded ${n} game(s)`);
      }
      await setSystemStatus({ phase: 'ready', message: 'Database ready', progress: 100 }, db as unknown as Db);
      log('done');
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_ID]).catch(() => undefined);
    }
  } finally {
    lockClient.release();
  }
}

/** Apply migrations to a PGlite-backed Drizzle instance (tests). Kept dynamic so prod bundles don't need pglite. */
export async function applyMigrationsPglite(db: unknown, migrationsFolder = resolveMigrationsFolder()): Promise<void> {
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder, migrationsTable: MIGRATIONS_TABLE, migrationsSchema: MIGRATIONS_SCHEMA });
}

export interface WaitForSchemaOptions {
  pool?: Pool;
  migrationsFolder?: string;
  /** Give up after this many ms (default MATCHEXEC_SCHEMA_WAIT_MS or 5 minutes). */
  timeoutMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

/** Latest-applied check shared by waitForSchema and tests. */
export async function isSchemaCurrent(pool: Pool, migrationsFolder = resolveMigrationsFolder()): Promise<boolean> {
  const expected = getExpectedLatestMigration(migrationsFolder);
  try {
    const r = await pool.query(`SELECT hash FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`);
    return r.rows[0]?.hash === expected.hash;
  } catch {
    return false; // relation does not exist yet (or the server is still starting)
  }
}

/**
 * For non-migrate services (and any process when MATCHEXEC_RUN_MIGRATIONS=false): poll with exponential backoff until the
 * migrations table reports the newest migration in drizzle/meta/_journal.json, then return.
 */
export async function waitForSchema(options: WaitForSchemaOptions = {}): Promise<void> {
  const pool = options.pool ?? getPool();
  const folder = options.migrationsFolder ?? resolveMigrationsFolder();
  const timeoutMs = options.timeoutMs ?? Number.parseInt(process.env.MATCHEXEC_SCHEMA_WAIT_MS ?? '300000', 10);
  const maxDelay = options.maxDelayMs ?? 5000;
  let delay = options.initialDelayMs ?? 250;
  const started = Date.now();
  for (;;) {
    if (await isSchemaCurrent(pool, folder)) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Database schema not up to date after ${timeoutMs}ms (waiting for migration ${getExpectedLatestMigration(folder).hash.slice(0, 12)}...)`);
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(Math.round(delay * 1.5), maxDelay);
  }
}
