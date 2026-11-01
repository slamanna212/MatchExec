// @vitest-environment node
/**
 * Match lifecycle per scoring_type (Normal / FFA / Position), driven through the real Hono routes on Postgres:
 * create -> gather -> assign -> battle -> score -> complete. Nothing is mocked in the scoring path (only the SQLite
 * activity feed, which is owned by a later domain).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode } from '../../utils/pg-fixtures';
import {
  discordAnnouncementQueue, discordDeletionQueue, discordMatchStartQueue, discordMatchWinnerQueue, discordScoreNotificationQueue,
  discordStatusUpdateQueue, discordVoiceAnnouncementQueue, gameMaps, games, matchGamePlacements, matchGames, matchParticipants,
  matchTeams, matches, discordSettings,
} from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', () => ({ logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();

type ScoringType = 'Normal' | 'FFA' | 'Position';
let gameId: string;
let seq = 0;
const pg = () => getPgTestDb();

async function createModeWithMaps(scoringType: ScoringType, mapCount: number) {
  const mode = await createGameMode(gameId, {
    scoring_type: scoringType, name: `${scoringType} mode`,
    // team_size > 1 turns a Position mode into team-endurance; these tests cover individual racing.
    team_size: scoringType === 'Normal' ? 5 : 1,
  });
  const mapIds: string[] = [];
  for (let i = 0; i < mapCount; i++) {
    const id = `map-${scoringType.toLowerCase()}-${++seq}`;
    await pg().insert(gameMaps).values({ id, game_id: gameId, mode_id: mode.id, name: `Map ${id}` });
    mapIds.push(id);
  }
  return { modeId: mode.id, mapIds };
}

const post = (matchId: string, newStatus: string, force?: boolean) =>
  appRequest(`/api/matches/${matchId}/transition`, { method: 'POST', json: { newStatus, force } });

async function setupMatch(scoringType: ScoringType, opts: { maps?: number; players?: number; extra?: Record<string, unknown> } = {}) {
  const { modeId, mapIds } = await createModeWithMaps(scoringType, opts.maps ?? 1);
  const created = await appRequest('/api/matches', {
    method: 'POST',
    json: { name: `${scoringType} match`, gameId, maps: mapIds, rounds: mapIds.length, startDate: new Date().toISOString(), ...opts.extra },
  });
  expect(created.status).toBe(201);
  const matchId: string = created.data.id;
  const participantIds: string[] = [];
  for (let i = 0; i < (opts.players ?? 4); i++) {
    const id = `${matchId}-p${i}`;
    await pg().insert(matchParticipants).values({ id, match_id: matchId, user_id: `user-${matchId}-${i}`, discord_user_id: `d${i}`, username: `Player${i}` });
    participantIds.push(id);
  }
  return { matchId, participantIds, modeId };
}

const gamesOf = async (matchId: string) =>
  (await pg().select({ id: matchGames.id }).from(matchGames).where(eq(matchGames.match_id, matchId)).orderBy(asc(matchGames.round))).map((g) => g.id);

async function toBattle(matchId: string, teamAssignments?: Array<{ participantId: string; teamId: string }>) {
  expect((await post(matchId, 'gather')).status).toBe(200);
  expect((await post(matchId, 'assign')).status).toBe(200);
  if (teamAssignments) {
    const res = await appRequest(`/api/matches/${matchId}/assign-teams`, { method: 'POST', json: { teamAssignments } });
    expect(res.status).toBe(200);
  }
  expect((await post(matchId, 'battle')).status).toBe(200);
  return gamesOf(matchId);
}

const score = (matchId: string, gId: string, body: Record<string, unknown>) =>
  appRequest(`/api/matches/${matchId}/games/${gId}/result`, { method: 'POST', json: body });
const matchRow = async (matchId: string) => (await pg().select().from(matches).where(eq(matches.id, matchId)))[0];
const placements = (gId: string) => pg().select().from(matchGamePlacements).where(eq(matchGamePlacements.match_game_id, gId)).orderBy(asc(matchGamePlacements.position), asc(matchGamePlacements.entity_id));
const overall = (matchId: string) => appRequest(`/api/matches/${matchId}/overall-score`);

beforeEach(async () => {
  gameId = (await createGame()).id;
});

describe('POST /api/matches', () => {
  it('sets mode_id from the selected maps and returns the game display fields', async () => {
    const { matchId, modeId } = await setupMatch('Position');
    const row = await matchRow(matchId);
    expect(row.mode_id).toBe(modeId);
    const res = await appRequest(`/api/matches/${matchId}`);
    expect(res.data).toMatchObject({ id: matchId, scoring_type: 'Position', map_codes_supported: false, tournament_allow_match_editing: true, game_name: 'Test Game' });
    expect(new Date(res.data.start_date).toISOString()).toBe(res.data.start_date);
  });

  it('resolves mode_id when map ids carry the UI timestamp/random suffix', async () => {
    const { modeId, mapIds } = await createModeWithMaps('FFA', 1);
    const res = await appRequest('/api/matches', { method: 'POST', json: { name: 'Suffixed', gameId, maps: [`${mapIds[0]}-1793410040191-umuprdq78`], startDate: new Date().toISOString() } });
    expect(res.status).toBe(201);
    expect(res.data.mode_id).toBe(modeId);
    expect(res.data.maps).toEqual([`${mapIds[0]}-1793410040191-umuprdq78`]);
  });

  it('rejects maps from different scoring types, a missing startDate and a malformed override', async () => {
    const a = await createModeWithMaps('Normal', 1);
    const b = await createModeWithMaps('FFA', 1);
    const start = new Date().toISOString();
    expect((await appRequest('/api/matches', { method: 'POST', json: { name: 'Mixed', gameId, maps: [a.mapIds[0], b.mapIds[0]], startDate: start } })).status).toBe(400);
    const noDate = await appRequest('/api/matches', { method: 'POST', json: { name: 'No date', gameId } });
    expect(noDate.status).toBe(400);
    expect(noDate.data.error).toMatch(/startDate/);
    expect((await appRequest('/api/matches', { method: 'POST', json: { name: 'Bad', gameId, startDate: start, positionScoringOverride: { first: 'lots' } } })).status).toBe(400);
  });

  it('takes the team count of a Normal mode with max_teams > 2 when none is given', async () => {
    const mode = await createGameMode(gameId, { scoring_type: 'Normal', max_teams: 4 });
    await pg().insert(gameMaps).values({ id: 'quad-map', game_id: gameId, mode_id: mode.id, name: 'Quad' });
    const res = await appRequest('/api/matches', { method: 'POST', json: { name: 'Quad', gameId, maps: ['quad-map'], startDate: new Date().toISOString() } });
    expect(res.status).toBe(201);
    expect(res.data.team_count).toBe(4);
  });
});

describe('transitions', () => {
  it('walks created -> gather -> assign -> battle and queues the Discord work in the same transaction', async () => {
    const s = await setupMatch('Normal', { maps: 2, players: 2 });
    const gather = await post(s.matchId, 'gather');
    expect(gather.data.status).toBe('gather');
    expect(await pg().select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.match_id, s.matchId))).toHaveLength(1);

    await post(s.matchId, 'assign');
    expect(await pg().select().from(discordStatusUpdateQueue).where(eq(discordStatusUpdateQueue.match_id, s.matchId))).toHaveLength(1);
    const teams = await pg().select().from(matchTeams).where(eq(matchTeams.match_id, s.matchId));
    expect(teams.map((t) => t.team_name).sort()).toEqual(['Blue', 'Red', 'Reserve']);

    const battle = await post(s.matchId, 'battle');
    expect(battle.status).toBe(200);
    expect(battle.data).toMatchObject({ status: 'battle', map_codes_supported: false });
    expect((await pg().select().from(discordAnnouncementQueue).where(and(eq(discordAnnouncementQueue.match_id, s.matchId), eq(discordAnnouncementQueue.announcement_type, 'match_start')))).length).toBe(1);
    const games_ = await pg().select().from(matchGames).where(eq(matchGames.match_id, s.matchId)).orderBy(asc(matchGames.round));
    expect(games_.map((g) => [g.round, g.status])).toEqual([[1, 'ongoing'], [2, 'pending']]);
  });

  it('rejects invalid, repeated and out-of-order transitions', async () => {
    const s = await setupMatch('Normal', { maps: 1, players: 2 });
    expect((await post(s.matchId, 'bogus')).status).toBe(400);
    expect((await post(s.matchId, 'created')).status).toBe(400);
    expect((await post(s.matchId, 'battle')).data.error).toMatch(/Cannot transition/);
    expect((await post('missing', 'gather')).status).toBe(404);
    await post(s.matchId, 'gather');
    expect((await post(s.matchId, 'gather')).data.error).toMatch(/already in/);
  });

  it('cancelling queues the Discord deletion and is terminal', async () => {
    const s = await setupMatch('Normal', { maps: 1, players: 2 });
    await post(s.matchId, 'gather');
    expect((await post(s.matchId, 'cancelled')).status).toBe(200);
    expect(await pg().select().from(discordDeletionQueue).where(eq(discordDeletionQueue.match_id, s.matchId))).toHaveLength(1);
    expect((await post(s.matchId, 'gather')).status).toBe(400);
  });

  it('only completes a match whose maps are scored unless forced', async () => {
    const s = await setupMatch('Normal', { maps: 2, players: 2 });
    const [g1] = await toBattle(s.matchId);
    const teams = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, s.matchId), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
    await score(s.matchId, g1, { winnerTeamId: teams[0].id });
    expect((await post(s.matchId, 'complete')).data.error).toMatch(/not all maps/);
    const forced = await post(s.matchId, 'complete', true);
    expect(forced.status).toBe(200);
    expect(forced.data.winner_entity_type).toBe('match_team');
    expect(forced.data.winner_team).toBe(teams[0].id);
    expect(await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, s.matchId))).toHaveLength(1);
  });
});

describe('Normal', () => {
  async function normalMatch(maps = 3) {
    const s = await setupMatch('Normal', { maps, players: 4 });
    expect((await post(s.matchId, 'gather')).status).toBe(200);
    expect((await post(s.matchId, 'assign')).status).toBe(200);
    const teams = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, s.matchId), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
    expect(teams).toHaveLength(2);
    const assign = await appRequest(`/api/matches/${s.matchId}/assign-teams`, {
      method: 'POST', json: { teamAssignments: s.participantIds.map((participantId, i) => ({ participantId, teamId: teams[i % 2].id })) },
    });
    expect(assign.status).toBe(200);
    expect((await post(s.matchId, 'battle')).status).toBe(200);
    return { ...s, gameIds: await gamesOf(s.matchId), teams: teams.map((t) => t.id) };
  }

  it('completes a best-of-3, stores both scores, and names the winning match_team', async () => {
    const m = await normalMatch(3);
    expect((await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[0], winnerScore: 13, loserScore: 7 })).status).toBe(200);
    const g1 = await placements(m.gameIds[0]);
    expect(g1.find((p) => p.entity_id === m.teams[0])).toMatchObject({ score: 13, is_winner: true, position: 1 });
    // loserScore without loserTeamId is still attributed in a 2-team match
    expect(g1.find((p) => p.entity_id === m.teams[1])).toMatchObject({ score: 7, is_winner: false, position: 2 });
    const gameRow = (await pg().select().from(matchGames).where(eq(matchGames.id, m.gameIds[0])))[0];
    expect(gameRow.status).toBe('completed');
    expect(gameRow.completed_at).toBeInstanceOf(Date);
    expect(gameRow.discord_notified).toBe(true);
    expect(await pg().select().from(discordScoreNotificationQueue).where(eq(discordScoreNotificationQueue.match_id, m.matchId))).toHaveLength(1);
    expect((await pg().select().from(matchGames).where(eq(matchGames.id, m.gameIds[1])))[0].status).toBe('ongoing'); // next map promoted

    await score(m.matchId, m.gameIds[1], { winnerTeamId: m.teams[1], winnerScore: 13, loserScore: 11 });
    await score(m.matchId, m.gameIds[2], { winnerTeamId: m.teams[0], winnerScore: 13, loserScore: 2 });

    const row = await matchRow(m.matchId);
    expect(row.status).toBe('complete');
    expect(row.winner_team).toBe(m.teams[0]);
    expect((await overall(m.matchId)).data).toMatchObject({ scoringType: 'Normal', team1Wins: 2, team2Wins: 1, overallWinnerTeamId: m.teams[0], overallWinner: 'team1' });
    // finishing the last map queued the winner announcement, the Discord cleanup and a "finish" voice line only with channels
    expect(await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, m.matchId))).toHaveLength(1);
    expect(await pg().select().from(discordDeletionQueue).where(eq(discordDeletionQueue.match_id, m.matchId))).toHaveLength(1);
  });

  it('accepts the legacy team1/team2 shorthand and reports it back', async () => {
    const m = await normalMatch(1);
    const res = await score(m.matchId, m.gameIds[0], { winner: 'team2' });
    expect(res.status).toBe(200);
    expect(res.data.message).toBe('Red wins!');
    const got = await appRequest(`/api/matches/${m.matchId}/games/${m.gameIds[0]}/result`);
    expect(got.data).toMatchObject({ type: 'Normal' });
    expect(got.data.placements.find((p: any) => p.isWinner).teamName).toBe('Red');
  });

  it('records a draw: no winner, every team at position 1', async () => {
    const m = await normalMatch(2);
    expect((await score(m.matchId, m.gameIds[0], { draw: true })).status).toBe(200);
    const rows = await placements(m.gameIds[0]);
    expect(rows.every((p) => p.position === 1 && !p.is_winner)).toBe(true);
    await score(m.matchId, m.gameIds[1], { winnerTeamId: m.teams[1] });
    expect((await matchRow(m.matchId)).winner_team).toBe(m.teams[1]);
  });

  it('does not keep a loserScore it cannot attribute when 3+ teams exist', async () => {
    const s = await setupMatch('Normal', { maps: 1, players: 3, extra: { teamCount: 3 } });
    await post(s.matchId, 'gather');
    await post(s.matchId, 'assign');
    const teams = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, s.matchId), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
    expect(teams).toHaveLength(3);
    await post(s.matchId, 'battle');
    const [g] = await gamesOf(s.matchId);
    expect((await score(s.matchId, g, { winnerTeamId: teams[0].id, winnerScore: 5, loserScore: 1 })).status).toBe(200);
    expect((await placements(g)).filter((p) => !p.is_winner).every((p) => p.score === null)).toBe(true);
    const o = (await overall(s.matchId)).data;
    expect(o.teamScores).toHaveLength(3);
    expect(o.overallWinnerTeamId).toBe(teams[0].id);
  });

  it('refuses a second submission for a scored map unless rescore is set', async () => {
    const m = await normalMatch(2);
    expect((await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[0] })).status).toBe(200);
    expect((await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[1] })).status).toBe(409);
    expect((await placements(m.gameIds[0])).find((p) => p.is_winner)?.entity_id).toBe(m.teams[0]);
    expect((await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[1], rescore: true })).status).toBe(200);
    expect((await placements(m.gameIds[0])).find((p) => p.is_winner)?.entity_id).toBe(m.teams[1]);
    // a rescore does not re-fire the score notification
    expect(await pg().select().from(discordScoreNotificationQueue).where(eq(discordScoreNotificationQueue.match_id, m.matchId))).toHaveLength(1);
  });

  it('recomputes winner_team when a completed match is rescored', async () => {
    const m = await normalMatch(1);
    await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[0] });
    expect((await matchRow(m.matchId)).winner_team).toBe(m.teams[0]);
    expect((await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[1] })).data.error).toMatch(/already scored/);
    expect((await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[1], rescore: true })).status).toBe(200);
    expect((await matchRow(m.matchId)).winner_team).toBe(m.teams[1]);
  });

  it('validates the body: foreign teams, wrong scoring type, ids, JSON and match state', async () => {
    const m = await normalMatch(2);
    expect((await score(m.matchId, m.gameIds[0], { winnerTeamId: 'nope' })).status).toBe(400);
    expect((await score(m.matchId, m.gameIds[0], {})).data.error).toMatch(/Invalid winner/);
    expect((await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[0], winnerScore: 'x' })).data.error).toMatch(/must be a number/);
    expect((await score(m.matchId, m.gameIds[0], { type: 'Position', matchId: m.matchId, gameId: m.gameIds[0], positionResults: { a: 1 } })).data.error).toMatch(/uses Normal scoring/);
    expect((await score(m.matchId, m.gameIds[0], { matchId: 'other', winnerTeamId: m.teams[0] })).data.error).toBe('Match ID mismatch');
    expect((await score(m.matchId, 'nope', { winnerTeamId: m.teams[0] })).status).toBe(404);
    expect((await score('nope', m.gameIds[0], { winnerTeamId: m.teams[0] })).status).toBe(404);
    const bad = await appRequest(`/api/matches/${m.matchId}/games/${m.gameIds[0]}/result`, { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } });
    expect(bad.status).toBe(400);
    const notBattle = await setupMatch('Normal', { maps: 1, players: 2 });
    await pg().insert(matchGames).values({ id: 'early-game', match_id: notBattle.matchId, round: 1 });
    expect((await score(notBattle.matchId, 'early-game', { winner: 'team1' })).data.error).toMatch(/must be in battle/);
    expect((await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[0] })).status).toBe(200);
    expect((await post(m.matchId, 'complete', true)).status).toBe(200);
    expect((await score(m.matchId, m.gameIds[1], { winnerTeamId: m.teams[0] })).data.error).toMatch(/already complete/);
  });

  it('serves games, games-with-results and 404s for results that do not exist', async () => {
    const m = await normalMatch(2);
    await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[0], winnerScore: 3, loserScore: 1 });
    const g = await appRequest(`/api/matches/${m.matchId}/games`);
    expect(g.data.success).toBe(true);
    expect(g.data.games.map((x: any) => [x.round, x.status, x.winner_id ?? null])).toEqual([[1, 'completed', 'team1'], [2, 'ongoing', null]]);
    expect(g.data.games[0]).toMatchObject({ map_name: expect.stringContaining('Map map-normal'), mode_scoring_type: 'Normal' });
    const gr = await appRequest(`/api/matches/${m.matchId}/games-with-results`);
    expect(gr.data.games[0]).toMatchObject({ winner_id: 'team1', is_ffa_mode: false });
    expect(gr.data.games[0].placements).toHaveLength(2);
    expect((await appRequest(`/api/matches/${m.matchId}/games/${m.gameIds[1]}/result`)).status).toBe(404);
    expect((await appRequest(`/api/matches/${m.matchId}/games/nope/result`)).status).toBe(404);
  });
});

describe('FFA', () => {
  it('builds per-participant teams, scores by winner and crowns the top scorer', async () => {
    const s = await setupMatch('FFA', { maps: 2, players: 4 });
    const gameIds = await toBattle(s.matchId);
    const teams = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, s.matchId), eq(matchTeams.is_reserve, false)));
    expect(teams.map((t) => t.team_name)).not.toContain('Blue');
    expect(teams).toHaveLength(s.participantIds.length);
    for (const g of gameIds) {
      expect((await score(s.matchId, g, { type: 'FFA', matchId: s.matchId, gameId: g, winnerParticipantId: s.participantIds[2] })).status).toBe(200);
    }
    const row = await matchRow(s.matchId);
    expect(row.status).toBe('complete');
    expect(row.winner_team).toBe(s.participantIds[2]);
    expect((await overall(s.matchId)).data.scoringType).toBe('FFA');
    expect((await appRequest(`/api/matches/${s.matchId}`)).data.winner_team).toBe(s.participantIds[2]);
    const done = await appRequest(`/api/matches/${s.matchId}/games/${gameIds[0]}/result`);
    expect(done.data).toMatchObject({ type: 'FFA' });
  });

  it('leaves winner_team null on a tied FFA match', async () => {
    const s = await setupMatch('FFA', { maps: 2, players: 3 });
    const [g1, g2] = await toBattle(s.matchId);
    await score(s.matchId, g1, { type: 'FFA', matchId: s.matchId, gameId: g1, winnerParticipantId: s.participantIds[0] });
    await score(s.matchId, g2, { type: 'FFA', matchId: s.matchId, gameId: g2, winnerParticipantId: s.participantIds[1] });
    const row = await matchRow(s.matchId);
    expect(row.status).toBe('complete');
    expect(row.winner_team).toBeNull();
  });

  it('rejects a Normal-style result for an FFA map and a winner outside the match', async () => {
    const s = await setupMatch('FFA', { maps: 1, players: 2 });
    const [g] = await toBattle(s.matchId);
    expect((await score(s.matchId, g, { winnerTeamId: 'x' })).status).toBe(400);
    expect((await score(s.matchId, g, { type: 'FFA', matchId: s.matchId, gameId: g, winnerParticipantId: 'stranger' })).data.error).toMatch(/not part of this match/);
  });
});

describe('Position', () => {
  const positions = (ids: string[], order: number[]) => Object.fromEntries(order.map((idx, k) => [ids[idx], k + 1]));
  const race = (s: { matchId: string; participantIds: string[] }, gId: string, order: number[]) =>
    score(s.matchId, gId, { type: 'Position', matchId: s.matchId, gameId: gId, positionResults: positions(s.participantIds, order) });
  const points = async (gId: string) => (await placements(gId)).map((p) => p.points_awarded);

  it('awards points from the default spread when no spread is configured', async () => {
    const s = await setupMatch('Position', { maps: 2, players: 4 });
    const [g1, g2] = await toBattle(s.matchId);
    expect((await race(s, g1, [2, 0, 1, 3])).status).toBe(200);
    expect(await points(g1)).toEqual([25, 18, 15, 12]);
    await race(s, g2, [2, 1, 0, 3]);
    const row = await matchRow(s.matchId);
    expect(row.status).toBe('complete');
    expect(row.winner_team).toBe(s.participantIds[2]); // 25 + 25
    expect((await overall(s.matchId)).data.scoringType).toBe('Position');
    const done = await appRequest(`/api/matches/${s.matchId}/games/${g1}/result`);
    expect(done.data.type).toBe('Position');
    expect(done.data.placements.map((p: any) => p.pointsAwarded)).toEqual([25, 18, 15, 12]);
  });

  it('honours the flat per-match override sent by the create form', async () => {
    const s = await setupMatch('Position', { maps: 1, players: 3, extra: { positionScoringOverride: { '1': 100, '2': 50, '3': 1 } } });
    const [g] = await toBattle(s.matchId);
    expect((await race(s, g, [1, 2, 0])).status).toBe(200);
    expect(await points(g)).toEqual([100, 50, 1]);
  });

  it('honours the { type, pointsPerPosition } override form', async () => {
    const s = await setupMatch('Position', { maps: 1, players: 2, extra: { positionScoringOverride: { type: 'Position', pointsPerPosition: { '1': 7, '2': 3 } } } });
    const [g] = await toBattle(s.matchId);
    await race(s, g, [0, 1]);
    expect(await points(g)).toEqual([7, 3]);
  });

  it('prefers the match override over the game scoring_config, which beats the default', async () => {
    await pg().update(games).set({ scoring_config: { type: 'Position', pointsPerPosition: { '1': 9, '2': 8 } } }).where(eq(games.id, gameId));
    const withOverride = await setupMatch('Position', { maps: 1, players: 2, extra: { positionScoringOverride: { '1': 2, '2': 1 } } });
    const [g1] = await toBattle(withOverride.matchId);
    await race(withOverride, g1, [0, 1]);
    expect(await points(g1)).toEqual([2, 1]);

    const plain = await setupMatch('Position', { maps: 1, players: 2 });
    const [g2] = await toBattle(plain.matchId);
    await race(plain, g2, [1, 0]);
    expect(await points(g2)).toEqual([9, 8]);
  });

  it('leaves winner_team null when the top two tie on points and exposes AI suggestions only once approved', async () => {
    const s = await setupMatch('Position', { maps: 2, players: 2 });
    const [g1, g2] = await toBattle(s.matchId);
    expect((await appRequest(`/api/matches/${s.matchId}/games/${g1}/suggested-positions`)).data).toEqual({ suggestions: null });
    await race(s, g1, [0, 1]);
    await race(s, g2, [1, 0]);
    const row = await matchRow(s.matchId);
    expect(row.status).toBe('complete');
    expect(row.winner_team).toBeNull();
  });

  it('validates position input', async () => {
    const s = await setupMatch('Position', { maps: 1, players: 2 });
    const [g] = await toBattle(s.matchId);
    const base = { type: 'Position', matchId: s.matchId, gameId: g };
    expect((await score(s.matchId, g, { ...base, positionResults: { [s.participantIds[0]]: 1, [s.participantIds[1]]: 1 } })).data.error).toMatch(/unique/);
    expect((await score(s.matchId, g, { ...base, positionResults: { [s.participantIds[0]]: 2 } })).data.error).toMatch(/no gaps/);
    expect((await score(s.matchId, g, { ...base, positionResults: { [s.participantIds[0]]: 0 } })).data.error).toMatch(/positive integers/);
    expect((await score(s.matchId, g, { ...base })).data.error).toMatch(/required/);
    expect((await score(s.matchId, g, { ...base, positionResults: { stranger: 1 } })).data.error).toMatch(/not part of this match/);
  });

  it('adds team-level placements for team-endurance Position matches', async () => {
    const mode = await createGameMode(gameId, { scoring_type: 'Position', name: 'Endurance', team_size: 2, max_teams: 2 });
    await pg().insert(gameMaps).values({ id: 'endurance-map', game_id: gameId, mode_id: mode.id, name: 'Endurance' });
    const created = await appRequest('/api/matches', { method: 'POST', json: { name: 'Endurance', gameId, maps: ['endurance-map'], startDate: new Date().toISOString() } });
    const matchId = created.data.id;
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(`${matchId}-p${i}`);
      await pg().insert(matchParticipants).values({ id: ids[i], match_id: matchId, user_id: `u${i}`, username: `P${i}` });
    }
    const [g] = await toBattle(matchId);
    const teams = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false)));
    expect(teams).toHaveLength(2);
    // join order is round-robin: team 1 = p0, p2; team 2 = p1, p3
    expect((await score(matchId, g, { type: 'Position', matchId, gameId: g, positionResults: { [ids[0]]: 1, [ids[1]]: 2, [ids[2]]: 3, [ids[3]]: 4 } })).status).toBe(200);
    const teamRows = (await placements(g)).filter((p) => p.entity_type === 'team');
    expect(teamRows.map((p) => [p.points_awarded, p.is_winner])).toEqual([[40, true], [30, false]]);
    expect((await matchRow(matchId)).status).toBe('complete');
  });
});

describe('voice announcements and map codes', () => {
  it('queues "nextround" / "finish" voice lines when team channels exist and DMs the map code of the next map', async () => {
    await pg().update(games).set({ map_codes_supported: true }).where(eq(games.id, gameId));
    const s = await setupMatch('Normal', { maps: 2, players: 2 });
    await pg().insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't', winner_vote_enabled: false });
    await post(s.matchId, 'gather');
    await post(s.matchId, 'assign');
    const teams = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, s.matchId), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
    await appRequest(`/api/matches/${s.matchId}/assign-teams`, { method: 'POST', json: { teamAssignments: [], teamVoiceChannels: [{ teamId: teams[0].id, channelId: 'vc-blue' }, { teamId: teams[1].id, channelId: 'vc-red' }] } });
    const maps = (await appRequest(`/api/matches/${s.matchId}`)).data.maps as string[];
    expect((await appRequest(`/api/matches/${s.matchId}/map-codes`, { method: 'POST', json: { mapCodes: { [maps[0]]: 'AAA', [maps[1]]: 'BBB' } } })).status).toBe(200);
    await post(s.matchId, 'battle');
    const [g1, g2] = await gamesOf(s.matchId);
    const { discordMapCodeQueue } = await import('../../../lib/db/schema');
    expect((await pg().select().from(discordMapCodeQueue).where(eq(discordMapCodeQueue.match_id, s.matchId))).map((r) => r.map_code)).toEqual(['AAA']);
    await score(s.matchId, g1, { winnerTeamId: teams[0].id });
    expect((await pg().select().from(discordMapCodeQueue).where(eq(discordMapCodeQueue.match_id, s.matchId))).map((r) => r.map_code).sort()).toEqual(['AAA', 'BBB']);
    await score(s.matchId, g2, { winnerTeamId: teams[1].id });
    const voice = await pg().select().from(discordVoiceAnnouncementQueue).where(eq(discordVoiceAnnouncementQueue.match_id, s.matchId));
    expect(voice.map((v) => v.announcement_type).sort()).toEqual(['finish', 'nextround', 'welcome']);
    expect(voice[0]).toMatchObject({ blue_team_voice_channel: 'vc-blue', red_team_voice_channel: 'vc-red' });
    expect(await pg().select().from(discordMatchStartQueue).where(eq(discordMatchStartQueue.match_id, s.matchId))).toHaveLength(0);
  });
});
