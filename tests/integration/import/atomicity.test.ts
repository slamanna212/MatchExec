/**
 * Plan 5.2 / 5.5 / 5.6: one transaction, retry after a crash, crash after commit before the rename, and a verification
 * mismatch rolling everything back.
 */
import fs from 'node:fs';
import { count, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { filesStartingWith, makeLegacyHome, runHomeImport, useLegacyHomes } from '../../utils/import-harness';
import * as s from '../../../lib/db/schema';
import { getSystemStatus } from '../../../lib/db/system-status';
import { runLegacyImport, VerificationError } from '../../../lib/import-sqlite';

setupPgTestFile();
useLegacyHomes();

async function rowCount(table: Parameters<ReturnType<typeof getPgTestDb>['select']>[0] extends never ? never : typeof s.matches | typeof s.games | typeof s.blobs | typeof s.seriesEvents): Promise<number> {
  const [{ n }] = await getPgTestDb().select({ n: count() }).from(table);
  return n;
}

describe('atomicity', () => {
  it('a crash in the middle of the import rolls everything back and a retry is clean', async () => {
    const home = makeLegacyHome({ uploads: true });
    const before = fs.readFileSync(home.dbPath);
    const crash = new Error('simulated crash after matches');

    await expect(runHomeImport(home, {
      hooks: { afterTable: (table) => { if (table === 'matches') throw crash; } },
    })).rejects.toBe(crash);

    // nothing leaked out of the transaction: no rows, no blobs, no marker, original file untouched
    expect(await rowCount(s.matches)).toBe(0);
    expect(await rowCount(s.games)).toBe(0);
    expect(await rowCount(s.blobs)).toBe(0);
    const status = await getSystemStatus(getPgTestDb());
    expect(status?.imported_from_sqlite).toBe(false);
    expect(status?.phase).toBe('error');
    expect(fs.readFileSync(home.dbPath).equals(before)).toBe(true);

    // retry without the fault: complete and identical to a first-time import
    const { report } = await runHomeImport(home);
    expect(report.issues).toEqual([]);
    expect(await rowCount(s.matches)).toBe(12);
    expect(await rowCount(s.blobs)).toBe(3);
    expect(fs.existsSync(home.dbPath)).toBe(false);
    expect((await getSystemStatus(getPgTestDb()))?.imported_from_sqlite).toBe(true);
    // every attempt keeps its own pristine safety copy
    expect(filesStartingWith(home.backupDir, 'pre-postgres-')).toHaveLength(2);
  });

  it('a failing insert (database rejects a row) rolls back and reports table and row', async () => {
    const home = makeLegacyHome();
    // a type the preflight cannot know about: the target table already holds a conflicting row outside the import tables' truncate scope
    await getPgTestDb().execute(sql`ALTER TABLE series_events ADD CONSTRAINT zz_test_no_events CHECK (false) NOT VALID`);
    try {
      await expect(runHomeImport(home)).rejects.toThrow(/Inserting into series_events failed/);
    } finally {
      await getPgTestDb().execute(sql`ALTER TABLE series_events DROP CONSTRAINT zz_test_no_events`);
    }
    expect(await rowCount(s.matches)).toBe(0);
    expect(fs.existsSync(home.dbPath)).toBe(true);
  });

  it('a crash after COMMIT but before the rename keeps the data and the next start only finishes the rename', async () => {
    const home = makeLegacyHome({ uploads: true });
    const crash = new Error('simulated crash after commit');
    await expect(runHomeImport(home, { hooks: { afterCommit: () => { throw crash; } } })).rejects.toBe(crash);

    // committed: data and marker are there, the legacy file is still in place and no error state was recorded
    expect(await rowCount(s.matches)).toBe(12);
    const status = await getSystemStatus(getPgTestDb());
    expect(status?.imported_from_sqlite).toBe(true);
    expect(status?.phase).not.toBe('error');
    expect(fs.existsSync(home.dbPath)).toBe(true);
    const copiesBefore = filesStartingWith(home.backupDir, 'pre-postgres-');

    // next start: marker set + file present -> rename only, no second import, no second safety copy
    const imported = await runLegacyImport({ db: getPgTestDb() }, { cwd: home.dir, legacyPath: home.dbPath, backupDir: home.backupDir });
    expect(imported).toBe(false);
    expect(fs.existsSync(home.dbPath)).toBe(false);
    expect(filesStartingWith(home.dbPath.replace(/matchexec\.db$/, ''), 'matchexec.db.migrated-')).toHaveLength(1);
    expect(filesStartingWith(home.backupDir, 'pre-postgres-')).toEqual(copiesBefore);
    expect(await rowCount(s.matches)).toBe(12);
    expect(await rowCount(s.blobs)).toBe(3);
  });

  it('a verification mismatch throws and rolls everything back', async () => {
    const home = makeLegacyHome();
    // simulate a bug that corrupts data on its way in: a game result disappears from the target
    const err = await runHomeImport(home, {
      hooks: { beforeVerify: async (tx) => { await tx.delete(s.matchGamePlacements).where(eq(s.matchGamePlacements.match_game_id, 'game_normal_1')); } },
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VerificationError);
    const mismatches = (err as VerificationError).mismatches.join('\n');
    expect(mismatches).toContain('row count match_game_placements');
    expect(mismatches).toContain('match match_normal winner'.slice(0, 11)); // winner / score of the affected match differ too

    expect(await rowCount(s.matches)).toBe(0);
    expect(await rowCount(s.seriesEvents)).toBe(0);
    expect(fs.existsSync(home.dbPath)).toBe(true);
    const status = await getSystemStatus(getPgTestDb());
    expect(status?.imported_from_sqlite).toBe(false);
    expect(status?.phase).toBe('error');
    expect((status?.report as { error: string }).error).toContain('verification failed');
  });

  it('catches a wrong series standing (changed points) before commit', async () => {
    const home = makeLegacyHome();
    const err = await runHomeImport(home, {
      hooks: { beforeVerify: async (tx) => { await tx.update(s.seriesEvents).set({ points_multiplier: 99 }).where(eq(s.seriesEvents.id, 'se2')); } },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerificationError);
    expect((err as VerificationError).mismatches.some((m) => m.startsWith('series series_main'))).toBe(true);
    expect(await rowCount(s.matches)).toBe(0);
  });

  it('catches a changed tournament leaderboard before commit', async () => {
    const home = makeLegacyHome();
    const err = await runHomeImport(home, {
      hooks: { beforeVerify: async (tx) => { await tx.update(s.matchGamePlacements).set({ points_awarded: 1 }).where(eq(s.matchGamePlacements.id, 'pl_cm_c1_g1_cm_c1_p1')); } },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VerificationError);
    expect((err as VerificationError).mismatches.some((m) => m.includes('tournament tournament_cumulative leaderboard'))).toBe(true);
  });
});
