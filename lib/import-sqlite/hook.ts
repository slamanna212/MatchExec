/**
 * Plan 5.1: decides whether the migrate service imports a legacy SQLite database and wires the importer into
 * `migrationHooks.importLegacySqlite` (installed by lib/db/migrate-cli.ts and the import CLI only, so the web bundle does not
 * carry the importer).
 */
import type { Pool } from 'pg';
import type { Db, Executor } from '../db';
import { migrationHooks } from '../db/migrate';
import { coreTablesEmpty, findLegacyFile, resolveBackupDir } from './detect';
import { finishRename, isImportMarked, runImport } from './run';
import { defaultUploadDirs } from './uploads';

export interface LegacyImportConfig {
  /** App root used by the autodetection (default: process.cwd()). */
  cwd?: string;
  /** Explicit legacy file (CLI `--from`); default: autodetect. */
  legacyPath?: string;
  backupDir?: string;
  uploadsDirs?: string[];
  allowLossy?: boolean;
  /** CLI: a non-empty target database is an error instead of "nothing to do". */
  requireImport?: boolean;
  skipRename?: boolean;
  /** Executor for live progress rows (default: the same Drizzle instance, i.e. another pool connection). `null` disables live progress (single-connection PGlite). */
  statusDb?: Executor | null;
}

const log = (m: string): void => { if (!process.env.VITEST) console.log(`[import-sqlite] ${m}`); };

export async function runLegacyImport(ctx: { db: Db; pool?: Pool }, config: LegacyImportConfig = {}, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const legacyPath = config.legacyPath ?? findLegacyFile(env, config.cwd);
  if (!legacyPath) return false;

  // Crash after commit, before the rename: the data is in Postgres, only the file move is missing.
  if (await isImportMarked(ctx.db)) {
    log(`${legacyPath} was already imported; finishing the rename`);
    if (!config.skipRename) finishRename(legacyPath, new Date(), log);
    return false;
  }
  const core = await coreTablesEmpty(ctx.db);
  if (!core.empty) {
    const msg = `Found ${legacyPath} but the Postgres database already contains data (${core.nonEmpty.join(', ')}); not importing.`;
    if (config.requireImport) throw new Error(`${msg} Use an empty database.`);
    log(`WARNING: ${msg}`);
    return false;
  }
  await runImport({
    db: ctx.db,
    legacyPath,
    backupDir: config.backupDir ?? resolveBackupDir(legacyPath, env, config.cwd),
    uploadsDirs: config.uploadsDirs ?? defaultUploadDirs(env, legacyPath),
    allowLossy: config.allowLossy ?? env.MATCHEXEC_IMPORT_ALLOW_LOSSY === 'true',
    statusDb: config.statusDb === undefined ? ctx.db : config.statusDb,
    skipRename: config.skipRename,
  });
  return true;
}

export function installLegacyImportHook(config: LegacyImportConfig = {}): void {
  migrationHooks.importLegacySqlite = (ctx) => runLegacyImport(ctx, config);
}
