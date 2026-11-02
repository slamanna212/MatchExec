/**
 * Plan 5.3 step 2 / 5.6: a v0.7-era database (schema of migration 009: legacy scoring columns only, no match_teams /
 * placements / series) is brought to the v0.8.2 schema on a COPY (the legacy migrations backfill the new tables) and imported.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { filesStartingWith, makeLegacyHome, runHomeImport, useLegacyHomes } from '../../utils/import-harness';
import * as s from '../../../lib/db/schema';
import { determineMatchWinner, getOverallMatchScore, getParticipantPointTotals } from '../../../src/lib/matches/scoreboard';

setupPgTestFile();
useLegacyHomes();

describe('v0.7 database', () => {
  it('is brought up to date on a copy and imported with correct results', async () => {
    const home = makeLegacyHome({ level: 'v0.7' });
    const hash = crypto.createHash('sha256').update(fs.readFileSync(home.dbPath)).digest('hex');

    // the fixture really is the old schema
    const old = new DatabaseSync(home.dbPath, { readOnly: true });
    const tables = (old.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((t) => t.name);
    old.close();
    expect(tables).not.toContain('match_teams');
    expect(tables).not.toContain('series');

    const { report, renamedTo } = await runHomeImport(home);
    const db = getPgTestDb();

    expect(report.legacyMigrationsApplied[0]).toBe('010_map_tournament_enabled.sql');
    expect(report.legacyMigrationsApplied).toContain('021_backfill_match_teams.sql');
    expect(report.legacyMigrationsApplied).toContain('028_name_backfilled_tournament_teams.sql');
    expect(report.legacyMigrationsApplied).not.toContain('009_update071.sql');
    expect(report.issues).toEqual([]);

    // the backfill created teams and placements from the legacy columns, and the winners come out right
    const sc = home.scenario;
    expect(await determineMatchWinner(db, sc.matches.normal)).toBe(`mt_blue_${sc.matches.normal}`);
    const score = await getOverallMatchScore(db, sc.matches.normal);
    expect([score.team1Wins, score.team2Wins, score.totalNormalGames]).toEqual([2, 1, 3]);
    const ffaWinner = await determineMatchWinner(db, sc.matches.ffa);
    expect(ffaWinner).toBe('p_ffa_u1');
    const totals = await getParticipantPointTotals(db, sc.matches.position);
    expect(totals.map((t) => [t.entity_id, t.total_pts])).toEqual([['p_pos_u1', 43], ['p_pos_u2', 43], ['p_pos_u3', 30], ['p_pos_u4', 24]].map(([a, b]) => [a, b]));
    // participants got their team through the backfill
    const [p] = await db.select().from(s.matchParticipants).where(eq(s.matchParticipants.id, 'p_normal_u1'));
    expect(p.team_id).toBe(`mt_blue_${sc.matches.normal}`);
    // tournament bracket: final won by team D
    expect(await determineMatchWinner(db, 'bm_f')).toBe('tt_tD');

    // the legacy file keeps the OLD schema (the copy was migrated, not the original), and is renamed intact
    expect(crypto.createHash('sha256').update(fs.readFileSync(renamedTo!)).digest('hex')).toBe(hash);
    const copy = path.join(home.backupDir, filesStartingWith(home.backupDir, 'pre-postgres-')[0]);
    const check = new DatabaseSync(copy, { readOnly: true });
    expect((check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='match_teams'").all())).toHaveLength(0);
    check.close();
  });

  it('survives a database that has no migrations table at all (very old installs)', async () => {
    const home = makeLegacyHome({ level: 'v0.7' });
    const old = new DatabaseSync(home.dbPath);
    old.exec('DROP TABLE migrations');
    old.close();
    // all migrations run again on top of an already-migrated schema: this must fail loudly, not corrupt anything
    await expect(runHomeImport(home)).rejects.toThrow(/Legacy SQLite migration .* failed while bringing the old database up to date/);
    expect(fs.existsSync(home.dbPath)).toBe(true);
  });
});
