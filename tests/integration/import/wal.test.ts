/** Plan 5.3 step 1: the safety copy includes -wal / -shm, so committed-but-uncheckpointed data (a container stopped without a clean close) is not lost. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { count } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { importOptions, filesStartingWith } from '../../utils/import-harness';
import { buildScenario, createLegacyDb } from '../../utils/legacy-sqlite';
import * as s from '../../../lib/db/schema';
import { runImport } from '../../../lib/import-sqlite';

setupPgTestFile();

const dirs: string[] = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe('WAL mode database', () => {
  it('imports data that only exists in the -wal file and renames all three files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-wal-'));
    dirs.push(root);
    const live = path.join(root, 'live.db');
    const db = createLegacyDb(live, 'v0.8.2');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA wal_autocheckpoint = 0');
    buildScenario(db);
    expect(fs.statSync(`${live}-wal`).size).toBeGreaterThan(0);

    // what a crashed / hard-stopped container leaves behind: the main file, the wal and the shm, copied while the writer is "running"
    const dataDir = path.join(root, 'app_data', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const target = path.join(dataDir, 'matchexec.db');
    for (const suffix of ['', '-wal', '-shm']) fs.copyFileSync(live + suffix, target + suffix);
    db.close();

    const home = { dir: root, dbPath: target, backupDir: path.join(root, 'app_data', 'backups'), uploadsDir: path.join(root, 'none'), scenario: undefined as never, db };
    const { report, renamedTo } = await runImport(importOptions(home));
    expect(report.issues).toEqual([]);
    const [{ n }] = await getPgTestDb().select({ n: count() }).from(s.matches);
    expect(n).toBe(12);

    // safety copy has the wal next to it; the original trio was renamed together
    expect(filesStartingWith(home.backupDir, 'pre-postgres-').some((f) => f.endsWith('.db-wal'))).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(`${target}-wal`)).toBe(false);
    expect(fs.existsSync(`${renamedTo}-wal`)).toBe(true);
    expect(fs.existsSync(`${renamedTo}-shm`)).toBe(true);
  });
});
