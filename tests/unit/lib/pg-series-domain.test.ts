// @vitest-environment node
/** The series domain module on Postgres: CRUD, events, target checks and standings seeded by hand (no routes). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import { uid } from '../../utils/pg-series-fixtures';
import {
  addSeriesEvent, checkSeriesEventTarget, createSeries, deleteSeries, getSeriesById, getSeriesStandings, listSeries, listSeriesEvents,
  removeSeriesEvent, SeriesError, transitionSeriesStatus, updateSeries, updateSeriesEvent,
} from '@/lib/series';
import type { matches } from '../../../lib/db/schema';
import {
  matchGamePlacements, matchGames, matchParticipants, matchTeams, seriesEvents, tournamentMatches, tournamentTeamMembers,
  tournamentTeams, tournaments,
} from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  gameId = (await createGame()).id;
  modeId = (await createGameMode(gameId)).id;
});

const mk = async (overrides: Partial<typeof matches.$inferInsert> = {}) => (await createMatch(gameId, modeId, { status: 'complete', ...overrides })).id;

describe('createSeries / getSeriesById / listSeries', () => {
  it('creates a series and returns its ID', async () => {
    const id = await createSeries(pg(), { name: 'Spring Championship' });
    expect(id.startsWith('series_')).toBe(true);
  });

  it('is retrievable after creation with status=created', async () => {
    const id = await createSeries(pg(), { name: 'My Series', description: 'Test desc' });
    const s = await getSeriesById(pg(), id);
    expect(s).toMatchObject({ name: 'My Series', description: 'Test desc', status: 'created' });
  });

  it('announcements default to true and respect false', async () => {
    const a = await getSeriesById(pg(), await createSeries(pg(), { name: 'Defaults' }));
    expect(a).toMatchObject({ announcements: true, player_notifications: true });
    const b = await getSeriesById(pg(), await createSeries(pg(), { name: 'Silent', announcements: false, player_notifications: false }));
    expect(b).toMatchObject({ announcements: false, player_notifications: false });
  });

  it('persists scoring_config as jsonb and dates as timestamps', async () => {
    const config = { match_win_points: 10, tournament_position_points: [25, 18, 15] };
    const id = await createSeries(pg(), { name: 'Config', scoring_config: config, start_date: '2026-06-01', end_date: '2026-06-30T12:00:00Z' });
    const s = await getSeriesById(pg(), id);
    expect(s!.scoring_config).toEqual(config);
    expect(s!.start_date).toEqual(new Date('2026-06-01'));
    expect(s!.end_date).toEqual(new Date('2026-06-30T12:00:00Z'));
  });

  it('returns null for a non-existent ID', async () => {
    expect(await getSeriesById(pg(), 'does-not-exist')).toBeNull();
  });

  it('lists all series newest first, optionally filtered by status', async () => {
    const a = await createSeries(pg(), { name: 'A' });
    const b = await createSeries(pg(), { name: 'B' });
    await updateSeries(pg(), b, { status: 'active' });
    expect((await listSeries(pg())).map((s) => s.id).sort()).toEqual([a, b].sort());
    const active = await listSeries(pg(), 'active');
    expect(active.map((s) => s.id)).toEqual([b]);
  });
});

describe('updateSeries / transitionSeriesStatus / deleteSeries', () => {
  it('updates name, description and status', async () => {
    const id = await createSeries(pg(), { name: 'Original' });
    await updateSeries(pg(), id, { name: 'Updated', description: 'New desc' });
    await updateSeries(pg(), id, { status: 'active' });
    expect(await getSeriesById(pg(), id)).toMatchObject({ name: 'Updated', description: 'New desc', status: 'active' });
  });

  it('no-ops when no fields are provided', async () => {
    const id = await createSeries(pg(), { name: 'Stable' });
    const before = await getSeriesById(pg(), id);
    await updateSeries(pg(), id, {});
    expect(await getSeriesById(pg(), id)).toEqual(before);
  });

  it('clears fields when given an explicit null and leaves undefined untouched', async () => {
    const id = await createSeries(pg(), { name: 'N', description: 'desc', livestream_link: 'http://x', scoring_config: { match_win_points: 1 } });
    await updateSeries(pg(), id, { description: null, livestream_link: null, scoring_config: null });
    const s = await getSeriesById(pg(), id);
    expect(s).toMatchObject({ description: null, livestream_link: null, scoring_config: null, name: 'N' });
  });

  it('bumps updated_at on update', async () => {
    const id = await createSeries(pg(), { name: 'T' });
    const before = (await getSeriesById(pg(), id))!.updated_at;
    await new Promise((r) => setTimeout(r, 15));
    await updateSeries(pg(), id, { name: 'T2' });
    expect((await getSeriesById(pg(), id))!.updated_at.getTime()).toBeGreaterThan(before.getTime());
  });

  it('transitionSeriesStatus is a compare-and-set', async () => {
    const id = await createSeries(pg(), { name: 'CAS' });
    expect(await transitionSeriesStatus(pg(), id, 'created', 'active')).toBe(true);
    expect(await transitionSeriesStatus(pg(), id, 'created', 'cancelled')).toBe(false);
    expect((await getSeriesById(pg(), id))!.status).toBe('active');
  });

  it('deleteSeries removes the series and its events', async () => {
    const id = await createSeries(pg(), { name: 'D' });
    await addSeriesEvent(pg(), id, { event_type: 'match', match_id: await mk() });
    expect(await deleteSeries(pg(), id)).toBe(true);
    expect(await pg().select().from(seriesEvents).where(eq(seriesEvents.series_id, id))).toHaveLength(0);
    expect(await getSeriesById(pg(), id)).toBeNull();
    expect(await deleteSeries(pg(), id)).toBe(false);
  });
});

describe('events', () => {
  let seriesId: string;
  let matchId: string;
  beforeEach(async () => {
    seriesId = await createSeries(pg(), { name: 'Event Series' });
    matchId = await mk({ name: 'Event Match' });
  });

  it('adds a match event and returns its ID', async () => {
    const id = await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: matchId });
    expect(id.startsWith('sevt_')).toBe(true);
  });

  it('auto-assigns event_order starting at 1 and counting up', async () => {
    await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: matchId });
    await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: await mk() });
    const events = await listSeriesEvents(pg(), seriesId);
    expect(events.map((e) => e.event_order)).toEqual([1, 2]);
  });

  it('persists points_multiplier and defaults it to 1.0', async () => {
    await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: matchId, points_multiplier: 2.5 });
    await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: await mk() });
    expect((await listSeriesEvents(pg(), seriesId)).map((e) => e.points_multiplier)).toEqual([2.5, 1]);
  });

  it('returns events ordered by event_order', async () => {
    await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: matchId, event_order: 3 });
    await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: await mk(), event_order: 1 });
    await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: await mk(), event_order: 2 });
    expect((await listSeriesEvents(pg(), seriesId)).map((e) => e.event_order)).toEqual([1, 2, 3]);
  });

  it('returns an empty list for a series with no events', async () => {
    expect(await listSeriesEvents(pg(), await createSeries(pg(), { name: 'Empty' }))).toHaveLength(0);
  });

  it('rejects (409) a conflict on an explicitly requested event_order', async () => {
    await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: matchId, event_order: 5 });
    await expect(addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: await mk(), event_order: 5 }))
      .rejects.toMatchObject({ name: 'SeriesError', status: 409 });
  });

  it('keeps numbering after a removal (max + 1, no reuse of gaps)', async () => {
    const e1 = await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: matchId });
    await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: await mk() });
    await removeSeriesEvent(pg(), seriesId, e1);
    await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: await mk() });
    expect((await listSeriesEvents(pg(), seriesId)).map((e) => e.event_order)).toEqual([2, 3]);
  });

  it('removeSeriesEvent removes the event from the list; unknown / foreign events and locked series are refused', async () => {
    const eventId = await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: matchId });
    const other = await createSeries(pg(), { name: 'Other' });
    await expect(removeSeriesEvent(pg(), other, eventId)).rejects.toMatchObject({ status: 404 });
    await expect(removeSeriesEvent(pg(), 'nope', eventId)).rejects.toMatchObject({ status: 404 });
    await removeSeriesEvent(pg(), seriesId, eventId);
    expect((await listSeriesEvents(pg(), seriesId)).find((e) => e.id === eventId)).toBeUndefined();

    const e2 = await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: await mk() });
    await updateSeries(pg(), seriesId, { status: 'complete' });
    await expect(removeSeriesEvent(pg(), seriesId, e2)).rejects.toMatchObject({ status: 409 });
    await expect(addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: await mk() })).rejects.toMatchObject({ status: 409 });
  });

  it('updateSeriesEvent edits date / multiplier and refuses unknown events', async () => {
    const eventId = await addSeriesEvent(pg(), seriesId, { event_type: 'match', match_id: matchId });
    const res = await updateSeriesEvent(pg(), seriesId, eventId, { points_multiplier: 3, event_date: '2026-06-01T00:00:00Z' });
    expect(res.event).toMatchObject({ points_multiplier: 3, event_date: new Date('2026-06-01T00:00:00Z') });
    const cleared = await updateSeriesEvent(pg(), seriesId, eventId, { event_date: null });
    expect(cleared.event.event_date).toBeNull();
    await expect(updateSeriesEvent(pg(), seriesId, 'nope', { points_multiplier: 2 })).rejects.toBeInstanceOf(SeriesError);
    await expect(updateSeriesEvent(pg(), 'nope', eventId, { points_multiplier: 2 })).rejects.toMatchObject({ status: 404 });
  });
});

describe('checkSeriesEventTarget', () => {
  it('flags missing targets (400) and duplicates (409)', async () => {
    const id = await createSeries(pg(), { name: 'C' });
    expect(await checkSeriesEventTarget(pg(), id, { event_type: 'match', match_id: 'nope' })).toMatchObject({ status: 400 });
    expect(await checkSeriesEventTarget(pg(), id, { event_type: 'tournament', tournament_id: 'nope' })).toMatchObject({ status: 400 });
    const m = await mk();
    expect(await checkSeriesEventTarget(pg(), id, { event_type: 'match', match_id: m })).toBeNull();
    await addSeriesEvent(pg(), id, { event_type: 'match', match_id: m });
    expect(await checkSeriesEventTarget(pg(), id, { event_type: 'match', match_id: m })).toMatchObject({ status: 409 });
  });
});

// ─── Standings, seeded by hand ───────────────────────────────────────────────

describe('getSeriesStandings', () => {
  const seed = async (partial: Partial<typeof matches.$inferInsert> = {}) => mk(partial);
  const participant = async (matchId: string, userId: string, username: string, extra: Partial<typeof matchParticipants.$inferInsert> = {}) => {
    const id = uid('mp');
    await pg().insert(matchParticipants).values({ id, match_id: matchId, user_id: userId, username, ...extra });
    return id;
  };
  const completedGame = async (matchId: string, round = 1) => {
    const id = uid('mg');
    await pg().insert(matchGames).values({ id, match_id: matchId, round, status: 'completed' });
    return id;
  };
  const place = (gid: string, entityType: 'team' | 'participant', entityId: string, position: number, points: number | null, winner: boolean) =>
    pg().insert(matchGamePlacements).values({ id: uid('pl'), match_game_id: gid, entity_type: entityType, entity_id: entityId, position, points_awarded: points, is_winner: winner });
  const positionMode = async (scoring: 'Position' | 'FFA') => (await createGameMode(gameId, { scoring_type: scoring, name: scoring })).id;

  const makeTournament = async (format: 'single-elimination' | 'double-elimination' | 'cumulative-points', status: 'complete' | 'battle' = 'complete') =>
    (await pg().insert(tournaments).values({ id: uid('t'), name: 'T', game_id: gameId, game_mode_id: modeId, format, status, rounds_per_match: 1 }).returning())[0].id;
  const makeTeam = async (tournamentId: string, name: string, username: string) => {
    const id = uid('tt');
    await pg().insert(tournamentTeams).values({ id, tournament_id: tournamentId, team_name: name });
    await pg().insert(tournamentTeamMembers).values({ id: uid('ttm'), team_id: id, user_id: `u_${username}`, discord_user_id: `d_${username}`, username });
    return id;
  };
  const bracketMatch = async (t: string, round: number, bracket: 'winners' | 'losers' | 'final', t1: string, t2: string, winner: string | null, status: 'complete' | 'battle' = 'complete') => {
    const id = await seed({ status, tournament_id: t, tournament_round: round, tournament_bracket_type: bracket, winner_team: winner, blue_team_id: t1, red_team_id: t2, match_format: 'competitive' });
    await pg().insert(tournamentMatches).values({ match_id: id, tournament_id: t, round, bracket_type: bracket, team1_id: t1, team2_id: t2, match_order: 1 });
    return id;
  };
  const seriesWith = (config?: Record<string, unknown>) => createSeries(pg(), { name: 'S', scoring_config: config });

  it('returns empty standings for a series with no events or an unknown series', async () => {
    expect(await getSeriesStandings(pg(), await createSeries(pg(), { name: 'Empty Standings' }))).toHaveLength(0);
    expect(await getSeriesStandings(pg(), 'missing')).toEqual([]);
  });

  it('aggregates points from match_game_placements across match events', async () => {
    const mode = await positionMode('Position');
    const sid = await seriesWith();
    const m1 = await seed({ mode_id: mode });
    const m2 = await seed({ mode_id: mode });
    const a1 = await participant(m1, 'alice', 'Alice');
    const a2 = await participant(m2, 'alice', 'Alice');
    await place(await completedGame(m1), 'participant', a1, 1, 10, true);
    await place(await completedGame(m2), 'participant', a2, 2, 8, false);
    await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: m1 });
    await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: m2 });
    const alice = (await getSeriesStandings(pg(), sid)).find((s) => s.username === 'Alice')!;
    expect(alice.total_points).toBe(18);
    expect(alice.rank).toBe(1);
    expect(alice.events_played).toBe(2);
  });

  it('applies points_multiplier to scores', async () => {
    const mode = await positionMode('Position');
    const sid = await seriesWith();
    const m = await seed({ mode_id: mode });
    await place(await completedGame(m), 'participant', await participant(m, 'bob', 'Bob'), 1, 10, true);
    await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: m, points_multiplier: 2 });
    expect((await getSeriesStandings(pg(), sid)).find((s) => s.username === 'Bob')!.total_points).toBe(20);
  });

  it('ranks participants correctly (highest total_points = rank 1)', async () => {
    const mode = await positionMode('Position');
    const sid = await seriesWith();
    const m = await seed({ mode_id: mode });
    const gid = await completedGame(m);
    await place(gid, 'participant', await participant(m, 'c', 'Charlie'), 2, 5, false);
    await place(gid, 'participant', await participant(m, 'd', 'Diana'), 1, 15, true);
    await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: m });
    const st = await getSeriesStandings(pg(), sid);
    expect(st.map((r) => [r.username, r.rank, r.total_points])).toEqual([['Diana', 1, 15], ['Charlie', 2, 5]]);
  });

  it('ignores placements of games that are not completed', async () => {
    const mode = await positionMode('Position');
    const sid = await seriesWith();
    const m = await seed({ mode_id: mode });
    const p = await participant(m, 'p', 'P');
    await place(await completedGame(m, 1), 'participant', p, 1, 10, true);
    const open = uid('mg');
    await pg().insert(matchGames).values({ id: open, match_id: m, round: 2, status: 'ongoing' });
    await place(open, 'participant', p, 1, 99, true);
    await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: m });
    expect((await getSeriesStandings(pg(), sid))[0].total_points).toBe(10);
  });

  it('scores a Normal match event via match_win_points/match_loss_points (regression: used to score 0)', async () => {
    const sid = await seriesWith({ match_win_points: 10, match_loss_points: 3 });
    const m = await seed();
    const blue = uid('mt');
    const red = uid('mt');
    await pg().insert(matchTeams).values([{ id: blue, match_id: m, team_name: 'Blue', team_order: 0 }, { id: red, match_id: m, team_name: 'Red', team_order: 1 }]);
    await participant(m, 'w', 'Winner', { team_id: blue });
    await participant(m, 'l', 'Loser', { team_id: red });
    const gid = await completedGame(m);
    await place(gid, 'team', blue, 1, null, true);
    await place(gid, 'team', red, 2, null, false);
    await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: m });
    const st = await getSeriesStandings(pg(), sid);
    expect(st.find((s) => s.username === 'Winner')?.total_points).toBe(10);
    expect(st.find((s) => s.username === 'Loser')?.total_points).toBe(3);
  });

  it('scores an FFA match event via match_win_points/match_loss_points', async () => {
    const sid = await seriesWith({ match_win_points: 20, match_loss_points: 5 });
    const m = await seed({ mode_id: await positionMode('FFA') });
    const w = await participant(m, 'fw', 'FfaWinner');
    await participant(m, 'fl', 'FfaLoser');
    await place(await completedGame(m), 'participant', w, 1, null, true);
    await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: m });
    const st = await getSeriesStandings(pg(), sid);
    expect(st.find((s) => s.username === 'FfaWinner')?.total_points).toBe(20);
    expect(st.find((s) => s.username === 'FfaLoser')?.total_points).toBe(5);
  });

  it('scores a bracket tournament event: champion earns tournament_position_points[0], runner-up [1]', async () => {
    const sid = await seriesWith({ tournament_position_points: [25, 18, 15] });
    const t = await makeTournament('single-elimination');
    const champ = await makeTeam(t, 'Champions', 'ChampPlayer');
    const runner = await makeTeam(t, 'Runners Up', 'RunnerPlayer');
    await bracketMatch(t, 1, 'final', champ, runner, champ);
    await addSeriesEvent(pg(), sid, { event_type: 'tournament', tournament_id: t });
    const st = await getSeriesStandings(pg(), sid);
    expect(st.find((s) => s.username === 'ChampPlayer')?.total_points).toBe(25);
    expect(st.find((s) => s.username === 'RunnerPlayer')?.total_points).toBe(18);
  });

  it('scores a cumulative-points tournament event by per-participant rank', async () => {
    const sid = await seriesWith({ tournament_position_points: [25, 18] });
    const t = await makeTournament('cumulative-points');
    const m = await seed({ mode_id: await positionMode('FFA'), tournament_id: t });
    const first = await participant(m, 'first', 'First');
    const second = await participant(m, 'second', 'Second');
    const gid = await completedGame(m);
    await place(gid, 'participant', first, 1, 25, true);
    await place(gid, 'participant', second, 2, 18, false);
    await addSeriesEvent(pg(), sid, { event_type: 'tournament', tournament_id: t });
    const st = await getSeriesStandings(pg(), sid);
    expect(st.find((s) => s.username === 'First')?.total_points).toBe(25);
    expect(st.find((s) => s.username === 'Second')?.total_points).toBe(18);
  });

  it('single-elim: champion, runner-up and semifinal losers (shared 3rd) get placement points', async () => {
    const t = await makeTournament('single-elimination');
    const [a, b, c, d] = [await makeTeam(t, 'A', 'Alice'), await makeTeam(t, 'B', 'Bob'), await makeTeam(t, 'C', 'Cara'), await makeTeam(t, 'D', 'Dan')];
    await bracketMatch(t, 1, 'winners', a, d, a);
    await bracketMatch(t, 1, 'winners', b, c, b);
    await bracketMatch(t, 2, 'winners', a, b, a);
    const sid = await seriesWith({ tournament_position_points: [25, 18, 15] });
    await addSeriesEvent(pg(), sid, { event_type: 'tournament', tournament_id: t, points_multiplier: 2 });
    const st = await getSeriesStandings(pg(), sid);
    const pts = (n: string) => st.find((r) => r.username === n)?.total_points;
    expect([pts('Alice'), pts('Bob'), pts('Cara'), pts('Dan')]).toEqual([50, 36, 30, 30]);
  });

  it('double-elim: uses the final bracket match for the champion', async () => {
    const t = await makeTournament('double-elimination');
    const a = await makeTeam(t, 'A', 'Alice');
    const b = await makeTeam(t, 'B', 'Bob');
    await bracketMatch(t, 1, 'final', a, b, b);
    const sid = await seriesWith({ tournament_position_points: [10, 6] });
    await addSeriesEvent(pg(), sid, { event_type: 'tournament', tournament_id: t });
    const st = await getSeriesStandings(pg(), sid);
    expect(st.find((r) => r.username === 'Bob')?.total_points).toBe(10);
    expect(st.find((r) => r.username === 'Alice')?.total_points).toBe(6);
  });

  it('ignores tournaments that are not complete', async () => {
    const t = await makeTournament('single-elimination', 'battle');
    await bracketMatch(t, 1, 'winners', await makeTeam(t, 'A', 'Alice'), await makeTeam(t, 'B', 'Bob'), null, 'battle');
    const sid = await seriesWith({ tournament_position_points: [10, 6] });
    await addSeriesEvent(pg(), sid, { event_type: 'tournament', tournament_id: t });
    expect(await getSeriesStandings(pg(), sid)).toHaveLength(0);
  });

  it('cumulative: groups by stable id and tied players share the higher placing points', async () => {
    const ffa = await positionMode('FFA');
    const t = await makeTournament('cumulative-points');
    const scores: Array<[string, number]> = [['P1', 10], ['P2', 10], ['P3', 4]];
    for (let i = 0; i < 2; i++) {
      const mid = await seed({ mode_id: ffa, tournament_id: t, match_format: 'casual' });
      const gid = await completedGame(mid);
      for (const [name, total] of scores) {
        // Same player across matches: stable discord id, different usernames/user ids per match
        const pid = await participant(mid, `${name}_u${i}`, `${name}${i === 0 ? '' : '_renamed'}`, { discord_user_id: `d_${name}` });
        await place(gid, 'participant', pid, 1, total / 2, false);
      }
    }
    const sid = await seriesWith({ tournament_position_points: [25, 18, 15] });
    await addSeriesEvent(pg(), sid, { event_type: 'tournament', tournament_id: t });
    const st = await getSeriesStandings(pg(), sid);
    expect(st).toHaveLength(3);
    const byId = new Map(st.map((r) => [r.user_id, r.total_points]));
    expect(byId.get('d_P1')).toBe(25);
    expect(byId.get('d_P2')).toBe(25); // tied for 1st, both get 1st-place points
    expect(byId.get('d_P3')).toBe(15); // rank index 2 (3rd place)
  });

  it('credits players of a tournament match through tournament team membership', async () => {
    const t = await makeTournament('single-elimination', 'battle');
    const a = await makeTeam(t, 'A', 'Alice');
    const b = await makeTeam(t, 'B', 'Bob');
    const mid = await bracketMatch(t, 1, 'winners', a, b, a);
    await participant(mid, 'u_Alice', 'Alice', { discord_user_id: 'd_Alice' });
    await participant(mid, 'u_Bob', 'Bob', { discord_user_id: 'd_Bob' });
    const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1 });
    await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: mid });
    const st = await getSeriesStandings(pg(), sid);
    expect(st.find((r) => r.username === 'Alice')?.total_points).toBe(3);
    expect(st.find((r) => r.username === 'Bob')?.total_points).toBe(1);
  });

  it('ignores cancelled and in-progress matches (no points, no events_played)', async () => {
    const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1 });
    for (const status of ['cancelled', 'battle'] as const) {
      const m = await seed({ status });
      await participant(m, 'u1', 'One', { discord_user_id: 'd1' });
      await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: m });
    }
    expect(await getSeriesStandings(pg(), sid)).toHaveLength(0);
  });

  it('does not give loss points to reserves or unassigned players', async () => {
    const m = await seed();
    const [t1, t2, tr] = [uid('mt'), uid('mt'), uid('mt')];
    await pg().insert(matchTeams).values([
      { id: t1, match_id: m, team_name: 'Blue', team_order: 0 },
      { id: t2, match_id: m, team_name: 'Red', team_order: 1 },
      { id: tr, match_id: m, team_name: 'Reserve', team_order: 99, is_reserve: true },
    ]);
    await participant(m, 'u_Win', 'Win', { discord_user_id: 'd_Win', team_id: t1 });
    await participant(m, 'u_Lose', 'Lose', { discord_user_id: 'd_Lose', team_id: t2 });
    await participant(m, 'u_Bench', 'Bench', { discord_user_id: 'd_Bench', team_id: tr });
    await participant(m, 'u_Nobody', 'Nobody', { discord_user_id: 'd_Nobody' });
    const gid = await completedGame(m);
    await place(gid, 'team', t1, 1, 1, true);
    await place(gid, 'team', t2, 2, 0, false);
    const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1 });
    await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: m });
    const st = await getSeriesStandings(pg(), sid);
    expect(st.find((r) => r.username === 'Win')?.total_points).toBe(3);
    expect(st.find((r) => r.username === 'Lose')?.total_points).toBe(1);
    expect(st.find((r) => r.username === 'Bench')).toBeUndefined();
    expect(st.find((r) => r.username === 'Nobody')).toBeUndefined();
  });

  it('breaks ties on points alphabetically by username while sharing the rank', async () => {
    const sid = await seriesWith({ match_win_points: 1, match_loss_points: 1 });
    const m = await seed();
    const [a, b] = [uid('mt'), uid('mt')];
    await pg().insert(matchTeams).values([{ id: a, match_id: m, team_name: 'A', team_order: 0 }, { id: b, match_id: m, team_name: 'B', team_order: 1 }]);
    await participant(m, 'z', 'Zed', { team_id: a });
    await participant(m, 'y', 'Amy', { team_id: b });
    await addSeriesEvent(pg(), sid, { event_type: 'match', match_id: m });
    const st = await getSeriesStandings(pg(), sid);
    expect(st.map((r) => [r.username, r.rank])).toEqual([['Amy', 1], ['Zed', 1]]);
  });
});
