/**
 * Backup restore engine (plan 6.4).
 *
 *   1. validate the file (before anything is disturbed)
 *   2. quiesce: control.maintenance = maintenance, wait for every fresh-heartbeat worker to acknowledge (finished its job)
 *   3. pre-restore dump of the current data (backups/pre-restore/)
 *   4a. PostgreSQL dump (PGDMP): `ALTER SCHEMA public RENAME TO prerestore_<ts>; pg_restore --single-transaction` into a new
 *       `public`, Drizzle migrations (the backup may be older), sanity checks; success drops the renamed schema, failure drops
 *       the new `public` and renames the old one back.
 *   4b. legacy SQLite (.db): the importer. It is already one atomic transaction that replaces the contents of every table it
 *       maps, so it runs in place (its own rollback is the safety net) instead of into a renamed schema; when seeding or the
 *       sanity checks fail after it committed, the pre-restore dump is restored through path 4a.
 *   5. resume: maintenance = normal (workers reload their settings).
 *
 * The `control` schema is never part of a dump or of the swap, so coordination survives the restore. A session-level advisory
 * lock (RESTORE_LOCK_ID) held for the whole restore serialises restores and lets other processes detect a crashed restore.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import { createBackup, inspectPgDump, pruneNewest, restorePgDump, resolveDatabaseUrlForTools, PgToolError, type BackupFormat } from './backup';
import { getPool, schema, type Db } from './db';
import { isSchemaCurrent, resolveMigrationsFolder, runMigrations } from './db/migrate';
import { seedDatabase } from './db/seed';
import { setSystemStatus } from './db/system-status';
import {
  enterMaintenance, exitMaintenance, pruneDeadWorkers, RESTORE_LOCK_ID, ROLLBACK_FAILED_REASON,
  setLocalState, setMaintenanceState, waitForQuiesce,
} from './maintenance';

export type RestoreStatusCode = 400 | 409 | 500;

export class RestoreError extends Error {
  readonly rollbackFailed: boolean;
  constructor(message: string, readonly status: RestoreStatusCode = 500, options?: { cause?: unknown; rollbackFailed?: boolean }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.rollbackFailed = options?.rollbackFailed ?? false;
    this.name = 'RestoreError';
  }
}

export type RestoreFormat = Extract<BackupFormat, 'pgdump' | 'sqlite'>;

export interface RestoreOptions {
  /** Decrypted backup file on disk. */
  file: string;
  format: RestoreFormat;
  pool?: Pool;
  databaseUrl?: string;
  migrationsFolder?: string;
  quiesceTimeoutMs?: number;
  quiescePollMs?: number;
  /** Progress callback (step names are stable: validate, pause, pre-restore, restore, migrate, verify, cleanup, resume). */
  onProgress?: (step: string) => void;
  log?: (message: string) => void;
  /** Let a caller (the web server) release its own in-flight request from the drain before waiting. */
  beforeQuiesce?: () => void;
}

export interface RestoreResult {
  format: RestoreFormat;
  preRestoreBackup: string;
  durationMs: number;
}

/** Tables every healthy MatchExec database has after migrations (used by the post-restore sanity check). */
const REQUIRED_TABLES = ['matches', 'tournaments', 'series', 'games', 'game_modes', 'app_settings', 'discord_settings', 'system_status', 'blobs'];

const stamp = (d: Date): string => d.toISOString().replace(/[-:T]/g, '').slice(0, 14);

async function sanityCheck(pool: Pool, migrationsFolder: string): Promise<void> {
  for (const table of REQUIRED_TABLES) {
    const r = await pool.query<{ t: string | null }>('SELECT to_regclass($1) AS t', [`public.${table}`]);
    if (!r.rows[0]?.t) throw new Error(`the restored database has no "${table}" table`);
  }
  if (!(await isSchemaCurrent(pool, migrationsFolder))) {
    throw new Error('the restored database does not match this version of MatchExec (the backup may come from a newer version)');
  }
  for (const table of ['matches', 'tournaments', 'series', 'games']) {
    const r = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM public."${table}"`);
    if (r.rows[0].n < 0) throw new Error(`implausible row count in ${table}`);
    if (table === 'games' && r.rows[0].n === 0) throw new Error('the restored database has no games');
  }
  const s = await pool.query<{ phase: string }>('SELECT phase FROM public.system_status WHERE id = 1');
  if (s.rows[0] && s.rows[0].phase !== 'ready') throw new Error(`system status is "${s.rows[0].phase}" after the restore`);
}

interface SwapContext {
  lock: PoolClient;
  pool: Pool;
  databaseUrl: string;
  migrationsFolder: string;
  log: (m: string) => void;
  progress: (step: string) => void;
}

/** Plan 6.4 steps 3-5 for a PGDMP file: rename, restore, migrate, validate, then drop the old schema or roll back. */
async function swapRestore(ctx: SwapContext, file: string, hasPublicSchema: boolean): Promise<void> {
  const { lock, pool } = ctx;
  const aside = `prerestore_${stamp(new Date())}`;
  await lock.query(`ALTER SCHEMA public RENAME TO ${aside}`);
  ctx.log(`current data moved to schema ${aside}`);
  try {
    // pg_restore creates `public` itself when the archive carries it (every dump made by this module does).
    if (!hasPublicSchema) await lock.query('CREATE SCHEMA public');
    ctx.progress('restore');
    await restorePgDump(file, { databaseUrl: ctx.databaseUrl });
    ctx.progress('migrate');
    await runMigrations({ pool, migrationsFolder: ctx.migrationsFolder, skipPreUpgradeDump: true, skipLegacyImport: true });
    ctx.progress('verify');
    await sanityCheck(pool, ctx.migrationsFolder);
  } catch (error) {
    ctx.log(`restore failed, rolling back: ${(error as Error).message}`);
    try {
      await lock.query('DROP SCHEMA IF EXISTS public CASCADE');
      await lock.query(`ALTER SCHEMA ${aside} RENAME TO public`);
    } catch (rollbackError) {
      await setMaintenanceState(pool, 'maintenance', `${ROLLBACK_FAILED_REASON}: your previous data is in schema ${aside}`).catch(() => undefined);
      throw new RestoreError(
        `Restore failed and the automatic rollback failed too (${(rollbackError as Error).message}). Your previous data is intact in the database schema "${aside}"; MatchExec stays in maintenance mode until an administrator renames it back to "public".`,
        500,
        { cause: error, rollbackFailed: true },
      );
    }
    throw error;
  }
  ctx.progress('cleanup');
  try {
    await lock.query(`DROP SCHEMA ${aside} CASCADE`);
  } catch (error) {
    ctx.log(`WARNING: could not drop schema ${aside}: ${(error as Error).message} (the pre-restore dump remains)`);
  }
}

/** Legacy `.db` (plan D3): the importer, in place and atomic. */
async function sqliteRestore(ctx: SwapContext, file: string, preRestoreFile: string): Promise<void> {
  const { pool } = ctx;
  const db = drizzle(pool, { schema }) as unknown as Db;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'matchexec-sqlite-restore-'));
  try {
    ctx.progress('restore');
    const { runImport } = await import('./import-sqlite/run');
    const { PreflightError } = await import('./import-sqlite/types');
    try {
      await runImport({
        db,
        legacyPath: file,
        backupDir: work,
        uploadsDirs: [],
        allowLossy: process.env.MATCHEXEC_IMPORT_ALLOW_LOSSY === 'true',
        statusDb: db,
        skipRename: true,
        log: ctx.log,
      });
    } catch (error) {
      await setSystemStatus({ phase: 'ready', message: 'Database ready', progress: 100 }, db).catch(() => undefined);
      if (error instanceof PreflightError) throw new RestoreError(`The SQLite backup cannot be imported:\n${error.message}`, 400, { cause: error });
      throw error;
    }
    try {
      ctx.progress('migrate');
      await seedDatabase(db);
      await setSystemStatus({ phase: 'ready', message: 'Database ready', progress: 100 }, db);
      ctx.progress('verify');
      await sanityCheck(pool, ctx.migrationsFolder);
    } catch (error) {
      // The import committed but the result is unusable: go back to the pre-restore dump.
      ctx.log(`post-import check failed (${(error as Error).message}); restoring the pre-restore dump`);
      const info = await inspectPgDump(preRestoreFile);
      await swapRestore(ctx, preRestoreFile, info.hasPublicSchema);
      throw error;
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export async function restoreBackup(options: RestoreOptions): Promise<RestoreResult> {
  const started = Date.now();
  const pool = options.pool ?? getPool();
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrlForTools();
  const migrationsFolder = options.migrationsFolder ?? resolveMigrationsFolder();
  const log = options.log ?? (() => undefined);
  const progress = (step: string): void => { options.onProgress?.(step); log(`restore: ${step}`); };

  // 1. Validate before anything is touched.
  progress('validate');
  let hasPublicSchema = true;
  if (options.format === 'pgdump') {
    try {
      const info = await inspectPgDump(options.file);
      hasPublicSchema = info.hasPublicSchema;
      if (info.tableCount === 0) throw new RestoreError('The backup does not contain any MatchExec tables.', 400);
    } catch (e) {
      if (e instanceof RestoreError) throw e;
      if (e instanceof PgToolError && e.reason === 'missing-binary') throw new RestoreError(e.message, 500, { cause: e });
      throw new RestoreError(`The backup file is damaged or not a valid PostgreSQL dump: ${(e as Error).message}`, 400, { cause: e });
    }
  }

  const lock = await pool.connect();
  let maintenanceOn = false;
  let rollbackFailed = false;
  try {
    const got = await lock.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS ok', [RESTORE_LOCK_ID]);
    if (!got.rows[0].ok) throw new RestoreError('Another restore is already in progress.', 409);

    // 2. Quiesce.
    progress('pause');
    // We hold the restore lock, so a non-normal state is left over from a crashed restore: reset it.
    const current = await pool.query<{ state: string; reason: string | null }>('SELECT state, reason FROM control.maintenance WHERE id = 1');
    if (current.rows[0] && current.rows[0].state !== 'normal') {
      if (current.rows[0].reason?.startsWith(ROLLBACK_FAILED_REASON)) {
        throw new RestoreError(`MatchExec is in maintenance mode after a failed restore: ${current.rows[0].reason}`, 409);
      }
      await exitMaintenance(pool);
    }
    await pruneDeadWorkers(pool).catch(() => undefined);
    const startedAt = await enterMaintenance(pool, 'restore');
    if (!startedAt) throw new RestoreError('MatchExec is already in maintenance mode.', 409);
    maintenanceOn = true;
    setLocalState('maintenance');
    options.beforeQuiesce?.();
    const quiesced = await waitForQuiesce(pool, { startedAt, timeoutMs: options.quiesceTimeoutMs, pollMs: options.quiescePollMs });
    if (!quiesced.ok) {
      throw new RestoreError(
        `The restore was cancelled because these processes did not finish their current work in time: ${quiesced.pending.join(', ')}. Nothing was changed; try again in a minute.`,
        409,
      );
    }
    await setMaintenanceState(pool, 'restoring');
    setLocalState('restoring');

    // 3. Pre-restore dump (a failure here aborts: we never replace data we could not save).
    progress('pre-restore');
    let pre;
    try {
      pre = await createBackup('pre-restore', { databaseUrl });
    } catch (e) {
      throw new RestoreError(`Could not back up the current data before restoring, so nothing was changed: ${(e as Error).message}`, 500, { cause: e });
    }
    log(`pre-restore backup: ${pre.path}`);

    // 4. Restore.
    const ctx: SwapContext = { lock, pool, databaseUrl, migrationsFolder, log, progress };
    try {
      if (options.format === 'pgdump') await swapRestore(ctx, options.file, hasPublicSchema);
      else await sqliteRestore(ctx, options.file, pre.path);
    } catch (e) {
      if (e instanceof RestoreError) {
        rollbackFailed = e.rollbackFailed;
        throw e;
      }
      throw new RestoreError(`Restore failed: ${(e as Error).message}. Your previous data was kept (a copy is in ${pre.filename}).`, 500, { cause: e });
    }
    pruneNewest('pre-restore');
    return { format: options.format, preRestoreBackup: pre.filename, durationMs: Date.now() - started };
  } finally {
    // 5. Resume (unless the rollback failed: that state needs an administrator).
    if (maintenanceOn && !rollbackFailed) {
      progress('resume');
      await exitMaintenance(pool).catch((e) => log(`could not clear maintenance: ${(e as Error).message}`));
      setLocalState('normal');
    }
    await lock.query('SELECT pg_advisory_unlock($1::bigint)', [RESTORE_LOCK_ID]).catch(() => undefined);
    lock.release();
  }
}
