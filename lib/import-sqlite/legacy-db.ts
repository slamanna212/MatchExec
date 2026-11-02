/**
 * Everything that touches the legacy SQLite file, through the built-in `node:sqlite` only (no native module).
 *
 * NOTE: node:sqlite enables foreign key enforcement by default, the old `sqlite3`-based app never did. Every connection
 * here turns it OFF, otherwise the legacy migrations (and the data, which was never FK-clean) fail.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LegacyDatabaseError } from './types';
import type { SrcRow } from './mapping';

export const WAL_SUFFIXES = ['-wal', '-shm'] as const;

export function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function isSqliteFile(file: string): boolean {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(16);
      fs.readSync(fd, buf, 0, 16, 0);
      return buf.toString('latin1') === 'SQLite format 3\0';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/**
 * Plan 5.3 step 1: byte copy of the .db (plus -wal / -shm) into the backups directory as `pre-postgres-<date>.db`.
 * The original is only read, never opened by SQLite, so nothing can change it. Returns the path of the pristine copy.
 */
export function makeSafetyCopy(legacyPath: string, backupDir: string, now: Date): string {
  if (!fs.existsSync(legacyPath)) throw new LegacyDatabaseError(`Legacy database not found: ${legacyPath}`);
  if (!isSqliteFile(legacyPath)) throw new LegacyDatabaseError(`${legacyPath} is not a SQLite database file`);
  fs.mkdirSync(backupDir, { recursive: true });
  let target = path.join(backupDir, `pre-postgres-${stamp(now)}.db`);
  for (let i = 2; fs.existsSync(target); i++) target = path.join(backupDir, `pre-postgres-${stamp(now)}-${i}.db`);
  fs.copyFileSync(legacyPath, target);
  for (const suffix of WAL_SUFFIXES) {
    if (fs.existsSync(legacyPath + suffix)) fs.copyFileSync(legacyPath + suffix, target + suffix);
  }
  return target;
}

export interface WorkingCopy {
  db: DatabaseSync;
  path: string;
  close(): void;
}

/**
 * The importer never writes to the safety copy (it is the rollback artifact for v0.8.x): it works on a second copy in a
 * temp directory, which is where legacy migrations are applied and from which every table is read.
 */
export function openWorkingCopy(safetyCopy: string): WorkingCopy {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matchexec-import-'));
  const work = path.join(dir, 'legacy.db');
  fs.copyFileSync(safetyCopy, work);
  for (const suffix of WAL_SUFFIXES) {
    // -shm is rebuilt by SQLite; copying the -wal makes sure committed-but-uncheckpointed pages are not lost
    if (suffix === '-wal' && fs.existsSync(safetyCopy + suffix)) fs.copyFileSync(safetyCopy + suffix, work + suffix);
  }
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(work, { enableForeignKeyConstraints: false });
    db.exec('PRAGMA busy_timeout = 5000');
    const check = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
    if (check.length !== 1 || check[0].integrity_check !== 'ok') {
      throw new LegacyDatabaseError(`The legacy database failed SQLite's integrity check: ${check.map((c) => c.integrity_check).slice(0, 5).join('; ')}. Restore a good backup or repair the file (sqlite3 .recover) before importing.`);
    }
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    if (e instanceof LegacyDatabaseError) throw e;
    throw new LegacyDatabaseError(`Cannot open the legacy database: ${(e as Error).message}`, { cause: e });
  }
  return {
    db,
    path: work,
    close() {
      try { db.close(); } catch { /* already closed */ }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function resolveLegacyMigrationsDir(env: Record<string, string | undefined> = process.env): string {
  const candidates = [env.MATCHEXEC_LEGACY_MIGRATIONS_DIR, path.join(process.cwd(), 'migrations', 'legacy-sqlite'), '/app/migrations/legacy-sqlite'];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  throw new LegacyDatabaseError(`Legacy SQLite migrations not found (looked in ${candidates.filter(Boolean).join(', ')}); set MATCHEXEC_LEGACY_MIGRATIONS_DIR`);
}

function hasTable(db: DatabaseSync, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

/**
 * Plan 5.3 step 2: apply pending `migrations/legacy-sqlite/*.sql` to the working copy, tracking them in the same
 * `migrations(filename)` table the old Umzug storage used (one row per executed file, name = file name), so a v0.7 database
 * is brought to the v0.8.2 schema (019+ create match_teams / placements and backfill them). Returns the applied names.
 */
export function applyPendingLegacyMigrations(db: DatabaseSync, dir = resolveLegacyMigrationsDir()): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  const done = new Set((db.prepare('SELECT filename FROM migrations').all() as Array<{ filename: string }>).map((r) => r.filename));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    try {
      db.exec('BEGIN');
      db.exec(sql);
      db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* no transaction */ }
      throw new LegacyDatabaseError(
        `Legacy SQLite migration ${file} failed while bringing the old database up to date: ${(e as Error).message}. ` +
        'Nothing was imported and the original file is untouched.',
        { cause: e },
      );
    }
    applied.push(file);
  }
  return applied;
}

/** All rows of a legacy table (empty when the table does not exist). */
export function readAll(db: DatabaseSync, table: string): SrcRow[] {
  if (!hasTable(db, table)) return [];
  return db.prepare(`SELECT * FROM "${table}"`).all() as SrcRow[];
}

export function legacyTableNames(db: DatabaseSync): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
}

export function legacyColumnNames(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map((c) => c.name);
}

/** Plan 5.5: rename matchexec.db (and -wal / -shm) to matchexec.db.migrated-<date>. Never deletes. Returns the new main path. */
export function renameMigrated(legacyPath: string, now: Date): string {
  let target = `${legacyPath}.migrated-${stamp(now)}`;
  for (let i = 2; fs.existsSync(target); i++) target = `${legacyPath}.migrated-${stamp(now)}-${i}`;
  fs.renameSync(legacyPath, target);
  for (const suffix of WAL_SUFFIXES) {
    if (fs.existsSync(legacyPath + suffix)) fs.renameSync(legacyPath + suffix, target + suffix);
  }
  return target;
}
