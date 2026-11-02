/**
 * Plan 5.6: clean import of a rich v0.8.2 database. Runs on PGlite and (with TEST_DATABASE_URL) real Postgres.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { count, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { filesStartingWith, makeLegacyHome, runHomeImport, useLegacyHomes } from '../../utils/import-harness';
import * as s from '../../../lib/db/schema';
import { getSystemStatus } from '../../../lib/db/system-status';
import { getSeriesStandings } from '../../../src/lib/series/standings';
import { getCumulativeStandings } from '../../../src/lib/tournaments/standings';
import { determineMatchWinner } from '../../../src/lib/matches/scoreboard';

setupPgTestFile();
useLegacyHomes();

const sha = (f: string): string => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

describe('SQLite -> Postgres import: clean v0.8.2 database', () => {
  it('imports every table, keeps ids and converts types', async () => {
    const home = makeLegacyHome({ uploads: true });
    const originalHash = sha(home.dbPath);
    const { report, renamedTo } = await runHomeImport(home);
    const db = getPgTestDb();

    // report: nothing lost, nothing repaired except the documented known orphan (deletion queue row of a deleted match is NOT an orphan: no FK)
    expect(report.issues).toEqual([]);
    expect(report.repairs.filter((r) => !r.known)).toEqual([]);
    expect(report.tables.matches).toEqual({ source: 12 + 0, imported: 12, skipped: 0 } satisfies typeof report.tables.matches);
    expect(Object.keys(report.tables)).toHaveLength(58);
    for (const [name, t] of Object.entries(report.tables)) expect(t.skipped, name).toBe(0);

    // primary keys preserved, rows present
    const [match] = await db.select().from(s.matches).where(eq(s.matches.id, home.scenario.matches.normal));
    expect(match.winner_team).toBe('team_normal_blue');
    expect(match.map_codes).toEqual({ m1: 'ABC123' });
    expect(match.maps).toEqual(['m1', 'm2', 'm1']);
    expect(match.announcements).toEqual([{ id: 'a1', value: 1, unit: 'hours' }]);
    // booleans (0/1 -> boolean) and naive timestamps read as UTC
    expect(match.player_notifications).toBe(true);
    expect(match.stats_enabled).toBe(false);
    expect(match.created_at.toISOString()).toBe('2026-03-01T18:00:00.000Z');
    expect(match.start_time.toISOString()).toBe('2026-03-02T18:00:00.000Z');

    // announcements stored as plain 1 / 0 (misdeclared BOOLEAN column)
    const [boolAnn] = await db.select({ a: s.matches.announcements }).from(s.matches).where(eq(s.matches.id, home.scenario.matches.withBoolAnnouncements));
    expect(boolAnn.a).toEqual([{ id: 'default_1hour', value: 1, unit: 'hours' }, { id: 'default_30min', value: 30, unit: 'minutes' }]);
    const [noAnn] = await db.select({ a: s.matches.announcements }).from(s.matches).where(eq(s.matches.id, home.scenario.matches.withoutAnnouncements));
    expect(noAnn.a).toBeNull();
    const [tour] = await db.select({ a: s.tournaments.announcements }).from(s.tournaments).where(eq(s.tournaments.id, home.scenario.tournaments.bracket));
    expect(tour.a).toEqual([{ id: 'x', value: 30, unit: 'minutes' }]);

    // jsonb columns, enum text, nullable passthrough
    const [mode] = await db.select().from(s.gameModes).where(eq(s.gameModes.id, 'race'));
    expect(mode.setup_components).toEqual(['qualifying', 'grid_order']);
    const [game] = await db.select().from(s.games).where(eq(s.games.id, 'testgame'));
    expect(game.scoring_config).toEqual({ type: 'Position', pointsPerPosition: { 1: 25, 2: 18, 3: 15, 4: 12 } });
    expect(game.map_codes_supported).toBe(true);

    // retired legacy columns are not columns any more; legacy voice channels live on match_teams
    const teams = await db.select().from(s.matchTeams).where(eq(s.matchTeams.match_id, home.scenario.matches.normal));
    expect(teams.find((t) => t.team_order === 0)?.voice_channel_id).toBe('vc_blue');
    expect(teams.find((t) => t.is_reserve)?.team_order).toBe(99);

    // renamed queue columns + new worker columns
    const [done] = await db.select().from(s.discordAnnouncementQueue).where(eq(s.discordAnnouncementQueue.id, 'q_ann_1'));
    expect(done).toMatchObject({ status: 'completed', attempts: 0, max_attempts: 5, claimed_at: null, external_message_id: null });
    const [failed] = await db.select().from(s.discordAnnouncementQueue).where(eq(s.discordAnnouncementQueue.id, 'q_ann_2'));
    expect(failed).toMatchObject({ status: 'failed', attempts: 3, last_error: 'boom' });
    // a row that was mid-flight when the old app stopped gets a claim time so the abandoned-claim reset can recover it
    const [processing] = await db.select().from(s.discordAnnouncementQueue).where(eq(s.discordAnnouncementQueue.id, 'q_ann_3'));
    expect(processing.status).toBe('processing');
    expect(processing.claimed_at).toBeInstanceOf(Date);
    const [bot] = await db.select().from(s.discordBotRequests).where(eq(s.discordBotRequests.id, 'q_req_1'));
    expect(bot.result).toEqual({ ok: true });

    // singleton / system rows
    expect((await getSystemStatus(db))?.imported_from_sqlite).toBe(true);
    const [stats] = await db.select().from(s.statsSettings);
    expect(stats.id).toBe(1);
    expect(stats.ai_providers_config).toEqual([{ provider: 'anthropic' }]);

    // identity sequences continue after the largest imported id
    const [maxRow] = await db.select({ m: sql<number>`max(${s.discordSettings.id})`.mapWith(Number) }).from(s.discordSettings);
    const [inserted] = await db.insert(s.discordSettings).values({ guild_id: 'guild2', bot_token: 't' }).returning();
    expect(inserted.id).toBeGreaterThan(maxRow.m);

    // uploads copied into blobs keeping the URL path, with owner + kind
    const blobRows = await db.select().from(s.blobs).orderBy(s.blobs.path);
    expect(blobRows.map((b) => b.path)).toEqual(['/uploads/events/event1.png', '/uploads/scorecards/match_normal/blue.png', '/uploads/stats/match_normal/team.png']);
    expect(blobRows.map((b) => [b.kind, b.owner_type, b.owner_id])).toEqual([['event-image', null, null], ['scorecard', 'match', 'match_normal'], ['stat-image', 'match', 'match_normal']]);
    expect(blobRows[0]).toMatchObject({ content_type: 'image/png', size: 67 });
    expect(report.blobs.imported).toBe(3);

    // verification ran on real content
    expect(report.verification).toMatchObject({ seriesChecked: 1, tournamentsChecked: 2 });
    expect(report.verification!.matchesChecked).toBeGreaterThanOrEqual(7);

    // finish: legacy file renamed (never deleted), pristine safety copy kept
    expect(fs.existsSync(home.dbPath)).toBe(false);
    expect(renamedTo).toMatch(/matchexec\.db\.migrated-\d{8}-\d{6}$/);
    expect(fs.existsSync(renamedTo!)).toBe(true);
    expect(sha(renamedTo!)).toBe(originalHash);
    const copies = filesStartingWith(home.backupDir, 'pre-postgres-');
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatch(/^pre-postgres-\d{8}-\d{6}\.db$/);
    expect(sha(path.join(home.backupDir, copies[0]))).toBe(originalHash);
  });

  it('produces the standings and winners the old app computed', async () => {
    const home = makeLegacyHome();
    await runHomeImport(home);
    const db = getPgTestDb();
    // Normal match: blue won 2-1; bracket final won by team D; Position match won by participant u2 (25 + 25... see fixture)
    expect(await determineMatchWinner(db, home.scenario.matches.normal)).toBe('team_normal_blue');
    expect(await determineMatchWinner(db, 'bm_f')).toBe('tt_tD');
    expect(await determineMatchWinner(db, home.scenario.matches.ffa)).toBe('p_ffa_u1');
    const board = await getCumulativeStandings(db, home.scenario.tournaments.cumulative);
    expect(board.map((r) => [r.player_key, r.total_points, r.rank])).toEqual([['cu1', 26, 1], ['cu2', 19, 2], ['cu3', 12, 3]]);
    const standings = await getSeriesStandings(db, home.scenario.series);
    expect(standings.length).toBeGreaterThan(5);
    expect(standings[0].rank).toBe(1);
    // every event contributes
    expect(new Set(standings.flatMap((r) => r.events.filter((e) => e.points !== null).map((e) => e.series_event_id)))).toEqual(new Set(home.scenario.seriesEvents));
  });

  it('stores the report and clears the importing state', async () => {
    const home = makeLegacyHome();
    await runHomeImport(home);
    const status = await getSystemStatus(getPgTestDb());
    expect(status?.phase).toBe('importing'); // the migrator moves on to seeding / ready afterwards
    const stored = status?.report as { tables: Record<string, unknown>; source: string; lossy: boolean };
    expect(stored.lossy).toBe(false);
    expect(Object.keys(stored.tables)).toHaveLength(58);
    const [{ n }] = await getPgTestDb().select({ n: count() }).from(s.matches);
    expect(n).toBe(12);
  });
});
