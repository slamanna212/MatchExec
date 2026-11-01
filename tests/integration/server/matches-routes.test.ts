// @vitest-environment node
/**
 * `/api/matches/**` route behaviour on Postgres, case by case (ported from the old per-route suites: matches, participants,
 * transitions, cancel flow, sub-routes, score/notes routes, game-result routes, result validation, assign-teams and
 * suggested positions). The denser end-to-end flows live in matches.test.ts and match-lifecycle.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createMatch, createTournament } from '../../utils/pg-fixtures';
import {
  discordBotRequests, discordDeletionQueue, discordSettings, discordAnnouncementQueue, matchGamePlacements, matchGames, matchParticipants,
  matchTeams, matches, scorecardSubmissions, tournamentMatches, tournamentTeams, discordScoreNotificationQueue,
} from '../../../lib/db/schema';
import { createMatchTeams, getMatchTeams } from '@/lib/matches';
import { db } from '../../../lib/db';

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

const json = (path: string, method: string, body?: unknown) => appRequest(path, { method, json: body });
const transition = (id: string, newStatus: string, force?: boolean) => json(`/api/matches/${id}/transition`, 'POST', { newStatus, force });
let pseq = 0;
const player = async (matchId: string, extra: Partial<typeof matchParticipants.$inferInsert> = {}) => {
  const n = ++pseq;
  const [row] = await pg().insert(matchParticipants).values({ id: `p${n}`, match_id: matchId, user_id: `user-${n}`, discord_user_id: `user-${n}`, username: `Player ${n}`, ...extra }).returning();
  return row;
};
const normalTeams = async (matchId: string) => {
  await createMatchTeams(db, matchId);
  return getMatchTeams(db, matchId);
};
/** A battle-ready Normal match with its two teams and a first game. */
async function battle(extra: Partial<Parameters<typeof createMatch>[2]> = {}, mode = modeId) {
  const m = await createMatch(gameId, mode, { status: 'battle', ...extra });
  const teams = await normalTeams(m.id);
  const gId = `${m.id}_game_1`;
  await pg().insert(matchGames).values({ id: gId, match_id: m.id, round: 1, status: 'ongoing' });
  await pg().insert(matchGames).values({ id: `${m.id}_game_2`, match_id: m.id, round: 2, status: 'pending' });
  return { m, gId, blue: teams[0], red: teams[1], reserve: teams[2] };
}
const result = (matchId: string, gId: string, body: unknown) => json(`/api/matches/${matchId}/games/${gId}/result`, 'POST', body);

describe('GET /api/matches', () => {
  it('returns an empty array when no matches exist', async () => {
    const res = await appRequest('/api/matches');
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  it('hides complete matches by default and filters to them with status=complete', async () => {
    await createMatch(gameId, modeId, { id: 'a', status: 'created' });
    await createMatch(gameId, modeId, { id: 'b', status: 'gather' });
    await createMatch(gameId, modeId, { id: 'c', status: 'complete' });
    const all = await appRequest('/api/matches');
    expect(all.data).toHaveLength(2);
    expect(all.data.map((m: any) => m.status)).not.toContain('complete');
    const done = await appRequest('/api/matches?status=complete');
    expect(done.data.map((m: any) => m.id)).toEqual(['c']);
  });

  it('accepts a repeated status parameter as well as a comma-separated one', async () => {
    await createMatch(gameId, modeId, { id: 'a', status: 'created', updated_at: new Date('2026-01-02') });
    await createMatch(gameId, modeId, { id: 'b', status: 'gather', updated_at: new Date('2026-01-01') });
    await createMatch(gameId, modeId, { id: 'c', status: 'battle' });
    const res = await appRequest('/api/matches?status=created&status=gather');
    expect(res.data.map((m: any) => m.id)).toEqual(['a', 'b']);
    const spaced = await appRequest('/api/matches?status=created, gather');
    expect(spaced.data.map((m: any) => m.id)).toEqual(['a', 'b']);
  });
});

describe('POST /api/matches', () => {
  it('creates a match with valid data', async () => {
    const res = await json('/api/matches', 'POST', { name: 'Test Match', gameId, description: 'A test match', rounds: 3, startDate: new Date().toISOString() });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ name: 'Test Match', game_id: gameId, status: 'created', description: 'A test match', rounds: 3 });
    expect(res.data.id).toBeTruthy();
    expect(await pg().select().from(matches).where(eq(matches.id, res.data.id))).toHaveLength(1);
  });

  it('rejects missing required fields', async () => {
    const res = await json('/api/matches', 'POST', { description: 'Missing name and gameId' });
    expect(res.status).toBe(400);
    expect(await pg().select().from(matches)).toHaveLength(0);
  });

  it('refuses an unknown game now that foreign keys are enforced, and stores nothing', async () => {
    const res = await json('/api/matches', 'POST', { name: 'Test Match', gameId: 'invalid-game-id', startDate: new Date().toISOString() });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await pg().select().from(matches)).toHaveLength(0);
  });

  it('rejects malformed JSON bodies without a 2xx', async () => {
    const res = await appRequest('/api/matches', { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('GET /api/matches/:id', () => {
  it('returns the match details', async () => {
    await createMatch(gameId, modeId, { id: 'match-1', name: 'Test Match' });
    const res = await appRequest('/api/matches/match-1');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ id: 'match-1', name: 'Test Match', game_id: gameId });
  });

  it('defaults maps, map_codes and the editing flag for matches without them', async () => {
    await createMatch(gameId, modeId, { id: 'bare' });
    const res = await appRequest('/api/matches/bare');
    expect(res.data).toMatchObject({ maps: [], map_codes: {}, map_codes_supported: false, tournament_allow_match_editing: true, scoring_type: 'Normal' });
  });

  it('returns 404 for a non-existent match', async () => {
    expect((await appRequest('/api/matches/nonexistent')).status).toBe(404);
  });
});

describe('PUT /api/matches/:id', () => {
  const put = (id: string, body: unknown) => json(`/api/matches/${id}`, 'PUT', body);

  it('updates the match fields', async () => {
    await createMatch(gameId, modeId, { id: 'put-1', name: 'Original Name' });
    const res = await put('put-1', { name: 'Updated Name', rounds: 5, startDate: new Date().toISOString() });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ name: 'Updated Name', rounds: 5 });
    expect((await pg().select().from(matches).where(eq(matches.id, 'put-1')))[0]).toMatchObject({ name: 'Updated Name', rounds: 5 });
  });

  it('returns 404 for a non-existent match', async () => {
    expect((await put('nonexistent', { name: 'Test' })).status).toBe(404);
  });

  it('returns 403 once the match is in battle, complete or cancelled', async () => {
    for (const status of ['battle', 'complete', 'cancelled'] as const) {
      const m = await createMatch(gameId, modeId, { status });
      expect((await put(m.id, { name: 'Try Update' })).status).toBe(403);
    }
  });

  it('returns 400 for an empty or whitespace name', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await put(m.id, { name: '' })).status).toBe(400);
    expect((await put(m.id, { name: '   ' })).status).toBe(400);
    expect((await put(m.id, {})).status).toBe(400);
  });

  it('returns 400 when rounds is out of range or the date is invalid', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await put(m.id, { name: 'Valid Name', rounds: 99 })).status).toBe(400);
    expect((await put(m.id, { name: 'Valid Name', startDate: 'garbage' })).status).toBe(400);
    expect((await pg().select().from(matches).where(eq(matches.id, m.id)))[0].name).toBe('Test Match');
  });

  it('persists the maps array', async () => {
    const m = await createMatch(gameId, modeId, { id: 'maps' });
    const res = await put(m.id, { name: 'Maps Match', maps: ['map1', 'map2'], startDate: new Date().toISOString() });
    expect(res.status).toBe(200);
    expect((await pg().select().from(matches).where(eq(matches.id, m.id)))[0].maps).toEqual(['map1', 'map2']);
    expect((await appRequest(`/api/matches/${m.id}`)).data.maps).toEqual(['map1', 'map2']);
  });
});

describe('DELETE /api/matches/:id', () => {
  it('deletes an existing match', async () => {
    await createMatch(gameId, modeId, { id: 'match-1' });
    const res = await json('/api/matches/match-1', 'DELETE');
    expect(res.status).toBe(200);
    expect(await pg().select().from(matches).where(eq(matches.id, 'match-1'))).toHaveLength(0);
  });

  it('returns 404 for a non-existent match', async () => {
    expect((await json('/api/matches/nonexistent', 'DELETE')).status).toBe(404);
  });
});

describe('GET /api/matches/:id/participants', () => {
  it('returns an empty list when nobody signed up', async () => {
    const m = await createMatch(gameId, modeId);
    const res = await appRequest(`/api/matches/${m.id}/participants`);
    expect(res.status).toBe(200);
    expect(res.data.participants).toEqual([]);
  });

  it('returns all participants in signup order', async () => {
    const m = await createMatch(gameId, modeId);
    await player(m.id, { id: 'p1', discord_user_id: 'user-1', joined_at: new Date('2026-01-01T00:00:00Z') });
    await player(m.id, { id: 'p2', discord_user_id: 'user-2', joined_at: new Date('2026-01-01T00:00:01Z') });
    const res = await appRequest(`/api/matches/${m.id}/participants`);
    expect(res.data.participants.map((p: any) => p.discord_user_id)).toEqual(['user-1', 'user-2']);
  });

  it('returns 404 for a non-existent match', async () => {
    expect((await appRequest('/api/matches/nonexistent/participants')).status).toBe(404);
  });

  it('includes the derived team assignment', async () => {
    const m = await createMatch(gameId, modeId, { status: 'assign' });
    const [blue, red] = await normalTeams(m.id);
    await player(m.id, { id: 'p1', team_id: blue.id, joined_at: new Date('2026-01-01T00:00:00Z') });
    await player(m.id, { id: 'p2', team_id: red.id, joined_at: new Date('2026-01-01T00:00:01Z') });
    const res = await appRequest(`/api/matches/${m.id}/participants`);
    expect(res.data.participants.map((p: any) => p.team_assignment)).toEqual(['blue', 'red']);
  });

  it('includes the signup data', async () => {
    const m = await createMatch(gameId, modeId);
    await player(m.id, { signup_data: { role: 'Tank', rank: 'Gold' } });
    const res = await appRequest(`/api/matches/${m.id}/participants`);
    expect(res.data.participants[0].signup_data).toEqual({ role: 'Tank', rank: 'Gold' });
  });
});

describe('POST /api/matches/:id/transition', () => {
  it('moves a match to the next status and returns it', async () => {
    const m = await createMatch(gameId, modeId, { id: 'match-1' });
    const res = await transition(m.id, 'gather');
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('gather');
  });

  it('rejects an invalid or missing status', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await transition(m.id, 'invalid-status')).status).toBe(400);
    expect((await json(`/api/matches/${m.id}/transition`, 'POST', {})).status).toBe(400);
  });

  it('rejects a backwards transition', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    expect((await transition(m.id, 'gather')).status).toBe(400);
  });

  it('allows cancelling from created, gather, assign and battle', async () => {
    for (const status of ['created', 'gather', 'assign', 'battle'] as const) {
      const m = await createMatch(gameId, modeId, { status });
      const res = await transition(m.id, 'cancelled');
      expect([res.status, res.data.status]).toEqual([200, 'cancelled']);
    }
  });

  it('returns 404 for a non-existent match', async () => {
    expect((await transition('nonexistent', 'gather')).status).toBe(404);
  });

  it('refuses to complete while maps are unscored, unless forced', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    await pg().insert(matchGames).values({ id: 'game-1', match_id: m.id, round: 1, status: 'pending' });
    expect((await transition(m.id, 'complete')).status).toBe(400);
    const forced = await transition(m.id, 'complete', true);
    expect([forced.status, forced.data.status]).toEqual([200, 'complete']);
  });

  it('completes a match whose maps are all scored', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    await pg().insert(matchGames).values({ id: 'game-1', match_id: m.id, round: 1, status: 'completed' });
    const res = await transition(m.id, 'complete');
    expect([res.status, res.data.status]).toEqual([200, 'complete']);
  });

  it.each([
    ['created', 'gather'], ['created', 'cancelled'], ['gather', 'assign'], ['gather', 'cancelled'], ['assign', 'battle'], ['assign', 'cancelled'],
  ])('allows %s -> %s', async (from, to) => {
    const m = await createMatch(gameId, modeId, { status: from as never });
    const res = await transition(m.id, to);
    expect([res.status, res.data.status]).toEqual([200, to]);
  });

  it.each([['created', 'assign'], ['created', 'battle'], ['gather', 'battle'], ['assign', 'complete'], ['battle', 'gather']])('rejects %s -> %s even with force', async (from, to) => {
    const m = await createMatch(gameId, modeId, { status: from as never });
    expect((await transition(m.id, to, true)).status).toBe(400);
  });

  it('rejects same-status transitions and treats complete and cancelled as terminal', async () => {
    const g = await createMatch(gameId, modeId, { status: 'gather' });
    expect((await transition(g.id, 'gather')).status).toBe(400);
    for (const from of ['complete', 'cancelled'] as const) {
      const m = await createMatch(gameId, modeId, { status: from });
      expect((await transition(m.id, 'cancelled')).status).toBe(400);
      expect((await transition(m.id, 'complete', true)).status).toBe(400);
    }
  });

  it('does not fire the completion side effects twice', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    expect((await transition(m.id, 'complete', true)).status).toBe(200);
    expect((await transition(m.id, 'complete', true)).status).toBe(400);
    expect(await pg().select().from(discordDeletionQueue).where(eq(discordDeletionQueue.match_id, m.id))).toHaveLength(1);
  });
});

describe('match cancel flow', () => {
  async function newMatch() {
    const res = await json('/api/matches', 'POST', { name: 'Cancel Match', gameId, startDate: new Date().toISOString() });
    return res.data.id as string;
  }

  it('cancels from gather, persists the status and queues the Discord cleanup', async () => {
    const id = await newMatch();
    await transition(id, 'gather');
    const res = await transition(id, 'cancelled');
    expect([res.status, res.data.status]).toEqual([200, 'cancelled']);
    expect((await pg().select().from(matches).where(eq(matches.id, id)))[0].status).toBe('cancelled');
    expect(await pg().select().from(discordDeletionQueue).where(eq(discordDeletionQueue.match_id, id))).toHaveLength(1);
  });

  it('cancels from assign (with deletion) and from battle', async () => {
    const a = await newMatch();
    await transition(a, 'gather');
    await transition(a, 'assign');
    expect((await transition(a, 'cancelled')).data.status).toBe('cancelled');
    expect(await pg().select().from(discordDeletionQueue).where(eq(discordDeletionQueue.match_id, a))).toHaveLength(1);
    const b = await newMatch();
    for (const s of ['gather', 'assign', 'battle']) await transition(b, s);
    expect((await transition(b, 'cancelled')).data.status).toBe('cancelled');
  });

  it('cancels straight from created without any announcement being queued', async () => {
    const id = await newMatch();
    expect((await transition(id, 'cancelled')).data.status).toBe('cancelled');
    expect(await pg().select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.match_id, id))).toHaveLength(0);
  });

  it('a cancelled match stays cancelled: no way back to any status', async () => {
    const id = await newMatch();
    await transition(id, 'gather');
    await transition(id, 'cancelled');
    for (const to of ['created', 'gather', 'assign', 'battle', 'complete']) expect((await transition(id, to)).status).toBe(400);
    expect((await pg().select().from(matches).where(eq(matches.id, id)))[0].status).toBe('cancelled');
  });
});

describe('full lifecycle through the API', () => {
  it('walks created -> gather -> assign -> battle -> scored -> complete', async () => {
    const mapId = 'lifecycle-map';
    const { gameMaps } = await import('../../../lib/db/schema');
    await pg().insert(gameMaps).values({ id: mapId, game_id: gameId, mode_id: modeId, name: 'Lifecycle Map' });
    const created = await json('/api/matches', 'POST', { name: 'Lifecycle Match', gameId, rounds: 1, maps: [mapId], startDate: new Date().toISOString() });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe('created');
    const id = created.data.id as string;

    expect((await transition(id, 'gather')).data.status).toBe('gather');
    expect(await pg().select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.match_id, id))).toHaveLength(1);

    const p1 = await player(id);
    const p2 = await player(id);
    expect((await transition(id, 'assign')).data.status).toBe('assign');
    const assigned = await json(`/api/matches/${id}/assign-teams`, 'POST', { teamAssignments: [{ participantId: p1.id, team: 'blue' }, { participantId: p2.id, team: 'red' }] });
    expect(assigned.data).toEqual({ success: true });
    const listed = (await appRequest(`/api/matches/${id}/participants`)).data.participants as Array<{ id: string; team_assignment: string }>;
    expect(listed.find((p) => p.id === p1.id)?.team_assignment).toBe('blue');

    const battleRes = await transition(id, 'battle');
    expect(battleRes.data.status).toBe('battle');
    const gameRows = await pg().select().from(matchGames).where(eq(matchGames.match_id, id));
    expect(gameRows).toHaveLength(1);
    expect(gameRows[0].round).toBe(1);

    const gId = `${id}_game_1`;
    const scored = await result(id, gId, { matchId: id, gameId: gId, winner: 'team1', completedAt: new Date().toISOString() });
    expect(scored.data.success).toBe(true);
    expect((await pg().select().from(matchGames).where(eq(matchGames.id, gId)))[0].status).toBe('completed');

    // scoring the only map auto-completes the match (once)
    expect((await pg().select().from(matches).where(eq(matches.id, id)))[0].status).toBe('complete');
    expect((await transition(id, 'complete')).status).toBe(400);
    expect(await pg().select().from(discordDeletionQueue).where(eq(discordDeletionQueue.match_id, id))).toHaveLength(1);

    const final = await appRequest(`/api/matches/${id}`);
    expect(final.data.status).toBe('complete');
    expect(final.data).toHaveProperty('winner_team');
    expect(final.data.winner_team).toBeTruthy();
  });

  it('a completed match drops out of the default list', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    expect((await appRequest('/api/matches')).data).toHaveLength(1);
    await transition(m.id, 'complete', true);
    expect((await appRequest('/api/matches')).data).toHaveLength(0);
  });
});

describe('POST /api/matches/:id/assign-teams', () => {
  const assign = (id: string, body: unknown) => json(`/api/matches/${id}/assign-teams`, 'POST', body);
  async function setup(status: 'assign' | 'battle' = 'assign') {
    const m = await createMatch(gameId, modeId, { status });
    const [blue, red, reserve] = await normalTeams(m.id);
    return { m, blue, red, reserve };
  }
  const teamRow = async (id: string) => (await pg().select().from(matchTeams).where(eq(matchTeams.id, id)))[0];

  it('returns 400 when teamAssignments is missing or not an array', async () => {
    const { m } = await setup();
    expect((await assign(m.id, {})).status).toBe(400);
    expect((await assign(m.id, { teamAssignments: 'invalid' })).status).toBe(400);
  });

  it('accepts an empty assignment list', async () => {
    const { m } = await setup();
    expect((await assign(m.id, { teamAssignments: [] })).status).toBe(200);
  });

  it('assigns by legacy name and stores the map-code flag', async () => {
    const { m, blue } = await setup();
    const p = await player(m.id);
    const res = await assign(m.id, { teamAssignments: [{ participantId: p.id, team: 'blue', receives_map_codes: true }], blueTeamVoiceChannel: 'vc-blue', redTeamVoiceChannel: 'vc-red' });
    expect(res.data).toEqual({ success: true });
    const row = (await pg().select().from(matchParticipants).where(eq(matchParticipants.id, p.id)))[0];
    expect([row.team_id, row.receives_map_codes]).toEqual([blue.id, true]);
    // legacy blue/red voice fields land on the first two teams
    expect((await teamRow(blue.id)).voice_channel_id).toBe('vc-blue');
  });

  it('fails for an invalid team value and assigns nothing', async () => {
    const { m } = await setup();
    const p = await player(m.id);
    const res = await assign(m.id, { teamAssignments: [{ participantId: p.id, team: 'invalid-team' }] });
    expect(res.status).toBe(400);
    expect((await pg().select().from(matchParticipants).where(eq(matchParticipants.id, p.id)))[0].team_id).toBeNull();
  });

  it('keeps the voice channels when the voice fields are absent', async () => {
    const { m, blue } = await setup();
    await pg().update(matchTeams).set({ voice_channel_id: 'vc-1' }).where(eq(matchTeams.id, blue.id));
    const p = await player(m.id);
    expect((await assign(m.id, { teamAssignments: [{ participantId: p.id, teamId: blue.id }] })).status).toBe(200);
    expect((await teamRow(blue.id)).voice_channel_id).toBe('vc-1');
  });

  it('writes voice channels when provided and puts each participant on their team', async () => {
    const { m, blue, red, reserve } = await setup();
    const [p1, p2, p3] = [await player(m.id), await player(m.id), await player(m.id)];
    const res = await assign(m.id, {
      teamAssignments: [{ participantId: p1.id, teamId: blue.id }, { participantId: p2.id, teamId: red.id }, { participantId: p3.id, teamId: reserve.id }],
      teamVoiceChannels: [{ teamId: red.id, channelId: 'vc-red' }],
    });
    expect(res.status).toBe(200);
    const rows = await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, m.id)).orderBy(asc(matchParticipants.id));
    expect(rows.map((r) => r.team_id)).toEqual([blue.id, red.id, reserve.id]);
    expect((await teamRow(red.id)).voice_channel_id).toBe('vc-red');
  });

  it('rejects a team of another match with 400 and writes nothing', async () => {
    const a = await setup();
    const b = await setup();
    const p1 = await player(a.m.id);
    const p2 = await player(a.m.id);
    const res = await assign(a.m.id, { teamAssignments: [{ participantId: p1.id, teamId: a.blue.id }, { participantId: p2.id, teamId: b.blue.id }] });
    expect(res.status).toBe(400);
    expect((await pg().select().from(matchParticipants).where(eq(matchParticipants.id, p1.id)))[0].team_id).toBeNull();
  });

  it('rejects a foreign team in teamVoiceChannels and does not save the assignments', async () => {
    const a = await setup();
    const b = await setup();
    const p1 = await player(a.m.id);
    const res = await assign(a.m.id, { teamAssignments: [{ participantId: p1.id, teamId: a.blue.id }], teamVoiceChannels: [{ teamId: b.blue.id, channelId: 'x' }] });
    expect(res.status).toBe(400);
    expect((await pg().select().from(matchParticipants).where(eq(matchParticipants.id, p1.id)))[0].team_id).toBeNull();
    expect((await teamRow(b.blue.id)).voice_channel_id).toBeNull();
  });

  it('gates on the match status (409 once in battle)', async () => {
    const { m, blue } = await setup('battle');
    const p = await player(m.id);
    expect((await assign(m.id, { teamAssignments: [{ participantId: p.id, teamId: blue.id }] })).status).toBe(409);
  });

  it('queues commander DMs only for changes, labelled with the team name', async () => {
    await pg().insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't', commander_dm_enabled: true });
    const { m, blue } = await setup();
    const p = await player(m.id);
    const body = { teamAssignments: [{ participantId: p.id, teamId: blue.id, receives_map_codes: true }] };
    await assign(m.id, body);
    await assign(m.id, body);
    const reqs = (await pg().select().from(discordBotRequests)).filter((r) => r.type === 'commander_dm');
    expect(reqs).toHaveLength(1);
    expect((reqs[0].data as { team: string }).team).toBe('Blue');
  });
});

describe('GET /api/matches/:id/teams', () => {
  it('lazily creates teams for a match in battle', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    const res = await appRequest(`/api/matches/${m.id}/teams`);
    expect(res.data.teams.filter((t: any) => !t.is_reserve)).toHaveLength(2);
  });
});

describe('GET/PUT /api/matches/:id/setup', () => {
  it('persists and reloads grid order and qualifying times', async () => {
    const m = await createMatch(gameId, modeId, { status: 'assign' });
    const a = await player(m.id);
    const b = await player(m.id);
    const put = await json(`/api/matches/${m.id}/setup`, 'PUT', { gridOrder: [b.id, a.id], qualifyingTimes: { [a.id]: 92345, [b.id]: null } });
    expect(put.status).toBe(200);
    const get = await appRequest(`/api/matches/${m.id}/setup`);
    expect(get.data.participants.map((p: any) => p.id)).toEqual([b.id, a.id]);
    expect(get.data.participants[1].qualifying_time_ms).toBe(92345);
    expect(get.data.participants[0].grid_position).toBe(1);
  });

  it('rejects participants from another match with 400', async () => {
    const m1 = await createMatch(gameId, modeId, { status: 'assign' });
    const m2 = await createMatch(gameId, modeId, { status: 'assign' });
    const other = await player(m2.id);
    expect((await json(`/api/matches/${m1.id}/setup`, 'PUT', { gridOrder: [other.id] })).status).toBe(400);
  });

  it('rejects changes when the match is not in gather/assign (409)', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    expect((await json(`/api/matches/${m.id}/setup`, 'PUT', { gridOrder: [] })).status).toBe(409);
  });

  it('404s an unknown match', async () => {
    expect((await appRequest('/api/matches/none/setup')).status).toBe(404);
    expect((await json('/api/matches/none/setup', 'PUT', { gridOrder: [] })).status).toBe(404);
  });
});

describe('GET /api/matches/:id/reminders', () => {
  it('returns 404 for a non-existent match', async () => {
    expect((await appRequest('/api/matches/nonexistent/reminders')).status).toBe(404);
  });

  it('returns the match info and a reminders array', async () => {
    const m = await createMatch(gameId, modeId);
    const res = await appRequest(`/api/matches/${m.id}/reminders`);
    expect(res.status).toBe(200);
    expect(res.data.match.id).toBe(m.id);
    expect(Array.isArray(res.data.reminders)).toBe(true);
    expect(typeof res.data.reminderCount).toBe('number');
  });
});

describe('map codes', () => {
  it('returns 404 for a non-existent match (GET and POST)', async () => {
    expect((await appRequest('/api/matches/nonexistent/map-codes')).status).toBe(404);
    expect((await json('/api/matches/nonexistent/map-codes', 'POST', { mapCodes: {} })).status).toBe(404);
  });

  it('returns an empty object when none are set, and stored codes otherwise', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await appRequest(`/api/matches/${m.id}/map-codes`)).data).toEqual({ mapCodes: {} });
    const withCodes = await createMatch(gameId, modeId, { map_codes: { 'map-1': 'ABC123' } });
    expect((await appRequest(`/api/matches/${withCodes.id}/map-codes`)).data).toEqual({ mapCodes: { 'map-1': 'ABC123' } });
  });

  it('returns 400 when mapCodes is missing or a code exceeds 24 characters', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await json(`/api/matches/${m.id}/map-codes`, 'POST', {})).status).toBe(400);
    expect((await json(`/api/matches/${m.id}/map-codes`, 'POST', { mapCodes: { a: 'A'.repeat(25) } })).status).toBe(400);
    expect((await json(`/api/matches/${m.id}/map-codes`, 'POST', { mapCodes: { a: 'A'.repeat(24) } })).status).toBe(200);
  });

  it('counts emoji as single characters toward the limit', async () => {
    const m = await createMatch(gameId, modeId);
    const code = '🎮'.repeat(24);
    expect((await json(`/api/matches/${m.id}/map-codes`, 'POST', { mapCodes: { a: code } })).status).toBe(200);
    expect((await appRequest(`/api/matches/${m.id}/map-codes`)).data.mapCodes.a).toBe(code);
  });

  it('saves the codes and returns them', async () => {
    const m = await createMatch(gameId, modeId);
    const res = await json(`/api/matches/${m.id}/map-codes`, 'POST', { mapCodes: { 'map-1': 'ABC123' } });
    expect(res.data).toEqual({ success: true, mapCodes: { 'map-1': 'ABC123' } });
    expect((await pg().select().from(matches).where(eq(matches.id, m.id)))[0].map_codes).toEqual({ 'map-1': 'ABC123' });
  });
});

describe('map notes', () => {
  const note = (id: string, body: unknown) => json(`/api/matches/${id}/map-notes`, 'POST', body);

  it('returns 400 when mapId is missing or the note exceeds 64 characters', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await note(m.id, { note: 'hello' })).status).toBe(400);
    expect((await note(m.id, { mapId: 'map-1', note: 'A'.repeat(65) })).status).toBe(400);
    expect((await note(m.id, { mapId: 'map-1', note: 'A'.repeat(64) })).status).toBe(200);
  });

  it('returns 404 when the match does not exist', async () => {
    expect((await note('nonexistent', { mapId: 'map-1', note: 'Test note' })).status).toBe(404);
  });

  it('creates a note-only entry when the games do not exist yet', async () => {
    const m = await createMatch(gameId, modeId);
    const res = await note(m.id, { mapId: 'map-abc', note: 'First note' });
    expect(res.data).toEqual({ success: true, note: 'First note' });
    expect((await appRequest(`/api/matches/${m.id}/map-notes`)).data.notes).toEqual({ 'map-abc': 'First note' });
  });

  it('updates the existing match game for the map', async () => {
    const m = await createMatch(gameId, modeId);
    await pg().insert(matchGames).values({ id: 'mg-1', match_id: m.id, round: 1, map_id: 'map-xyz', status: 'pending' });
    expect((await note(m.id, { mapId: 'map-xyz', note: 'Updated note' })).data.success).toBe(true);
    expect((await pg().select().from(matchGames).where(eq(matchGames.id, 'mg-1')))[0].notes).toBe('Updated note');
  });

  it('accepts an empty note, which drops it from the listing', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await note(m.id, { mapId: 'map-empty', note: '' })).status).toBe(200);
    expect((await appRequest(`/api/matches/${m.id}/map-notes`)).data.notes).toEqual({});
  });

  it('lists stored notes keyed by map id and leaves out empty ones', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await appRequest(`/api/matches/${m.id}/map-notes`)).data).toEqual({ notes: {} });
    await pg().insert(matchGames).values([
      { id: 'mg1', match_id: m.id, round: 1, map_id: 'map-a', notes: 'Note A', status: 'pending' },
      { id: 'mg2', match_id: m.id, round: 2, map_id: 'map-b', notes: '', status: 'pending' },
    ]);
    expect((await appRequest(`/api/matches/${m.id}/map-notes`)).data.notes).toEqual({ 'map-a': 'Note A' });
  });
});

describe('overall score, games and games-with-results', () => {
  it('overall-score answers for a new match with the empty score', async () => {
    const m = await createMatch(gameId, modeId);
    const res = await appRequest(`/api/matches/${m.id}/overall-score`);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ team1Wins: 0, team2Wins: 0, totalNormalGames: 0, overallWinner: null });
  });

  it('lists the match games in round order', async () => {
    const m = await createMatch(gameId, modeId);
    await pg().insert(matchGames).values([
      { id: 'game-3', match_id: m.id, round: 3, status: 'pending' }, { id: 'game-1', match_id: m.id, round: 1, status: 'pending' },
      { id: 'game-2', match_id: m.id, round: 2, status: 'pending' },
    ]);
    const res = await appRequest(`/api/matches/${m.id}/games`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.games.map((g: any) => g.round)).toEqual([1, 2, 3]);
  });

  it('games-with-results answers with an empty list and with completed games', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await appRequest(`/api/matches/${m.id}/games-with-results`)).data.games).toEqual([]);
    await pg().insert(matchGames).values({ id: 'mg-res', match_id: m.id, round: 1, status: 'completed' });
    const res = await appRequest(`/api/matches/${m.id}/games-with-results`);
    expect(res.data.games).toHaveLength(1);
    expect(res.data.games[0]).toMatchObject({ id: 'mg-res', status: 'completed' });
  });
});

describe('GET /api/matches/:id/games/:gameId/result', () => {
  it('returns 404 when no result exists for the game', async () => {
    const { m, gId } = await battle();
    const res = await appRequest(`/api/matches/${m.id}/games/${gId}/result`);
    expect(res.status).toBe(404);
    expect(res.data.error).toMatch(/no result/i);
  });

  it('returns 404 when the game belongs to a different match, or does not exist', async () => {
    const { gId } = await battle();
    const other = await createMatch(gameId, modeId);
    const wrong = await appRequest(`/api/matches/${other.id}/games/${gId}/result`);
    expect(wrong.status).toBe(404);
    expect(wrong.data.error).toMatch(/not found for this match/i);
    const { m } = await battle();
    expect((await appRequest(`/api/matches/${m.id}/games/nonexistent/result`)).status).toBe(404);
  });

  it('returns the typed result after a winner is set', async () => {
    const { m, gId, blue } = await battle();
    await result(m.id, gId, { matchId: m.id, gameId: gId, winner: 'team1', completedAt: new Date().toISOString() });
    const got = await appRequest(`/api/matches/${m.id}/games/${gId}/result`);
    expect(got.status).toBe(200);
    expect(got.data.type).toBe('Normal');
    expect(got.data.placements.find((p: any) => p.isWinner)).toMatchObject({ entityId: blue.id, teamName: 'Blue' });
  });
});

describe('POST /api/matches/:id/games/:gameId/result', () => {
  it('returns 400 when the winner is missing or not team1/team2', async () => {
    const { m, gId } = await battle();
    const missing = await result(m.id, gId, { gameId: gId, matchId: m.id });
    expect(missing.status).toBe(400);
    expect(missing.data.error).toMatch(/invalid winner/i);
    expect((await result(m.id, gId, { gameId: gId, matchId: m.id, winner: 'blue' })).status).toBe(400);
  });

  it('returns 400 when the body ids do not match the route', async () => {
    const { m, gId } = await battle();
    const g = await result(m.id, gId, { gameId: 'other-game', matchId: m.id, winner: 'team1' });
    expect([g.status, g.data.error]).toEqual([400, expect.stringMatching(/mismatch/i)]);
    const mm = await result(m.id, gId, { gameId: gId, matchId: 'wrong-match', winner: 'team1' });
    expect([mm.status, mm.data.error]).toEqual([400, expect.stringMatching(/mismatch/i)]);
  });

  it('saves a team1 result and a team2 result with the team in the message', async () => {
    const one = await battle();
    const r1 = await result(one.m.id, one.gId, { gameId: one.gId, matchId: one.m.id, winner: 'team1' });
    expect([r1.status, r1.data.success, r1.data.message]).toEqual([200, true, expect.stringMatching(/blue/i)]);
    const two = await battle();
    const r2 = await result(two.m.id, two.gId, { gameId: two.gId, matchId: two.m.id, winner: 'team2' });
    expect([r2.status, r2.data.success, r2.data.message]).toEqual([200, true, expect.stringMatching(/red/i)]);
  });

  it('submits and reads back a result (winner reported as team1)', async () => {
    const { m, gId } = await battle();
    expect((await result(m.id, gId, { matchId: m.id, gameId: gId, winner: 'team1', completedAt: new Date().toISOString() })).status).toBe(200);
    expect((await appRequest(`/api/matches/${m.id}/games/${gId}/result`)).status).toBe(200);
    const list = await appRequest(`/api/matches/${m.id}/games`);
    expect(list.data.games[0]).toMatchObject({ status: 'completed', winner_id: 'team1' });
  });

  it('returns 409 when another submission scored the map first', async () => {
    const { m, gId } = await battle();
    expect((await result(m.id, gId, { winner: 'team1' })).status).toBe(200);
    const second = await result(m.id, gId, { winner: 'team2' });
    expect(second.status).toBe(409);
    expect(second.data.error).toMatch(/rescore/);
  });

  it('returns 400 when Position results have a gap (no 1st place)', async () => {
    const pos = await createGameMode(gameId, { scoring_type: 'Position', name: 'Race' });
    const m = await createMatch(gameId, pos.id, { status: 'battle' });
    const a = await player(m.id);
    const b = await player(m.id);
    const gId = `${m.id}_game_1`;
    await pg().insert(matchGames).values({ id: gId, match_id: m.id, round: 1, status: 'ongoing' });
    const res = await result(m.id, gId, { isPositionMode: true, positionResults: { [a.id]: 2, [b.id]: 3 } });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/1 to 2 with no gaps/);
  });

  describe('rescoring a completed tournament match', () => {
    async function tournamentMatch(opts: { laterMatchWithTeam?: boolean; tournamentStatus?: 'battle' | 'complete' } = {}) {
      const t = await createTournament(gameId, { status: opts.tournamentStatus ?? 'battle' });
      await pg().insert(tournamentTeams).values([{ id: 'team-a', tournament_id: t.id, team_name: 'A' }, { id: 'team-b', tournament_id: t.id, team_name: 'B' }, { id: 'team-c', tournament_id: t.id, team_name: 'C' }]);
      const { m, gId } = await battle({ tournament_id: t.id });
      await pg().update(matches).set({ status: 'complete' }).where(eq(matches.id, m.id));
      await pg().update(matchGames).set({ status: 'completed' }).where(eq(matchGames.id, gId));
      await pg().insert(tournamentMatches).values({ match_id: m.id, tournament_id: t.id, round: 1, bracket_type: 'winners', team1_id: 'team-a', team2_id: 'team-b', match_order: 1, created_at: new Date('2026-01-01') });
      if (opts.laterMatchWithTeam) {
        const next = await createMatch(gameId, modeId, { tournament_id: t.id });
        await pg().insert(tournamentMatches).values({ match_id: next.id, tournament_id: t.id, round: 2, bracket_type: 'winners', team1_id: 'team-a', team2_id: 'team-c', match_order: 1, created_at: new Date('2026-01-02') });
      }
      return { m, gId };
    }

    it('is allowed before the bracket advances', async () => {
      const { m, gId } = await tournamentMatch();
      expect((await result(m.id, gId, { winner: 'team2', rescore: true })).status).toBe(200);
    });

    it('returns 409 once a later match includes either team', async () => {
      const { m, gId } = await tournamentMatch({ laterMatchWithTeam: true });
      const res = await result(m.id, gId, { winner: 'team2', rescore: true });
      expect(res.status).toBe(409);
      expect(res.data.error).toMatch(/bracket has already advanced/);
      expect(await pg().select().from(matchGamePlacements).where(eq(matchGamePlacements.match_game_id, gId))).toHaveLength(0);
    });

    it('returns 409 once the tournament is complete', async () => {
      const { m, gId } = await tournamentMatch({ tournamentStatus: 'complete' });
      const res = await result(m.id, gId, { winner: 'team2', rescore: true });
      expect(res.status).toBe(409);
      expect(res.data.error).toMatch(/tournament is complete/);
    });
  });
});

describe('result validation', () => {
  async function setup(status: 'battle' | 'cancelled' | 'created' | 'assign' | 'complete' = 'battle', mode = modeId) {
    const s = await battle({ status }, mode);
    const alpha = s.blue;
    return { ...s, t0: alpha?.id, t1: s.red?.id, reserve: s.reserve?.id };
  }

  it('returns 400 for invalid JSON', async () => {
    const { m, gId } = await setup();
    const res = await appRequest(`/api/matches/${m.id}/games/${gId}/result`, { method: 'POST', body: '{not json', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a body that is not an object', async () => {
    const { m, gId } = await setup();
    expect((await result(m.id, gId, [1, 2])).status).toBe(400);
    expect((await result(m.id, gId, 'text')).status).toBe(400);
  });

  it('returns 404 when the game does not belong to the match', async () => {
    const a = await setup();
    const b = await setup();
    const res = await result(a.m.id, b.gId, { type: 'Normal', matchId: a.m.id, gameId: b.gId, winnerTeamId: a.t0 });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown game and creates no row', async () => {
    const { m } = await setup();
    expect((await result(m.id, 'bogus-game', { matchId: m.id, gameId: 'bogus-game', winner: 'team1' })).status).toBe(404);
    expect(await pg().select().from(matchGames).where(eq(matchGames.id, 'bogus-game'))).toHaveLength(0);
  });

  it('returns 400 when the match is cancelled or not yet in battle', async () => {
    for (const st of ['cancelled', 'created', 'assign'] as const) {
      const { m, gId } = await setup(st);
      expect((await result(m.id, gId, { matchId: m.id, gameId: gId, winner: 'team1' })).status).toBe(400);
    }
  });

  it('rejects a completed match unless rescore is set', async () => {
    const { m, gId, t0 } = await setup('complete');
    expect((await result(m.id, gId, { type: 'Normal', matchId: m.id, gameId: gId, winnerTeamId: t0 })).status).toBe(400);
    expect((await result(m.id, gId, { type: 'Normal', matchId: m.id, gameId: gId, winnerTeamId: t0, rescore: true })).status).toBe(200);
  });

  it('rejects a winnerTeamId from another match, an unknown team and the reserve team', async () => {
    const a = await setup();
    const b = await setup();
    for (const teamId of [b.t0, 'nope', a.reserve]) {
      expect((await result(a.m.id, a.gId, { type: 'Normal', matchId: a.m.id, gameId: a.gId, winnerTeamId: teamId })).status).toBe(400);
    }
  });

  it('uses the real team name and records the winning team', async () => {
    const { m, gId, t1 } = await setup();
    await pg().update(matchTeams).set({ team_name: 'Beta' }).where(eq(matchTeams.id, t1));
    const res = await result(m.id, gId, { type: 'Normal', matchId: m.id, gameId: gId, winnerTeamId: t1 });
    expect([res.status, res.data.message]).toEqual([200, 'Beta wins!']);
    expect((await appRequest(`/api/matches/${m.id}/games`)).data.games[0].winner_id).toBe('team2');
  });

  it('records a 3rd-team winner by id, not as team1', async () => {
    const { m, gId } = await setup();
    const t2 = `${m.id}_t2`;
    await pg().insert(matchTeams).values({ id: t2, match_id: m.id, team_name: 'Gamma', team_order: 2, is_reserve: false });
    expect((await result(m.id, gId, { type: 'Normal', matchId: m.id, gameId: gId, winnerTeamId: t2 })).status).toBe(200);
    expect((await appRequest(`/api/matches/${m.id}/games`)).data.games[0].winner_id ?? null).toBeNull();
    const q = (await pg().select().from(discordScoreNotificationQueue).where(eq(discordScoreNotificationQueue.match_id, m.id)))[0];
    expect(q).toMatchObject({ winner: 'team', winning_team_name: 'Gamma' });
    const got = await appRequest(`/api/matches/${m.id}/games/${gId}/result`);
    expect(got.data.placements.find((p: any) => p.isWinner).entityId).toBe(t2);
  });

  it('accepts a draw and leaves no winner row', async () => {
    const { m, gId } = await setup();
    expect((await result(m.id, gId, { type: 'Normal', matchId: m.id, gameId: gId, draw: true })).status).toBe(200);
    const rows = await pg().select().from(matchGamePlacements).where(eq(matchGamePlacements.match_game_id, gId));
    expect(rows.filter((r) => r.is_winner)).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });

  describe('FFA / Position', () => {
    it('rejects an FFA winner that is not a participant of this match', async () => {
      const ffa = await createGameMode(gameId, { scoring_type: 'FFA', name: 'FFA Mode' });
      const a = await setup('battle', ffa.id);
      const b = await setup('battle', ffa.id);
      const outsider = await player(b.m.id);
      expect((await result(a.m.id, a.gId, { type: 'FFA', matchId: a.m.id, gameId: a.gId, winnerParticipantId: outsider.id })).status).toBe(400);
    });

    it('rejects Position results with foreign ids, non-positive, fractional or duplicate positions', async () => {
      const pos = await createGameMode(gameId, { scoring_type: 'Position', name: 'Race' });
      const a = await setup('battle', pos.id);
      const b = await setup('battle', pos.id);
      const p1 = await player(a.m.id);
      const p2 = await player(a.m.id);
      const foreign = await player(b.m.id);
      const send = (positionResults: Record<string, number>) => result(a.m.id, a.gId, { type: 'Position', matchId: a.m.id, gameId: a.gId, positionResults });
      expect((await send({ [p1.id]: 1, [foreign.id]: 2 })).status).toBe(400);
      expect((await send({ [p1.id]: 0, [p2.id]: 1 })).status).toBe(400);
      expect((await send({ [p1.id]: 1.5, [p2.id]: 2 })).status).toBe(400);
      expect((await send({ [p1.id]: 1, [p2.id]: 1 })).status).toBe(400);
      expect((await send({ [p1.id]: 1, [p2.id]: 2 })).status).toBe(200);
    });

    it('rejects a result type that does not match the game mode', async () => {
      const { m, gId } = await setup();
      const p = await player(m.id);
      expect((await result(m.id, gId, { type: 'FFA', matchId: m.id, gameId: gId, winnerParticipantId: p.id })).status).toBe(400);
    });
  });
});

describe('GET /api/matches/:id/games/:gameId/suggested-positions', () => {
  async function setup() {
    const m = await createMatch(gameId, modeId);
    await pg().insert(matchGames).values({ id: 'mg-sugg-1', match_id: m.id, round: 1, status: 'pending' });
    const add = (id: string, review: 'pending' | 'approved' | 'auto_approved' | 'rejected', suggestion: unknown, createdAt: string) =>
      pg().insert(scorecardSubmissions).values({
        id, match_id: m.id, match_game_id: 'mg-sugg-1', team_side: 'blue', screenshot_url: 'x.png', review_status: review,
        suggested_positions: suggestion as never, created_at: new Date(createdAt),
      });
    return { m, add };
  }
  const get = (m: string) => appRequest(`/api/matches/${m}/games/mg-sugg-1/suggested-positions`);

  it('returns 404 when the game does not belong to the match', async () => {
    const { m } = await setup();
    expect((await appRequest(`/api/matches/${m.id}/games/nope/suggested-positions`)).status).toBe(404);
  });

  it('returns null when there are no approved suggestions', async () => {
    const { m, add } = await setup();
    await add('s1', 'pending', { p1: 1 }, '2026-01-01T10:00:00Z');
    const res = await get(m.id);
    expect([res.status, res.data]).toEqual([200, { suggestions: null }]);
  });

  it('uses the latest approved or auto-approved submission', async () => {
    const { m, add } = await setup();
    await add('s1', 'approved', { p1: 2, p2: 1 }, '2026-01-01T10:00:00Z');
    await add('s2', 'auto_approved', { p1: 1, p2: 2 }, '2026-01-01T11:00:00Z');
    await add('s3', 'rejected', { p1: 3 }, '2026-01-01T12:00:00Z');
    expect((await get(m.id)).data).toEqual({ suggestions: { p1: 1, p2: 2 } });
  });

  it('ignores malformed stored suggestions', async () => {
    const { m, add } = await setup();
    await add('s1', 'approved', { p1: 'first', p2: -1 }, '2026-01-01T10:00:00Z');
    expect((await get(m.id)).data).toEqual({ suggestions: null });
  });
});

// keep the unused-import guard honest
void and;
