/** Shared setup for the importer tests: a temp "app root" holding matchexec.db, backups/ and public/uploads/. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach } from 'vitest';
import { getPgTestDb, isRealPostgres } from './pg-test-db';
import { buildScenario, corruptions, createLegacyDb, writeUploads, type LegacyLevel, type Scenario } from './legacy-sqlite';
import { runImport, type RunImportOptions, type RunImportResult } from '../../lib/import-sqlite';

export interface LegacyHome {
  dir: string;
  dbPath: string;
  backupDir: string;
  uploadsDir: string;
  scenario: Scenario;
  db: DatabaseSync;
}

const homes: LegacyHome[] = [];
const closeAll = (): void => {
  while (homes.length > 0) {
    const h = homes.pop()!;
    try { h.db.close(); } catch { /* closed */ }
    fs.rmSync(h.dir, { recursive: true, force: true });
  }
};

/** Call once per test file: removes the temp directories after each test. */
export function useLegacyHomes(): void {
  afterEach(closeAll);
}

export interface HomeOptions {
  level?: LegacyLevel;
  uploads?: boolean;
  corrupt?: Array<keyof typeof corruptions>;
}

/** Build a legacy database (+ uploads) in a fresh temp directory. The SQLite handle is closed before the importer reads it. */
export function makeLegacyHome(options: HomeOptions = {}): LegacyHome {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-import-test-'));
  const dbPath = path.join(dir, 'app_data', 'data', 'matchexec.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = createLegacyDb(dbPath, options.level ?? 'v0.8.2');
  const scenario = buildScenario(db, options.level ?? 'v0.8.2');
  for (const c of options.corrupt ?? []) corruptions[c](db);
  const uploadsDir = path.join(dir, 'public', 'uploads');
  if (options.uploads) scenario.uploads = writeUploads(uploadsDir);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  const home: LegacyHome = { dir, dbPath, backupDir: path.join(dir, 'app_data', 'backups'), uploadsDir, scenario, db };
  homes.push(home);
  return home;
}

export function importOptions(home: LegacyHome, extra: Partial<RunImportOptions> = {}): RunImportOptions {
  const db = getPgTestDb();
  return {
    db,
    legacyPath: home.dbPath,
    backupDir: home.backupDir,
    uploadsDirs: [home.uploadsDir],
    // PGlite is a single connection: a second writer would wait for the import transaction forever
    statusDb: isRealPostgres() ? db : null,
    log: () => undefined,
    ...extra,
  };
}

export function runHomeImport(home: LegacyHome, extra: Partial<RunImportOptions> = {}): Promise<RunImportResult> {
  return runImport(importOptions(home, extra));
}

/** Files directly in `dir` whose name starts with `prefix`. */
export function filesStartingWith(dir: string, prefix: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).sort() : [];
}
