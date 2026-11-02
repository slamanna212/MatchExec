// @vitest-environment node
/**
 * Response-shape (DTO) contract for the main endpoints: exact key sets and the JSON types the SPA relies on
 * (booleans are booleans, timestamps are ISO strings, jsonb columns are objects/arrays). Behaviour parity with the
 * pre-migration API is documented in PLATFORM_MIGRATION_PLAN.md (Stage 3 DTO changes); this test pins the result.
 */
import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createMatchParticipant } from '../../utils/pg-fixtures';
import { gameMaps, matchTeams } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
const keys = (o: object): string[] => Object.keys(o).sort();
const isIso = (v: unknown): boolean => typeof v === 'string' && ISO.test(v);

function expectTypes(row: Record<string, unknown>, types: { iso?: string[]; bool?: string[]; num?: string[]; str?: string[] }) {
  for (const k of types.iso ?? []) expect(isIso(row[k]), `${k} should be an ISO string, got ${JSON.stringify(row[k])}`).toBe(true);
  for (const k of types.bool ?? []) expect(typeof row[k], k).toBe('boolean');
  for (const k of types.num ?? []) expect(typeof row[k], k).toBe('number');
  for (const k of types.str ?? []) expect(typeof row[k], k).toBe('string');
}

async function playMatch() {
  const game = await createGame();
  const mode = await createGameMode(game.id, { scoring_type: 'Normal', team_size: 5 });
  const db = getPgTestDb();
  await db.insert(gameMaps).values([1, 2].map((i) => ({ id: `dto-map-${i}`, game_id: game.id, mode_id: mode.id, name: `Map ${i}` })));
  const created = await appRequest('/api/matches', {
    method: 'POST', json: { name: 'DTO match', gameId: game.id, maps: ['dto-map-1', 'dto-map-2'], rounds: 2, startDate: new Date().toISOString() },
  });
  expect(created.status).toBe(201);
  const matchId: string = created.data.id;
  const t = (newStatus: string) => appRequest(`/api/matches/${matchId}/transition`, { method: 'POST', json: { newStatus } });
  await t('gather');
  const p1 = await createMatchParticipant(matchId, 'd1', 'One');
  const p2 = await createMatchParticipant(matchId, 'd2', 'Two');
  await t('assign');
  const teams = await db.select().from(matchTeams).where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
  await appRequest(`/api/matches/${matchId}/assign-teams`, {
    method: 'POST', json: { teamAssignments: [{ participantId: p1.id, teamId: teams[0].id }, { participantId: p2.id, teamId: teams[1].id }] },
  });
  await t('battle');
  const games = await appRequest(`/api/matches/${matchId}/games`);
  const gameIds: string[] = games.data.games.map((g: { id: string }) => g.id);
  return { game, mode, matchId, gameIds, teams, t };
}

describe('match DTOs', () => {
  it('list item, detail, participants, games, result and overall score keep their shapes', async () => {
    const { matchId, gameIds, teams } = await playMatch();

    const list = await appRequest('/api/matches?status=battle');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.data)).toBe(true);
    const item = list.data.find((m: { id: string }) => m.id === matchId);
    expect(item).toBeDefined();
    for (const k of ['id', 'name', 'status', 'game_id', 'game_name', 'start_date', 'created_at', 'updated_at', 'participant_count', 'series']) expect(item).toHaveProperty(k);
    expectTypes(item, { iso: ['start_date', 'created_at', 'updated_at'], bool: ['player_notifications', 'stats_enabled'].filter((k) => k in item) });
    expect(Array.isArray(item.series)).toBe(true);

    const detail = (await appRequest(`/api/matches/${matchId}`)).data;
    expect(keys(detail)).toEqual(expect.arrayContaining([
      'id', 'name', 'status', 'game_id', 'mode_id', 'game_name', 'scoring_type', 'maps', 'map_codes', 'announcements', 'rounds', 'start_date',
      'created_at', 'updated_at', 'player_notifications', 'stats_enabled', 'map_codes_supported', 'max_participants', 'team_count',
    ]));
    expectTypes(detail, { iso: ['start_date', 'created_at', 'updated_at'], bool: ['player_notifications', 'stats_enabled', 'map_codes_supported'], num: ['rounds', 'team_count', 'max_participants'] });
    expect(Array.isArray(detail.maps)).toBe(true);
    expect(typeof detail.map_codes).toBe('object');

    const parts = (await appRequest(`/api/matches/${matchId}/participants`)).data;
    expect(keys(parts)).toEqual(expect.arrayContaining(['participants']));
    expect(keys(parts.participants[0])).toEqual(['avatar_url', 'discord_user_id', 'id', 'joined_at', 'receives_map_codes', 'signup_data', 'team_assignment', 'team_id', 'user_id', 'username']);
    expectTypes(parts.participants[0], { iso: ['joined_at'], bool: ['receives_map_codes'] });

    const games = (await appRequest(`/api/matches/${matchId}/games`)).data;
    expect(games.success).toBe(true);
    expect(keys(games.games[0])).toEqual(expect.arrayContaining(['id', 'match_id', 'round', 'map_id', 'map_name', 'status', 'created_at', 'updated_at', 'discord_notified', 'mode_scoring_type']));
    expectTypes(games.games[0], { iso: ['created_at', 'updated_at'], bool: ['discord_notified'], num: ['round'] });

    expect((await appRequest(`/api/matches/${matchId}/games/${gameIds[0]}/result`, { method: 'POST', json: { winnerTeamId: teams[0].id, winnerScore: 3, loserScore: 1 } })).status).toBe(200);
    const overall = (await appRequest(`/api/matches/${matchId}/overall-score`)).data;
    expect(keys(overall)).toEqual(['overallWinner', 'overallWinnerTeamId', 'scoringType', 'team1Wins', 'team2Wins', 'teamScores', 'totalNormalGames']);
    expect(keys(overall.teamScores[0])).toEqual(['teamId', 'teamName', 'teamOrder', 'wins']);

    const gwr = await appRequest(`/api/matches/${matchId}/games-with-results`);
    expect(gwr.status).toBe(200);
  });
});

describe('tournament, series, feed, games, system DTOs', () => {
  it('tournament list/detail', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id, { scoring_type: 'Normal' });
    const created = await appRequest('/api/tournaments', {
      method: 'POST', json: { name: 'DTO cup', gameId: game.id, gameModeId: mode.id, format: 'single-elimination', roundsPerMatch: 3, startDate: new Date().toISOString() },
    });
    expect(created.status).toBe(201);
    const list = (await appRequest('/api/tournaments')).data;
    expect(keys(list[0])).toEqual(expect.arrayContaining([
      'id', 'name', 'format', 'status', 'game_id', 'game_mode_id', 'game_name', 'participant_count', 'has_bracket', 'series', 'announcements',
      'position_scoring_override', 'rounds_per_match', 'ruleset', 'start_date', 'created_at', 'updated_at', 'stats_enabled', 'player_notifications',
      'allow_match_editing', 'allow_player_team_selection',
    ]));
    expectTypes(list[0], { iso: ['start_date', 'created_at', 'updated_at'], bool: ['has_bracket', 'stats_enabled', 'player_notifications', 'allow_match_editing', 'allow_player_team_selection'], num: ['participant_count', 'rounds_per_match'] });
    expect(Array.isArray(list[0].series)).toBe(true);
    const detail = (await appRequest(`/api/tournaments/${created.data.id}`)).data;
    expect(keys(detail)).toEqual(expect.arrayContaining(['id', 'name', 'format', 'status', 'teams', 'participant_count']));
    expect(Array.isArray(detail.teams)).toBe(true);
    expectTypes(detail, { iso: ['created_at', 'updated_at'], bool: ['stats_enabled', 'player_notifications'] });
  });

  it('series list, events and standings', async () => {
    const { matchId, gameIds, teams } = await playMatch();
    const s = await appRequest('/api/series', { method: 'POST', json: { name: 'DTO series' } });
    const seriesId: string = s.data.id;
    expect((await appRequest(`/api/series/${seriesId}/transition`, { method: 'POST', json: { status: 'active' } })).status).toBe(200);
    expect((await appRequest(`/api/series/${seriesId}/events`, { method: 'POST', json: { event_type: 'match', match_id: matchId, points_multiplier: 1 } })).status).toBe(201);
    for (const g of gameIds) await appRequest(`/api/matches/${matchId}/games/${g}/result`, { method: 'POST', json: { winnerTeamId: teams[0].id, winnerScore: 3, loserScore: 1 } });

    const list = (await appRequest('/api/series')).data;
    expect(Object.keys(list)).toEqual(['series']);
    expect(keys(list.series[0])).toEqual(expect.arrayContaining([
      'id', 'name', 'status', 'announcements', 'player_notifications', 'scoring_config', 'event_count', 'completed_event_count', 'participant_count',
      'next_event', 'champion', 'created_at', 'updated_at', 'start_date', 'end_date',
    ]));
    expectTypes(list.series[0], { iso: ['created_at', 'updated_at'], bool: ['announcements', 'player_notifications'], num: ['event_count', 'completed_event_count', 'participant_count'] });

    const events = (await appRequest(`/api/series/${seriesId}/events`)).data;
    expect(Object.keys(events)).toEqual(['events']);
    expect(keys(events.events[0])).toEqual(expect.arrayContaining(['id', 'series_id', 'event_type', 'match_id', 'tournament_id', 'event_order', 'points_multiplier', 'name', 'status', 'start_date']));
    expectTypes(events.events[0], { num: ['event_order', 'points_multiplier'], iso: ['start_date'] });

    const standings = (await appRequest(`/api/series/${seriesId}/standings`)).data;
    expect(keys(standings)).toEqual(['series_id', 'series_name', 'standings']);
    expect(standings.standings.length).toBeGreaterThan(0);
    expect(keys(standings.standings[0])).toEqual(['events', 'events_played', 'rank', 'total_points', 'user_id', 'username']);
    expect(keys(standings.standings[0].events[0])).toEqual(['points', 'series_event_id']);
  });

  it('feed, games, settings, health and db-status', async () => {
    await playMatch();
    const feed = (await appRequest('/api/feed')).data;
    expect(keys(feed)).toEqual(['events', 'limit', 'offset', 'total']);
    expect(feed.events.length).toBeGreaterThan(0);
    expect(keys(feed.events[0])).toEqual(['created_at', 'description', 'event_type', 'id', 'match_id', 'metadata', 'priority', 'title', 'tournament_id']);
    expectTypes(feed.events[0], { iso: ['created_at'], num: ['priority'], str: ['title', 'description', 'event_type'] });

    const gamesList = (await appRequest('/api/games')).data;
    expect(keys(gamesList[0])).toEqual(['color', 'coverUrl', 'description', 'developer', 'genre', 'iconUrl', 'id', 'mapCount', 'maxPlayers', 'minPlayers', 'modeCount', 'name', 'supportsAllModes']);
    expectTypes(gamesList[0], { bool: ['supportsAllModes'], num: ['mapCount', 'modeCount', 'minPlayers', 'maxPlayers'] });

    expect((await appRequest('/api/settings/ui')).data).toEqual({ auto_refresh_interval_seconds: expect.any(Number) });

    const health = (await appRequest('/api/health')).data;
    expect(keys(health)).toEqual(['services', 'status', 'timestamp']);
    expect(keys(health.services)).toEqual(['database', 'web']);
    expect(isIso(health.timestamp)).toBe(true);

    const dbStatus = (await appRequest('/api/db-status')).data;
    expect(keys(dbStatus)).toEqual(expect.arrayContaining(['progress', 'ready', 'timestamp']));
    expect(typeof dbStatus.ready).toBe('boolean');
  });
});
