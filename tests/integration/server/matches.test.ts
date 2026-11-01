// @vitest-environment node
/** `/api/matches` CRUD and sub-routes (participants, teams, assign-teams, setup, map codes / notes, reminders, suggested positions). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createMatch, createTournament } from '../../utils/pg-fixtures';
import {
  discordBotRequests, discordDeletionQueue, discordMatchEditQueue, discordMatchMessages, discordSettings, matchGames,
  matchParticipants, matchTeams, matches, scorecardSubmissions, seriesEvents, series, tournamentMatches, tournamentTeams,
} from '../../../lib/db/schema';
import { getTournamentRescoreBlocker } from '@/lib/matches';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  gameId = (await createGame({ max_signups: 8 })).id;
  modeId = (await createGameMode(gameId)).id;
});

const addPlayers = async (matchId: string, n: number) => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(`${matchId}-p${i}`);
    await pg().insert(matchParticipants).values({
      id: ids[i], match_id: matchId, user_id: `u${i}`, discord_user_id: `d${i}`, username: `Player${i}`, joined_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      signup_data: { role: 'tank' },
    });
  }
  return ids;
};

describe('GET /api/matches', () => {
  it('hides completed matches by default, supports status filters, limit/offset and tournament exclusion', async () => {
    const t = await createTournament(gameId);
    await createMatch(gameId, modeId, { id: 'm-created', status: 'created', updated_at: new Date('2026-01-03') });
    await createMatch(gameId, modeId, { id: 'm-battle', status: 'battle', updated_at: new Date('2026-01-02') });
    await createMatch(gameId, modeId, { id: 'm-done', status: 'complete', updated_at: new Date('2026-01-01') });
    await createMatch(gameId, modeId, { id: 'm-t', status: 'created', tournament_id: t.id, updated_at: new Date('2026-01-04') });

    const def = await appRequest('/api/matches');
    expect(def.data.map((m: any) => m.id)).toEqual(['m-t', 'm-created', 'm-battle']);
    expect((await appRequest('/api/matches?status=complete')).data.map((m: any) => m.id)).toEqual(['m-done']);
    expect((await appRequest('/api/matches?status=created,battle')).data.map((m: any) => m.id)).toEqual(['m-t', 'm-created', 'm-battle']);
    expect((await appRequest('/api/matches?exclude_tournament=true')).data.map((m: any) => m.id)).toEqual(['m-created', 'm-battle']);
    expect((await appRequest('/api/matches?limit=1&offset=1')).data.map((m: any) => m.id)).toEqual(['m-created']);
  });

  it('returns game fields, participant counts, series refs and a working ETag', async () => {
    const m = await createMatch(gameId, modeId, { id: 'm1', maps: ['a-map'], map_codes: { 'a-map': 'XYZ' } });
    await addPlayers(m.id, 2);
    const [s] = await pg().insert(series).values({ id: 's1', name: 'Season' }).returning();
    await pg().insert(seriesEvents).values({ id: 'se1', series_id: s.id, event_type: 'match', match_id: m.id, event_order: 1 });

    const res = await appRequest('/api/matches');
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      id: 'm1', game_name: 'Test Game', participant_count: 2, maps: ['a-map'], map_codes: { 'a-map': 'XYZ' }, series: [{ id: 's1', name: 'Season' }],
      max_participants: 8, map_codes_supported: false,
    });
    const etag = res.headers.get('etag')!;
    expect(etag).toBeTruthy();
    expect((await appRequest('/api/matches', { headers: { 'if-none-match': etag } })).status).toBe(304);
    await addPlayers('m1x', 0);
    await pg().insert(matchParticipants).values({ id: 'late', match_id: 'm1', user_id: 'late', username: 'Late' });
    expect((await appRequest('/api/matches', { headers: { 'if-none-match': etag } })).status).toBe(200);
  });
});

describe('GET/PUT/DELETE /api/matches/:id', () => {
  it('404s unknown ids and rejects overlong ones', async () => {
    expect((await appRequest('/api/matches/nope')).status).toBe(404);
    expect((await appRequest(`/api/matches/${'x'.repeat(101)}`)).status).toBe(400);
  });

  it('edits a match, validates input and queues an embed edit only when an announcement exists', async () => {
    const m = await createMatch(gameId, modeId, { id: 'edit-me', status: 'gather' });
    const body = { name: '  Renamed  ', description: 'd', startDate: '2026-06-01T10:00:00.000Z', rules: 'competitive', rounds: 3, maps: ['x', 'y'], statsEnabled: true, playerNotifications: false };
    const res = await appRequest(`/api/matches/${m.id}`, { method: 'PUT', json: body });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ name: 'Renamed', description: 'd', rules: 'competitive', maps: ['x', 'y'], stats_enabled: true, player_notifications: false });
    expect(res.data.start_date).toBe('2026-06-01T10:00:00.000Z');
    expect(await pg().select().from(discordMatchEditQueue)).toHaveLength(0);

    await pg().insert(discordMatchMessages).values({ id: 'dm', match_id: m.id, message_id: 'msg', channel_id: 'chan', message_type: 'announcement' });
    await appRequest(`/api/matches/${m.id}`, { method: 'PUT', json: body });
    expect(await pg().select().from(discordMatchEditQueue)).toHaveLength(1);

    expect((await appRequest(`/api/matches/${m.id}`, { method: 'PUT', json: { ...body, name: '' } })).data.error).toBe('Name is required');
    expect((await appRequest(`/api/matches/${m.id}`, { method: 'PUT', json: { ...body, rules: 'wild' } })).status).toBe(400);
    expect((await appRequest(`/api/matches/${m.id}`, { method: 'PUT', json: { ...body, rounds: 12 } })).status).toBe(400);
    expect((await appRequest('/api/matches/none', { method: 'PUT', json: body })).status).toBe(404);
  });

  it('refuses edits once started, or when the tournament disallows editing', async () => {
    const started = await createMatch(gameId, modeId, { status: 'battle' });
    expect((await appRequest(`/api/matches/${started.id}`, { method: 'PUT', json: { name: 'x' } })).status).toBe(403);
    const t = await createTournament(gameId, { allow_match_editing: false });
    const locked = await createMatch(gameId, modeId, { status: 'created', tournament_id: t.id });
    const res = await appRequest(`/api/matches/${locked.id}`, { method: 'PUT', json: { name: 'x' } });
    expect(res.status).toBe(403);
    expect(res.data.error).toMatch(/disabled for this tournament/);
    expect((await appRequest(`/api/matches/${locked.id}`)).data.tournament_allow_match_editing).toBe(false);
  });

  it('deletes a match with all child rows and queues the Discord cleanup in the same transaction', async () => {
    const m = await createMatch(gameId, modeId, { id: 'bye', maps: ['a'] });
    await addPlayers(m.id, 2);
    await pg().insert(matchGames).values({ id: 'bye_game_1', match_id: m.id, round: 1 });
    await pg().insert(matchTeams).values({ id: 'bye-t', match_id: m.id, team_name: 'T', team_order: 0 });
    const res = await appRequest(`/api/matches/${m.id}`, { method: 'DELETE' });
    expect(res.data).toEqual({ success: true });
    expect(await pg().select().from(matches).where(eq(matches.id, m.id))).toHaveLength(0);
    expect(await pg().select().from(matchParticipants)).toHaveLength(0);
    expect(await pg().select().from(matchGames)).toHaveLength(0);
    expect(await pg().select().from(matchTeams)).toHaveLength(0);
    expect(await pg().select().from(discordDeletionQueue).where(eq(discordDeletionQueue.match_id, 'bye'))).toHaveLength(1);
    expect((await appRequest(`/api/matches/${m.id}`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('participants, teams and setup', () => {
  it('lists participants in signup order with a derived team_assignment', async () => {
    const m = await createMatch(gameId, modeId, { id: 'p', status: 'assign' });
    const ids = await addPlayers(m.id, 3);
    await appRequest(`/api/matches/${m.id}/teams`); // lazily creates Blue / Red / Reserve
    const teams = await pg().select().from(matchTeams).where(eq(matchTeams.match_id, m.id)).orderBy(asc(matchTeams.team_order));
    await pg().update(matchParticipants).set({ team_id: teams[0].id }).where(eq(matchParticipants.id, ids[0]));
    await pg().update(matchParticipants).set({ team_id: teams[1].id }).where(eq(matchParticipants.id, ids[1]));
    const res = await appRequest(`/api/matches/${m.id}/participants`);
    expect(res.data.participants.map((p: any) => [p.username, p.team_assignment])).toEqual([['Player0', 'blue'], ['Player1', 'red'], ['Player2', null]]);
    expect(res.data.participants[0]).toMatchObject({ signup_data: { role: 'tank' }, receives_map_codes: false });
    expect(res.data.signupConfig).toBeNull();
    expect((await appRequest('/api/matches/zzz/participants')).status).toBe(404);
  });

  it('creates missing teams lazily only in assign/battle', async () => {
    const early = await createMatch(gameId, modeId, { status: 'gather' });
    expect((await appRequest(`/api/matches/${early.id}/teams`)).data.teams).toEqual([]);
    const assign = await createMatch(gameId, modeId, { status: 'assign' });
    const res = await appRequest(`/api/matches/${assign.id}/teams`);
    expect(res.data.teams.map((t: any) => [t.team_name, t.is_reserve])).toEqual([['Blue', false], ['Red', false], ['Reserve', true]]);
    expect((await appRequest(`/api/matches/${assign.id}/teams`)).data.teams).toHaveLength(3); // idempotent
    expect((await appRequest(`/api/matches/${'x'.repeat(101)}/teams`)).status).toBe(400);
  });

  describe('assign-teams', () => {
    async function assignable() {
      const m = await createMatch(gameId, modeId, { id: 'a', status: 'assign' });
      const ids = await addPlayers(m.id, 3);
      const teams = (await appRequest(`/api/matches/${m.id}/teams`)).data.teams as Array<{ id: string }>;
      return { m, ids, teams };
    }
    const assign = (matchId: string, json: unknown) => appRequest(`/api/matches/${matchId}/assign-teams`, { method: 'POST', json });

    it('assigns by team id and by legacy name, and stores commander flags', async () => {
      const { m, ids, teams } = await assignable();
      const res = await assign(m.id, { teamAssignments: [
        { participantId: ids[0], teamId: teams[0].id, receives_map_codes: true },
        { participantId: ids[1], team: 'red' },
        { participantId: ids[2], team: 'reserve' },
      ] });
      expect(res.data).toEqual({ success: true });
      const rows = await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, m.id)).orderBy(asc(matchParticipants.id));
      expect(rows.map((r) => r.team_id)).toEqual([teams[0].id, teams[1].id, teams[2].id]);
      expect(rows[0].receives_map_codes).toBe(true);
    });

    it('is all-or-nothing and validates everything first', async () => {
      const { m, ids, teams } = await assignable();
      const bad = await assign(m.id, { teamAssignments: [{ participantId: ids[0], teamId: teams[0].id }, { participantId: 'ghost', teamId: teams[1].id }] });
      expect(bad.status).toBe(400);
      expect((await pg().select().from(matchParticipants).where(eq(matchParticipants.id, ids[0])))[0].team_id).toBeNull();
      expect((await assign(m.id, { teamAssignments: [{ participantId: ids[0], teamId: 'foreign' }] })).data.error).toMatch(/does not belong to match/);
      expect((await assign(m.id, { teamAssignments: [{ participantId: ids[0], team: 'green' }] })).data.error).toMatch(/Invalid legacy team/);
      expect((await assign(m.id, { teamAssignments: [{ participantId: ids[0] }] })).data.error).toMatch(/missing teamId or team/);
      expect((await assign(m.id, { teamAssignments: 'nope' })).status).toBe(400);
      expect((await assign('none', { teamAssignments: [] })).status).toBe(404);
    });

    it('only works in gather/assign, writes voice channels and queues commander DMs for changes only', async () => {
      await pg().insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't', commander_dm_enabled: true });
      const { m, ids, teams } = await assignable();
      const first = { teamAssignments: [{ participantId: ids[0], teamId: teams[0].id, receives_map_codes: true }], teamVoiceChannels: [{ teamId: teams[0].id, channelId: 'vc1' }] };
      expect((await assign(m.id, first)).status).toBe(200);
      expect((await pg().select().from(matchTeams).where(eq(matchTeams.id, teams[0].id)))[0].voice_channel_id).toBe('vc1');
      expect(await pg().select().from(discordBotRequests)).toHaveLength(1);
      await assign(m.id, first); // nothing changed -> no second DM
      expect(await pg().select().from(discordBotRequests)).toHaveLength(1);
      // legacy blue/red voice fields map onto the first two teams
      await assign(m.id, { teamAssignments: [], redTeamVoiceChannel: 'vc-red' });
      expect((await pg().select().from(matchTeams).where(eq(matchTeams.id, teams[1].id)))[0].voice_channel_id).toBe('vc-red');

      await pg().update(matches).set({ status: 'battle' }).where(eq(matches.id, m.id));
      expect((await assign(m.id, first)).status).toBe(409);
    });
  });

  it('persists racing setup (grid order and qualifying times) and checks status and ownership', async () => {
    const m = await createMatch(gameId, modeId, { id: 'race', status: 'gather' });
    const ids = await addPlayers(m.id, 3);
    const put = (json: unknown) => appRequest(`/api/matches/${m.id}/setup`, { method: 'PUT', json });
    expect((await put({})).data.error).toBe('Nothing to save');
    expect((await put({ gridOrder: [ids[2], ids[0]], qualifyingTimes: { [ids[2]]: 61234.4, [ids[0]]: null } })).status).toBe(200);
    const get = await appRequest(`/api/matches/${m.id}/setup`);
    expect(get.data.participants.map((p: any) => [p.id, p.grid_position, p.qualifying_time_ms])).toEqual([[ids[2], 1, 61234], [ids[0], 2, null], [ids[1], null, null]]);
    expect((await put({ gridOrder: [ids[0], ids[0]] })).data.error).toMatch(/duplicate/);
    expect((await put({ gridOrder: ['ghost'] })).data.error).toMatch(/do not belong/);
    expect((await put({ gridOrder: 'x' })).status).toBe(400);
    expect((await put({ qualifyingTimes: { [ids[0]]: -1 } })).status).toBe(400);
    expect((await put({ qualifyingTimes: [] })).status).toBe(400);
    expect((await appRequest('/api/matches/none/setup')).status).toBe(404);
    await pg().update(matches).set({ status: 'battle' }).where(eq(matches.id, m.id));
    expect((await put({ gridOrder: [ids[0]] })).status).toBe(409);
  });
});

describe('maps', () => {
  it('stores and returns map codes (max 24 characters each)', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await appRequest(`/api/matches/${m.id}/map-codes`)).data).toEqual({ mapCodes: {} });
    expect((await appRequest(`/api/matches/${m.id}/map-codes`, { method: 'POST', json: { mapCodes: { a: 'CODE1' } } })).data).toEqual({ success: true, mapCodes: { a: 'CODE1' } });
    expect((await appRequest(`/api/matches/${m.id}/map-codes`)).data).toEqual({ mapCodes: { a: 'CODE1' } });
    expect((await appRequest(`/api/matches/${m.id}/map-codes`, { method: 'POST', json: { mapCodes: { a: 'x'.repeat(25) } } })).status).toBe(400);
    expect((await appRequest(`/api/matches/${m.id}/map-codes`, { method: 'POST', json: {} })).status).toBe(400);
    expect((await appRequest('/api/matches/none/map-codes', { method: 'POST', json: { mapCodes: {} } })).status).toBe(404);
    expect((await appRequest('/api/matches/none/map-codes')).status).toBe(404);
  });

  it('keeps one temporary note per map before the games exist and folds them in when the games are created', async () => {
    const m = await createMatch(gameId, modeId, { id: 'n', maps: ['m1', 'm2'], status: 'assign' });
    const note = (mapId: string, text: string) => appRequest(`/api/matches/${m.id}/map-notes`, { method: 'POST', json: { mapId, note: text } });
    expect((await note('m1', 'first')).status).toBe(200);
    expect((await note('m2', 'second')).status).toBe(200); // two note-only rows must not collide on (match, round)
    expect((await note('m1', 'first v2')).status).toBe(200);
    expect((await appRequest(`/api/matches/${m.id}/map-notes`)).data.notes).toEqual({ m1: 'first v2', m2: 'second' });
    expect((await note('', 'x')).status).toBe(400);
    expect((await note('m1', 'x'.repeat(65))).status).toBe(400);
    expect((await appRequest('/api/matches/none/map-notes', { method: 'POST', json: { mapId: 'm1' } })).status).toBe(404);

    await appRequest(`/api/matches/${m.id}/transition`, { method: 'POST', json: { newStatus: 'battle' } });
    const games_ = await pg().select().from(matchGames).where(eq(matchGames.match_id, m.id)).orderBy(asc(matchGames.round));
    expect(games_.map((g) => [g.round, g.notes])).toEqual([[1, 'first v2'], [2, 'second']]);
    await note('m2', 'edited');
    expect((await appRequest(`/api/matches/${m.id}/map-notes`)).data.notes.m2).toBe('edited');
  });

  it('lazily initialises games on GET /games and survives matches without maps', async () => {
    const m = await createMatch(gameId, modeId, { id: 'lazy', maps: ['a', 'b'] });
    const res = await appRequest(`/api/matches/${m.id}/games`);
    expect(res.data.games.map((g: any) => [g.round, g.status, g.map_id])).toEqual([[1, 'ongoing', 'a'], [2, 'pending', 'b']]);
    const none = await createMatch(gameId, modeId, { id: 'nomaps' });
    expect((await appRequest(`/api/matches/${none.id}/games`)).data).toEqual({ success: true, games: [] });
  });
});

describe('reminders and suggested positions', () => {
  it('lists the configured timed announcements, newest first, with their status', async () => {
    const start = new Date(Date.now() + 3 * 3600 * 1000);
    const m = await createMatch(gameId, modeId, {
      id: 'rem', start_date: start, start_time: start,
      announcements: [{ id: 'a1', value: 1, unit: 'hours' }, { id: 'a2', value: 2, unit: 'hours' }],
    });
    const res = await appRequest(`/api/matches/${m.id}/reminders`);
    expect(res.data.reminderCount).toBe(2);
    expect(res.data.reminders.map((r: any) => r.timing)).toEqual([{ value: 1, unit: 'hours' }, { value: 2, unit: 'hours' }]);
    expect(res.data.reminders[0]).toMatchObject({ status: 'pending', description: '1 hours before start', type: 'timed_announcement' });
    expect(res.data.match).toMatchObject({ id: 'rem', player_notifications: true });
    expect((await appRequest('/api/matches/none/reminders')).status).toBe(404);
    const plain = await createMatch(gameId, modeId);
    expect((await appRequest(`/api/matches/${plain.id}/reminders`)).data.reminders).toEqual([]);
  });

  it('returns the newest approved AI position suggestion and ignores junk', async () => {
    const m = await createMatch(gameId, modeId, { id: 'sp' });
    await pg().insert(matchGames).values({ id: 'sp_game_1', match_id: m.id, round: 1 });
    const sub = (id: string, over: Partial<typeof scorecardSubmissions.$inferInsert>) =>
      pg().insert(scorecardSubmissions).values({ id, match_id: m.id, match_game_id: 'sp_game_1', team_side: 'blue', screenshot_url: '/x', ...over });
    await sub('old', { review_status: 'approved', suggested_positions: { a: 2, b: 1 }, created_at: new Date('2026-01-01') });
    await sub('junk', { review_status: 'approved', suggested_positions: { a: 'first', b: 0, c: 1.5 }, created_at: new Date('2026-01-03') });
    await sub('pending', { review_status: 'pending', suggested_positions: { z: 1 }, created_at: new Date('2026-01-04') });
    expect((await appRequest(`/api/matches/${m.id}/games/sp_game_1/suggested-positions`)).data).toEqual({ suggestions: { a: 2, b: 1 } });
    expect((await appRequest(`/api/matches/${m.id}/games/nope/suggested-positions`)).status).toBe(404);
  });
});

describe('tournament rescore guard', () => {
  it('blocks rescoring once the bracket advanced or the tournament finished', async () => {
    const t = await createTournament(gameId, { status: 'battle' });
    const [teamA, teamB] = await pg().insert(tournamentTeams).values([
      { id: 'ta', tournament_id: t.id, team_name: 'A' }, { id: 'tb', tournament_id: t.id, team_name: 'B' },
    ]).returning();
    const first = await createMatch(gameId, modeId, { id: 'r1', tournament_id: t.id, status: 'complete' });
    const next = await createMatch(gameId, modeId, { id: 'r2', tournament_id: t.id });
    await pg().insert(tournamentMatches).values({ match_id: first.id, tournament_id: t.id, round: 1, bracket_type: 'winners', team1_id: teamA.id, team2_id: teamB.id, match_order: 1, created_at: new Date('2026-01-01') });
    expect(await getTournamentRescoreBlocker(pg(), first.id)).toBeNull();
    await pg().insert(tournamentMatches).values({ match_id: next.id, tournament_id: t.id, round: 2, bracket_type: 'winners', team1_id: teamA.id, match_order: 1, created_at: new Date('2026-01-02') });
    expect(await getTournamentRescoreBlocker(pg(), first.id)).toMatch(/already advanced/);
    expect(await getTournamentRescoreBlocker(pg(), 'standalone')).toBeNull();
    const done = await createTournament(gameId, { status: 'complete' });
    const m = await createMatch(gameId, modeId, { id: 'r3', tournament_id: done.id });
    expect(await getTournamentRescoreBlocker(pg(), m.id)).toMatch(/tournament is complete/);
  });
});

