/** Plan 5.1: when the importer runs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { count } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { getPgTestDb, isRealPostgres, setupPgTestFile } from '../../utils/pg-test-db';
import { makeLegacyHome, useLegacyHomes } from '../../utils/import-harness';
import { createMatch, createGame, createGameMode } from '../../utils/pg-fixtures';
import * as s from '../../../lib/db/schema';
import { migrationHooks } from '../../../lib/db/migrate';
import { findLegacyFile, installLegacyImportHook, resolveBackupDir, runLegacyImport } from '../../../lib/import-sqlite';

setupPgTestFile();
useLegacyHomes();

/** PGlite is one connection: live progress would wait for the import transaction forever. */
const statusDb = (): ReturnType<typeof getPgTestDb> | null => (isRealPostgres() ? getPgTestDb() : null);

const tmpDirs: string[] = [];
afterEach(() => { while (tmpDirs.length > 0) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true }); });
const tmp = (): string => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-detect-')); tmpDirs.push(d); return d; };

describe('findLegacyFile / resolveBackupDir', () => {
  it('prefers $DATABASE_PATH, then ./app_data/data/matchexec.db relative to the app root', () => {
    const root = tmp();
    fs.mkdirSync(path.join(root, 'app_data', 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app_data', 'data', 'matchexec.db'), 'x');
    const custom = path.join(root, 'custom.db');
    fs.writeFileSync(custom, 'x');
    expect(findLegacyFile({ DATABASE_PATH: custom }, root)).toBe(custom);
    expect(findLegacyFile({}, root)).toBe(path.join(root, 'app_data', 'data', 'matchexec.db'));
    expect(findLegacyFile({ DATABASE_PATH: path.join(root, 'missing.db') }, root)).toBe(path.join(root, 'app_data', 'data', 'matchexec.db'));
    expect(findLegacyFile({}, tmp())).toBeNull();
  });

  it('uses MATCHEXEC_BACKUP_DIR, ./app_data/backups in development, otherwise the Docker path or a sibling of the data dir', () => {
    expect(resolveBackupDir('/x/y.db', { MATCHEXEC_BACKUP_DIR: '/custom/backups' }, '/cwd')).toBe('/custom/backups');
    expect(resolveBackupDir('/x/y.db', { NODE_ENV: 'development' }, '/cwd')).toBe('/cwd/app_data/backups');
    const resolved = resolveBackupDir('/srv/mx/app_data/data/matchexec.db', {}, '/cwd');
    expect(resolved === '/app/app_data/backups' || resolved === '/srv/mx/app_data/backups').toBe(true);
  });
});

describe('runLegacyImport', () => {
  it('does nothing when there is no legacy file', async () => {
    const home = makeLegacyHome();
    fs.rmSync(home.dbPath);
    expect(await runLegacyImport({ db: getPgTestDb() }, { cwd: home.dir }, { DATABASE_PATH: home.dbPath })).toBe(false);
  });

  it('autodetects the file through $DATABASE_PATH and imports into an empty database', async () => {
    const home = makeLegacyHome();
    const ran = await runLegacyImport({ db: getPgTestDb() }, { cwd: home.dir, uploadsDirs: [home.uploadsDir], statusDb: statusDb() }, { DATABASE_PATH: home.dbPath, MATCHEXEC_BACKUP_DIR: home.backupDir });
    expect(ran).toBe(true);
    const [{ n }] = await getPgTestDb().select({ n: count() }).from(s.matches);
    expect(n).toBe(12);
    expect(fs.existsSync(home.dbPath)).toBe(false);
  });

  it('honours MATCHEXEC_IMPORT_ALLOW_LOSSY', async () => {
    const home = makeLegacyHome({ corrupt: ['malformedJson'] });
    const env = { DATABASE_PATH: home.dbPath, MATCHEXEC_BACKUP_DIR: home.backupDir };
    await expect(runLegacyImport({ db: getPgTestDb() }, { cwd: home.dir, uploadsDirs: [], statusDb: statusDb() }, env)).rejects.toThrow(/cannot be imported as-is/);
    expect(await runLegacyImport({ db: getPgTestDb() }, { cwd: home.dir, uploadsDirs: [], statusDb: statusDb() }, { ...env, MATCHEXEC_IMPORT_ALLOW_LOSSY: 'true' })).toBe(true);
  });

  it('refuses to import into a database that already has data (file left alone)', async () => {
    const home = makeLegacyHome();
    const game = await createGame();
    const mode = await createGameMode(game.id);
    await createMatch(game.id, mode.id);
    const env = { DATABASE_PATH: home.dbPath, MATCHEXEC_BACKUP_DIR: home.backupDir };
    expect(await runLegacyImport({ db: getPgTestDb() }, { cwd: home.dir }, env)).toBe(false);
    expect(fs.existsSync(home.dbPath)).toBe(true);
    // the CLI treats it as an error
    await expect(runLegacyImport({ db: getPgTestDb() }, { cwd: home.dir, requireImport: true }, env)).rejects.toThrow(/already contains data \(matches\)/);
    expect(fs.existsSync(path.join(home.backupDir))).toBe(false);
  });

  it('replaces seeded reference data (games, modes, maps) instead of conflicting with it', async () => {
    const home = makeLegacyHome();
    // a fresh install seeds the 10 bundled games before anybody runs the importer
    await getPgTestDb().insert(s.games).values({ id: 'testgame', name: 'Seeded copy of the same id' });
    await getPgTestDb().insert(s.games).values({ id: 'other', name: 'Seeded only' });
    const ran = await runLegacyImport({ db: getPgTestDb() }, { cwd: home.dir, uploadsDirs: [], statusDb: statusDb() }, { DATABASE_PATH: home.dbPath, MATCHEXEC_BACKUP_DIR: home.backupDir });
    expect(ran).toBe(true);
    const rows = await getPgTestDb().select({ id: s.games.id, name: s.games.name }).from(s.games);
    expect(rows).toEqual([{ id: 'testgame', name: 'Test Game' }]);
  });

  it('installLegacyImportHook plugs the importer into the migrate hooks', async () => {
    const home = makeLegacyHome();
    const original = migrationHooks.importLegacySqlite;
    try {
      installLegacyImportHook({ legacyPath: home.dbPath, backupDir: home.backupDir, uploadsDirs: [], statusDb: statusDb() });
      expect(migrationHooks.importLegacySqlite).not.toBe(original);
      // the hook is what runMigrations() calls between migrating and seeding
      expect(await migrationHooks.importLegacySqlite({ db: getPgTestDb(), pool: undefined as never })).toBe(true);
      const [{ n }] = await getPgTestDb().select({ n: count() }).from(s.matches);
      expect(n).toBe(12);
    } finally {
      migrationHooks.importLegacySqlite = original;
    }
  });
});
