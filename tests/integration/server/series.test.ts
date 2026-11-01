// @vitest-environment node
/** `/api/series` CRUD, transitions, events, standings envelope and UI read models (Hono + Postgres). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createMatch, createTournament } from '../../utils/pg-fixtures';
import { addEventApi, insertSeries, linkEvent, transitionSeriesApi, uid } from '../../utils/pg-series-fixtures';
import {
  matchGamePlacements, matchGames, matchParticipants, matchTeams, matches, series, seriesEvents, tournaments,
  tournamentTeamMembers, tournamentTeams,
} from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', () => ({ logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  gameId = (await createGame()).id;
  modeId = (await createGameMode(gameId)).id;
});

const getSeries = (id: string) => appRequest(`/api/series/${id}`);
const patchSeries = (id: string, json: unknown) => appRequest(`/api/series/${id}`, { method: 'PATCH', json });

describe('GET /api/series', () => {
  it('returns an empty list when no series exist', async () => {
    const { status, data } = await appRequest('/api/series');
    expect(status).toBe(200);
    expect(data.series).toEqual([]);
  });

  it('returns all series', async () => {
    await insertSeries({ id: 's_list1', name: 'List One', status: 'created' });
    await insertSeries({ id: 's_list2', name: 'List Two', status: 'active' });
    const { status, data } = await appRequest('/api/series');
    expect(status).toBe(200);
    expect(data.series.map((s: any) => s.id).sort()).toEqual(['s_list1', 's_list2']);
  });

  it('filters by status', async () => {
    await insertSeries({ id: 's_active_f', status: 'active' });
    await insertSeries({ id: 's_created_f', status: 'created' });
    const { status, data } = await appRequest('/api/series?status=active');
    expect(status).toBe(200);
    expect(data.series.map((s: any) => s.id)).toEqual(['s_active_f']);
  });
});

describe('POST /api/series', () => {
  it('creates a series and returns its id', async () => {
    const { status, data } = await appRequest('/api/series', { method: 'POST', json: { name: 'Spring Cup 2026' } });
    expect(status).toBe(201);
    expect(data.id).toMatch(/^series_/);
    const created = (await getSeries(data.id)).data.series;
    expect(created).toMatchObject({ name: 'Spring Cup 2026', status: 'created', announcements: true, player_notifications: true });
  });

  it('stores the scoring_config as an object and trims the name', async () => {
    const cfg = { match_win_points: 10, tournament_position_points: [25, 18, 15] };
    const { data } = await appRequest('/api/series', { method: 'POST', json: { name: '  Padded  ', scoring_config: cfg, announcements: false } });
    const created = (await getSeries(data.id)).data.series;
    expect(created).toMatchObject({ name: 'Padded', scoring_config: cfg, announcements: false });
  });

  it('returns 400 when name is missing', async () => {
    const { status } = await appRequest('/api/series', { method: 'POST', json: { description: 'no name' } });
    expect(status).toBe(400);
  });
});

describe('GET /api/series/:seriesId', () => {
  it('returns series details', async () => {
    await insertSeries({ id: 's_detail', name: 'Detail Series', status: 'created' });
    const { status, data } = await getSeries('s_detail');
    expect(status).toBe(200);
    expect(data.series).toMatchObject({ id: 's_detail', name: 'Detail Series' });
  });

  it('returns 404 for unknown series', async () => {
    expect((await getSeries('no-such-id')).status).toBe(404);
  });
});

describe('PATCH /api/series/:seriesId', () => {
  it('updates series name', async () => {
    await insertSeries({ id: 's_patch', name: 'Before', status: 'created' });
    const { status, data } = await patchSeries('s_patch', { name: 'After' });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((await getSeries('s_patch')).data.series.name).toBe('After');
  });

  it('ignores a status field instead of applying it: status changes go through POST /transition', async () => {
    await insertSeries({ id: 's_activate', name: 'Activate Me', status: 'created' });
    expect((await patchSeries('s_activate', { status: 'complete' })).status).toBe(200);
    expect((await getSeries('s_activate')).data.series.status).toBe('created');
  });

  it('returns 404 for unknown series', async () => {
    expect((await patchSeries('nope', { name: 'x' })).status).toBe(404);
  });
});

describe('POST /api/series/:seriesId/transition', () => {
  it('allows created -> active', async () => {
    await insertSeries({ id: 's_t1', status: 'created' });
    const { status, data } = await transitionSeriesApi('s_t1', 'active');
    expect(status).toBe(200);
    expect(data.series.status).toBe('active');
  });

  it('rejects created -> complete (skips active)', async () => {
    await insertSeries({ id: 's_t2', status: 'created' });
    expect((await transitionSeriesApi('s_t2', 'complete')).status).toBe(400);
    expect((await getSeries('s_t2')).data.series.status).toBe('created');
  });

  it('rejects transitioning out of a completed series', async () => {
    await insertSeries({ id: 's_t3', status: 'complete' });
    expect((await transitionSeriesApi('s_t3', 'active')).status).toBe(400);
  });

  it('rejects an invalid status value', async () => {
    await insertSeries({ id: 's_t4', status: 'created' });
    expect((await transitionSeriesApi('s_t4', 'bogus')).status).toBe(400);
  });

  it('returns 404 for unknown series', async () => {
    expect((await transitionSeriesApi('nope', 'active')).status).toBe(404);
  });
});

describe('DELETE /api/series/:seriesId', () => {
  it('deletes the series and returns success', async () => {
    await insertSeries({ id: 's_del', name: 'Delete Me', status: 'created' });
    const { status, data } = await appRequest('/api/series/s_del', { method: 'DELETE' });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((await getSeries('s_del')).status).toBe(404);
  });

  it('returns 404 for unknown series', async () => {
    expect((await appRequest('/api/series/nope', { method: 'DELETE' })).status).toBe(404);
  });
});

describe('GET /api/series/:seriesId/events', () => {
  it('returns an empty events list for a new series', async () => {
    await insertSeries({ id: 's_ev_empty', status: 'created' });
    const { status, data } = await appRequest('/api/series/s_ev_empty/events');
    expect(status).toBe(200);
    expect(data.events).toHaveLength(0);
  });
});

describe('POST /api/series/:seriesId/events', () => {
  let seriesId: string;
  let matchId: string;
  beforeEach(async () => {
    seriesId = (await insertSeries({ name: 'Event Series', status: 'active' })).id;
    matchId = (await createMatch(gameId, modeId, { status: 'complete', name: 'Test Match' })).id;
  });

  it('adds a match event and returns its id', async () => {
    const { status, data } = await addEventApi(seriesId, { event_type: 'match', match_id: matchId, points_multiplier: 1.5 });
    expect(status).toBe(201);
    expect(data.id).toMatch(/^sevt_/);
  });

  it('returns 400 when event_type is invalid', async () => {
    expect((await addEventApi(seriesId, { event_type: 'invalid', match_id: matchId })).status).toBe(400);
  });

  it('returns 400 when a match event is missing match_id', async () => {
    expect((await addEventApi(seriesId, { event_type: 'match' })).status).toBe(400);
  });

  it('returns 400 when a tournament event is missing tournament_id', async () => {
    expect((await addEventApi(seriesId, { event_type: 'tournament' })).status).toBe(400);
  });

  it('returns 404 when the series does not exist', async () => {
    expect((await addEventApi('nope', { event_type: 'match', match_id: matchId })).status).toBe(404);
  });
});

describe('GET /api/series/:seriesId/standings', () => {
  it('returns 404 for unknown series', async () => {
    expect((await appRequest('/api/series/nope/standings')).status).toBe(404);
  });

  it('returns the standings envelope with series metadata', async () => {
    await insertSeries({ id: 's_stands', name: 'Standings Series', status: 'active' });
    const { status, data } = await appRequest('/api/series/s_stands/standings');
    expect(status).toBe(200);
    expect(data).toMatchObject({ series_id: 's_stands', series_name: 'Standings Series', standings: [] });
  });
});

describe('Series API hardening', () => {
  let seriesId: string;
  const insertMatch = async (status: 'created' | 'gather' | 'battle' | 'complete' | 'cancelled' = 'complete', tournamentId: string | null = null) =>
    (await createMatch(gameId, modeId, { name: 'M', status, tournament_id: tournamentId })).id;
  const addEv = (body: Record<string, unknown>, sid = seriesId) => addEventApi(sid, body);

  beforeEach(async () => {
    seriesId = (await insertSeries({ name: 'Hardening', status: 'active' })).id;
  });

  it('dashboard transition: activates a created series and rejects illegal moves with an error message', async () => {
    const id = (await insertSeries({ name: 'Dash', status: 'created' })).id;
    const ok = await transitionSeriesApi(id, 'active');
    expect(ok.status).toBe(200);
    expect(ok.data.series.status).toBe('active');
    expect((await transitionSeriesApi(id, 'cancelled')).status).toBe(200);
    const bad = await transitionSeriesApi(id, 'active');
    expect(bad.status).toBe(400);
    expect(typeof bad.data.error).toBe('string');
  });

  it('returns 400 for invalid JSON bodies', async () => {
    const res = await appRequest('/api/series', { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
  });

  it('rejects non-string / empty name on create and PATCH', async () => {
    expect((await appRequest('/api/series', { method: 'POST', json: { name: 5 } })).status).toBe(400);
    expect((await patchSeries(seriesId, { name: '  ' })).status).toBe(400);
  });

  it('PATCH can clear a field with null', async () => {
    await patchSeries(seriesId, { description: 'hello' });
    expect((await getSeries(seriesId)).data.series.description).toBe('hello');
    await patchSeries(seriesId, { description: null });
    expect((await getSeries(seriesId)).data.series.description).toBeNull();
  });

  it('rejects null / malformed scoring_config with 400', async () => {
    for (const cfg of [null, [], { match_win_points: 'x' }, { tournament_position_points: [1, 'a'] }]) {
      const { status } = await appRequest('/api/series', { method: 'POST', json: { name: 'Cfg', scoring_config: cfg } });
      expect(status).toBe(400);
    }
  });

  it('rejects bad points_multiplier and event_order with 400', async () => {
    const m = await insertMatch();
    for (const mult of [0, -1, 11, 'abc']) {
      expect((await addEv({ event_type: 'match', match_id: m, points_multiplier: mult })).status).toBe(400);
    }
    expect((await addEv({ event_type: 'match', match_id: m, event_order: 0 })).status).toBe(400);
    expect((await addEv({ event_type: 'match', match_id: m, event_order: 1.5 })).status).toBe(400);
  });

  it('rejects unknown match/tournament ids with 400', async () => {
    expect((await addEv({ event_type: 'match', match_id: 'missing' })).status).toBe(400);
    expect((await addEv({ event_type: 'tournament', tournament_id: 'missing' })).status).toBe(400);
  });

  it('rejects a contradictory body (target of the other type set) with 400', async () => {
    const m = await insertMatch();
    expect((await addEv({ event_type: 'match', match_id: m, tournament_id: 'x' })).status).toBe(400);
    const t = (await createTournament(gameId, { game_mode_id: modeId })).id;
    expect((await addEv({ event_type: 'tournament', tournament_id: t, match_id: m })).status).toBe(400);
  });

  it('rejects a duplicate event with 409', async () => {
    const m = await insertMatch();
    expect((await addEv({ event_type: 'match', match_id: m })).status).toBe(201);
    expect((await addEv({ event_type: 'match', match_id: m })).status).toBe(409);
  });

  it('rejects an explicit event_order that is already used with 409', async () => {
    const a = await insertMatch();
    const b = await insertMatch();
    expect((await addEv({ event_type: 'match', match_id: a, event_order: 5 })).status).toBe(201);
    const clash = await addEv({ event_type: 'match', match_id: b, event_order: 5 });
    expect(clash.status).toBe(409);
    expect(clash.data.error).toMatch(/event_order/);
  });

  it('events GET returns 404 for a missing series; POST/DELETE are rejected on a complete series', async () => {
    expect((await appRequest('/api/series/x/events')).status).toBe(404);

    const m = await insertMatch();
    const created = await addEv({ event_type: 'match', match_id: m });
    await pg().update(series).set({ status: 'complete' }).where(eq(series.id, seriesId));
    expect((await addEv({ event_type: 'match', match_id: await insertMatch() })).status).toBe(409);
    const del = await appRequest(`/api/series/${seriesId}/events/${created.data.id}`, { method: 'DELETE' });
    expect(del.status).toBe(409);
  });

  it('event DELETE is scoped to the series (404 for another series)', async () => {
    const other = (await insertSeries({ name: 'Other', status: 'active' })).id;
    const m = await insertMatch();
    const created = await addEv({ event_type: 'match', match_id: m });
    expect((await appRequest(`/api/series/${other}/events/${created.data.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await appRequest(`/api/series/${seriesId}/events/${created.data.id}`, { method: 'DELETE' })).status).toBe(200);
  });

  it('standings: single-elim champion gets tournament_position_points[0], runner-up [1]', async () => {
    await pg().update(series).set({ scoring_config: { tournament_position_points: [25, 18] } }).where(eq(series.id, seriesId));
    const t = (await createTournament(gameId, { game_mode_id: modeId, status: 'complete' })).id;
    const champ = uid('tt');
    const runner = uid('tt');
    await pg().insert(tournamentTeams).values([{ id: champ, tournament_id: t, team_name: 'C' }, { id: runner, tournament_id: t, team_name: 'R' }]);
    await pg().insert(tournamentTeamMembers).values([
      { id: uid('ttm'), team_id: champ, user_id: 'uc', username: 'Champ' },
      { id: uid('ttm'), team_id: runner, user_id: 'ur', username: 'Runner' },
    ]);
    await createMatch(gameId, modeId, {
      name: 'Final', status: 'complete', match_format: 'competitive', tournament_id: t, tournament_round: 1, tournament_bracket_type: 'winners',
      winner_team: champ, blue_team_id: champ, red_team_id: runner,
    });
    expect((await addEv({ event_type: 'tournament', tournament_id: t })).status).toBe(201);
    const { data } = await appRequest(`/api/series/${seriesId}/standings`);
    expect(data.standings.find((r: any) => r.username === 'Champ').total_points).toBe(25);
    expect(data.standings.find((r: any) => r.username === 'Runner').total_points).toBe(18);
  });

  it('GET /api/matches supports multiple statuses and exclude_tournament', async () => {
    const t = (await createTournament(gameId, { game_mode_id: modeId, status: 'battle' })).id;
    const created = await insertMatch('created');
    const done = await insertMatch('complete');
    const tm = await insertMatch('created', t);
    const { data } = await appRequest('/api/matches?status=created&status=complete&exclude_tournament=true');
    const ids = (data.matches ?? data).map((m: any) => m.id);
    expect(ids).toContain(created);
    expect(ids).toContain(done);
    expect(ids).not.toContain(tm);
  });

  it('match DELETE removes match_teams, placements and series_events', async () => {
    const m = await insertMatch();
    const mt = uid('mt');
    await pg().insert(matchTeams).values({ id: mt, match_id: m, team_name: 'Blue', team_order: 0 });
    const gid = uid('mg');
    await pg().insert(matchGames).values({ id: gid, match_id: m, round: 1, status: 'completed' });
    await pg().insert(matchGamePlacements).values({ id: uid('pl'), match_game_id: gid, entity_type: 'team', entity_id: mt, is_winner: true });
    await addEv({ event_type: 'match', match_id: m });

    expect((await appRequest(`/api/matches/${m}`, { method: 'DELETE' })).status).toBe(200);
    expect(await pg().select().from(matchTeams).where(eq(matchTeams.match_id, m))).toHaveLength(0);
    expect(await pg().select().from(matchGamePlacements).where(eq(matchGamePlacements.match_game_id, gid))).toHaveLength(0);
    expect(await pg().select().from(seriesEvents).where(eq(seriesEvents.match_id, m))).toHaveLength(0);
  });

  it('tournament DELETE removes series_events and its matches\' teams/placements', async () => {
    const t = (await createTournament(gameId, { game_mode_id: modeId, status: 'complete' })).id;
    const m = await insertMatch('complete', t);
    const mt = uid('mt');
    await pg().insert(matchTeams).values({ id: mt, match_id: m, team_name: 'Blue', team_order: 0 });
    const gid = uid('mg');
    await pg().insert(matchGames).values({ id: gid, match_id: m, round: 1, status: 'completed' });
    await pg().insert(matchGamePlacements).values({ id: uid('pl'), match_game_id: gid, entity_type: 'team', entity_id: mt, is_winner: true });
    expect((await addEv({ event_type: 'tournament', tournament_id: t })).status).toBe(201);

    expect((await appRequest(`/api/tournaments/${t}`, { method: 'DELETE' })).status).toBe(200);
    expect(await pg().select().from(seriesEvents).where(eq(seriesEvents.tournament_id, t))).toHaveLength(0);
    expect(await pg().select().from(matchTeams).where(eq(matchTeams.match_id, m))).toHaveLength(0);
    expect(await pg().select().from(matchGamePlacements).where(eq(matchGamePlacements.match_game_id, gid))).toHaveLength(0);
    expect(await pg().select().from(matches).where(eq(matches.id, m))).toHaveLength(0);
    expect(await pg().select().from(tournaments).where(eq(tournaments.id, t))).toHaveLength(0);
  });

  it('series DELETE removes its events', async () => {
    const m = await insertMatch();
    await addEv({ event_type: 'match', match_id: m });
    expect((await appRequest(`/api/series/${seriesId}`, { method: 'DELETE' })).status).toBe(200);
    expect(await pg().select().from(seriesEvents).where(eq(seriesEvents.series_id, seriesId))).toHaveLength(0);
  });

  describe('UI read models', () => {
    const addParticipant = async (matchId: string, userId: string, username: string) => {
      const id = uid('mp');
      await pg().insert(matchParticipants).values({ id, match_id: matchId, user_id: userId, discord_user_id: userId, username });
      return id;
    };

    it('GET /api/series returns counts, next event (with game), players and identity fallbacks', async () => {
      const done = await insertMatch('complete');
      const upcoming = await insertMatch('gather');
      await addParticipant(done, 'u1', 'Alice');
      await addParticipant(done, 'u2', 'Bob');
      await addParticipant(upcoming, 'u1', 'Alice'); // same player in two events counts once
      expect((await addEv({ event_type: 'match', match_id: done })).status).toBe(201);
      expect((await addEv({ event_type: 'match', match_id: upcoming })).status).toBe(201);

      const { status, data } = await appRequest('/api/series?status=active');
      expect(status).toBe(200);
      const row = data.series.find((x: any) => x.id === seriesId);
      expect(row.event_count).toBe(2);
      expect(row.completed_event_count).toBe(1);
      expect(row.participant_count).toBe(2);
      expect(row.next_event).toMatchObject({ type: 'match', event_order: 2, game_id: gameId });
      expect(row.last_event_game.game_id).toBe(gameId);
      expect(row.series_game).toBeNull();
      expect(row.champion).toBeNull();
      expect(row.announcements).toBe(true);
    });

    it('counts tournament signups and tournament match participants as players', async () => {
      const t = (await createTournament(gameId, { game_mode_id: modeId, status: 'gather' })).id;
      const { tournamentParticipants } = await import('../../../lib/db/schema');
      await pg().insert(tournamentParticipants).values({ id: uid('tp'), tournament_id: t, user_id: 'a', discord_user_id: 'da', username: 'A' });
      const tm = await insertMatch('battle', t);
      await addParticipant(tm, 'db', 'B');
      await addEv({ event_type: 'tournament', tournament_id: t });
      const { data } = await getSeries(seriesId);
      expect(data.series.participant_count).toBe(2);
    });

    it('next_event is null and counts are zero for a series with no events', async () => {
      const { data } = await getSeries(seriesId);
      expect(data.series).toMatchObject({ event_count: 0, completed_event_count: 0, participant_count: 0, next_event: null });
    });

    it('accepts several statuses and paginates with limit/offset', async () => {
      const ids = [uid('s_pg'), uid('s_pg'), uid('s_pg')];
      for (const [i, id] of ids.entries()) {
        await insertSeries({ id, name: 'P', status: i === 0 ? 'cancelled' : 'complete', created_at: new Date(Date.UTC(2026, 0, 1 + i)) });
      }
      const first = await appRequest('/api/series?status=complete,cancelled&limit=2&offset=0');
      expect(first.data.series.map((x: any) => x.id)).toEqual([ids[2], ids[1]]);
      const second = await appRequest('/api/series?status=complete&status=cancelled&limit=2&offset=2');
      expect(second.data.series.map((x: any) => x.id)).toContain(ids[0]);
      expect((await appRequest('/api/series?limit=0')).status).toBe(400);
      expect((await appRequest('/api/series?offset=-1')).status).toBe(400);
    });

    it('history rows carry the champion of a complete series', async () => {
      await pg().update(series).set({ status: 'complete', scoring_config: { match_win_points: 3 } }).where(eq(series.id, seriesId));
      const m = await insertMatch('complete');
      const mtA = uid('mt');
      const mtB = uid('mt');
      await pg().insert(matchTeams).values([{ id: mtA, match_id: m, team_name: 'A', team_order: 0 }, { id: mtB, match_id: m, team_name: 'B', team_order: 1 }]);
      await pg().insert(matchParticipants).values([
        { id: uid('mp'), match_id: m, user_id: 'ua', username: 'Winner', team_id: mtA },
        { id: uid('mp'), match_id: m, user_id: 'ub', username: 'Loser', team_id: mtB },
      ]);
      const gA = uid('mg');
      await pg().insert(matchGames).values({ id: gA, match_id: m, round: 1, status: 'completed' });
      await pg().insert(matchGamePlacements).values({ id: uid('pl'), match_game_id: gA, entity_type: 'team', entity_id: mtA, is_winner: true });
      // Series is complete, so add the event directly rather than via the (now locked) API.
      await linkEvent(seriesId, 'match', m, { event_order: 1 });
      const { data } = await appRequest('/api/series?status=complete');
      expect(data.series.find((x: any) => x.id === seriesId).champion).toBe('Winner');
    });

    it('events GET joins name, status, game and date of the linked match', async () => {
      const m = await insertMatch('battle');
      await addEv({ event_type: 'match', match_id: m, points_multiplier: 1.5 });
      const { data } = await appRequest(`/api/series/${seriesId}/events`);
      expect(data.events).toHaveLength(1);
      expect(data.events[0]).toMatchObject({ match_id: m, name: 'M', status: 'battle', game_id: gameId, points_multiplier: 1.5 });
      expect(data.events[0].start_date).toBeTruthy();
    });

    it('events GET prefers the event date over the match start date', async () => {
      const m = await insertMatch('created');
      await addEv({ event_type: 'match', match_id: m, event_date: '2030-01-02T00:00:00.000Z' });
      const { data } = await appRequest(`/api/series/${seriesId}/events`);
      expect(data.events[0].start_date).toBe('2030-01-02T00:00:00.000Z');
      expect(data.events[0].event_date).toBe('2030-01-02T00:00:00.000Z');
    });

    it('standings include per-event points after the multiplier, null where the player did not play', async () => {
      await pg().update(series).set({ scoring_config: { match_win_points: 3, match_loss_points: 1 } }).where(eq(series.id, seriesId));
      const makeDuel = async (winner: string, loser: string) => {
        const m = await insertMatch('complete');
        const a = uid('mt');
        const b = uid('mt');
        await pg().insert(matchTeams).values([{ id: a, match_id: m, team_name: 'A', team_order: 0 }, { id: b, match_id: m, team_name: 'B', team_order: 1 }]);
        await pg().insert(matchParticipants).values([
          { id: uid('mp'), match_id: m, user_id: winner, username: winner, team_id: a },
          { id: uid('mp'), match_id: m, user_id: loser, username: loser, team_id: b },
        ]);
        // Standalone match winners come from game placements (see determineMatchWinner).
        const g = uid('mg');
        await pg().insert(matchGames).values({ id: g, match_id: m, round: 1, status: 'completed' });
        await pg().insert(matchGamePlacements).values({ id: uid('pl'), match_game_id: g, entity_type: 'team', entity_id: a, is_winner: true });
        return m;
      };
      const m1 = await makeDuel('alice', 'bob');
      const m2 = await makeDuel('carol', 'alice');
      const e1 = (await addEv({ event_type: 'match', match_id: m1 })).data.id;
      const e2 = (await addEv({ event_type: 'match', match_id: m2, points_multiplier: 2 })).data.id;

      const { data } = await appRequest(`/api/series/${seriesId}/standings`);
      const byName = (n: string) => data.standings.find((r: any) => r.username === n);
      expect(byName('alice').events).toEqual([{ series_event_id: e1, points: 3 }, { series_event_id: e2, points: 2 }]);
      expect(byName('alice').total_points).toBe(5);
      expect(byName('bob').events).toEqual([{ series_event_id: e1, points: 1 }, { series_event_id: e2, points: null }]);
      expect(byName('carol').events).toEqual([{ series_event_id: e1, points: null }, { series_event_id: e2, points: 6 }]);
    });

    it('membership lookup finds series for a match directly or through its tournament', async () => {
      const direct = await insertMatch('created');
      await addEv({ event_type: 'match', match_id: direct, points_multiplier: 1.5 });
      const t = (await createTournament(gameId, { game_mode_id: modeId, status: 'battle' })).id;
      const tMatch = await insertMatch('battle', t);
      await addEv({ event_type: 'tournament', tournament_id: t, points_multiplier: 2 });

      const d = await appRequest(`/api/series?match_id=${direct}`);
      expect(d.data.memberships).toEqual([expect.objectContaining({ series_id: seriesId, series_name: 'Hardening', points_multiplier: 1.5, via: 'direct' })]);
      const v = await appRequest(`/api/series?match_id=${tMatch}`);
      expect(v.data.memberships).toEqual([expect.objectContaining({ series_id: seriesId, points_multiplier: 2, via: 'tournament' })]);
      const tr = await appRequest(`/api/series?tournament_id=${t}`);
      expect(tr.data.memberships).toHaveLength(1);
      expect((await appRequest('/api/series?match_id=nope')).data.memberships).toEqual([]);
    });
  });
});

describe('series refs on list endpoints', () => {
  it('GET /api/matches returns direct and tournament-inherited series, [] otherwise', async () => {
    const direct = await createMatch(gameId, modeId, { status: 'complete' });
    const plain = await createMatch(gameId, modeId, { status: 'complete' });
    const tournament = await createTournament(gameId, { game_mode_id: modeId });
    const inTournament = await createMatch(gameId, modeId, { status: 'complete', tournament_id: tournament.id });

    await insertSeries({ id: 's_a', name: 'Fall Cup' });
    await insertSeries({ id: 's_b', name: 'Winter League' });
    await linkEvent('s_a', 'match', direct.id);
    await linkEvent('s_b', 'match', direct.id);
    await linkEvent('s_a', 'tournament', tournament.id);

    const res = await appRequest('/api/matches?status=complete');
    expect(res.status).toBe(200);
    const byId = Object.fromEntries((res.data as Array<{ id: string; series: unknown }>).map((m) => [m.id, m]));
    expect((byId[direct.id].series as Array<{ name: string }>).map((s) => s.name).sort()).toEqual(['Fall Cup', 'Winter League']);
    expect(byId[inTournament.id].series).toEqual([{ id: 's_a', name: 'Fall Cup' }]);
    expect(byId[plain.id].series).toEqual([]);
    expect(byId[direct.id]).not.toHaveProperty('series_json');
  });

  it('GET /api/tournaments returns the tournament series', async () => {
    const inSeries = await createTournament(gameId, { game_mode_id: modeId });
    const plain = await createTournament(gameId, { game_mode_id: modeId });
    await insertSeries({ id: 's_c', name: 'Spring Series' });
    await linkEvent('s_c', 'tournament', inSeries.id);

    const res = await appRequest('/api/tournaments');
    expect(res.status).toBe(200);
    const byId = Object.fromEntries((res.data as Array<{ id: string; series: unknown }>).map((t) => [t.id, t]));
    expect(byId[inSeries.id].series).toEqual([{ id: 's_c', name: 'Spring Series' }]);
    expect(byId[plain.id].series).toEqual([]);
  });
});
