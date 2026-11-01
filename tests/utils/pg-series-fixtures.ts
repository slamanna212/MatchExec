/**
 * Postgres-harness fixtures and API drivers for the series domain (use with setupPgTestFile()).
 * `finishedNormal` / `finishedFfa` / `finishedPosition` play real matches through the Hono routes, like a user would.
 */
import { randomBytes } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { getPgTestDb } from './pg-test-db';
import { appRequest } from './app-request';
import { createGameMode } from './pg-fixtures';
import { gameMaps, matchGames, matchParticipants, matchTeams, matches, series, seriesEvents } from '../../lib/db/schema';

export const uid = (prefix: string): string => `${prefix}${randomBytes(6).toString('hex')}`;
let seq = 0;

/** Insert a series row directly. */
export async function insertSeries(overrides: Partial<typeof series.$inferInsert> = {}) {
  const [row] = await getPgTestDb().insert(series).values({ id: uid('s_'), name: 'Series', status: 'active', ...overrides }).returning();
  return row;
}

let linkOrder = 0;
/** Link a match or tournament to a series directly (bypasses the API). */
export async function linkEvent(seriesId: string, kind: 'match' | 'tournament', entityId: string, overrides: Partial<typeof seriesEvents.$inferInsert> = {}) {
  const [row] = await getPgTestDb().insert(seriesEvents).values({
    id: uid('se_'), series_id: seriesId, event_type: kind, match_id: kind === 'match' ? entityId : null, tournament_id: kind === 'tournament' ? entityId : null,
    event_order: ++linkOrder, ...overrides,
  }).returning();
  return row;
}

// ─── API drivers ─────────────────────────────────────────────────────────────

export async function createSeriesApi(config?: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await appRequest('/api/series', { method: 'POST', json: { name: `S${++seq}`, ...(config ? { scoring_config: config } : {}), ...extra } });
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data.id as string;
}

export const addEventApi = (seriesId: string, json: Record<string, unknown>) =>
  appRequest(`/api/series/${seriesId}/events`, { method: 'POST', json });

export const transitionSeriesApi = (seriesId: string, status: string) =>
  appRequest(`/api/series/${seriesId}/transition`, { method: 'POST', json: { status } });

export interface StandingRowDto { rank: number; user_id: string; username: string; total_points: number; events_played: number; events: Array<{ series_event_id: string; points: number | null }> }

export async function standingsApi(seriesId: string): Promise<StandingRowDto[]> {
  const res = await appRequest(`/api/series/${seriesId}/standings`);
  expect(res.status).toBe(200);
  return res.data.standings;
}

export const pointsOf = async (seriesId: string): Promise<Record<string, number>> =>
  Object.fromEntries((await standingsApi(seriesId)).map((r) => [r.user_id, r.total_points]));

// ─── Matches played through the real routes ──────────────────────────────────

/** A mode of the given scoring type with `maps` maps. */
export async function modeWithMaps(gameId: string, scoringType: 'Normal' | 'FFA' | 'Position', teamSize: number | null, maps = 3) {
  const m = await createGameMode(gameId, { scoring_type: scoringType, team_size: teamSize, name: `${scoringType} ${++seq}` });
  const mapIds: string[] = [];
  for (let i = 0; i < maps; i++) {
    const id = `smap-${++seq}`;
    await getPgTestDb().insert(gameMaps).values({ id, game_id: gameId, mode_id: m.id, name: id });
    mapIds.push(id);
  }
  return { modeId: m.id, mapIds };
}

export const moveMatch = (matchId: string, newStatus: string) =>
  appRequest(`/api/matches/${matchId}/transition`, { method: 'POST', json: { newStatus } });

/** Create a match with `players` participants (discord ids 100.. so identities repeat across matches). */
export async function newMatch(gameId: string, mapIds: string[], players: number, extra: Record<string, unknown> = {}) {
  const res = await appRequest('/api/matches', {
    method: 'POST', json: { name: `M${++seq}`, gameId, maps: mapIds, rounds: mapIds.length, startDate: new Date().toISOString(), ...extra },
  });
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  const matchId: string = res.data.id;
  const ids: string[] = [];
  for (let i = 0; i < players; i++) {
    const id = `${matchId}-p${i}`;
    await getPgTestDb().insert(matchParticipants).values({ id, match_id: matchId, user_id: `user-${i}`, discord_user_id: `${100 + i}`, username: `Player${i}` });
    ids.push(id);
  }
  return { matchId, ids };
}

export const gamesOf = (matchId: string) =>
  getPgTestDb().select({ id: matchGames.id }).from(matchGames).where(eq(matchGames.match_id, matchId)).orderBy(asc(matchGames.round));

export const scoreGame = (matchId: string, gId: string, body: Record<string, unknown>) =>
  appRequest(`/api/matches/${matchId}/games/${gId}/result`, { method: 'POST', json: body });

/**
 * A finished Normal match. `layout[i]` is player i's team: a team index, 'reserve' or null (unassigned).
 * Team 0 wins unless `outcome` is 'draw' or a team index.
 */
export async function finishedNormal(gameId: string, layout: Array<number | 'reserve' | null>, outcome: number | 'draw' = 0, teamCount = 2) {
  const { mapIds } = await modeWithMaps(gameId, 'Normal', 5, 1);
  const { matchId, ids } = await newMatch(gameId, mapIds, layout.length, { teamCount });
  await moveMatch(matchId, 'gather');
  await moveMatch(matchId, 'assign');
  const teams = await getPgTestDb().select({ id: matchTeams.id, is_reserve: matchTeams.is_reserve }).from(matchTeams)
    .where(eq(matchTeams.match_id, matchId)).orderBy(asc(matchTeams.team_order));
  const playing = teams.filter((t) => !t.is_reserve);
  const reserve = teams.find((t) => t.is_reserve)!;
  const assignments = layout.flatMap((slot, i) =>
    slot === null ? [] : [{ participantId: ids[i], teamId: slot === 'reserve' ? reserve.id : playing[slot].id }],
  );
  const res = await appRequest(`/api/matches/${matchId}/assign-teams`, { method: 'POST', json: { teamAssignments: assignments } });
  expect(res.status, JSON.stringify(res.data)).toBe(200);
  await moveMatch(matchId, 'battle');
  const [g] = await gamesOf(matchId);
  const body = outcome === 'draw' ? { draw: true } : { winnerTeamId: playing[outcome].id, winnerScore: 13, loserScore: 4 };
  const scored = await scoreGame(matchId, g.id, body);
  expect(scored.status, JSON.stringify(scored.data)).toBe(200);
  const [row] = await getPgTestDb().select({ status: matches.status }).from(matches).where(eq(matches.id, matchId));
  expect(row.status).toBe('complete');
  return { matchId, ids, gameId: g.id, teams: playing };
}

export async function finishedFfa(gameId: string, players: number, winnerIdx: number) {
  const { mapIds } = await modeWithMaps(gameId, 'FFA', null, 2);
  const { matchId, ids } = await newMatch(gameId, mapIds, players);
  for (const s of ['gather', 'assign', 'battle']) await moveMatch(matchId, s);
  for (const g of await gamesOf(matchId)) {
    const res = await scoreGame(matchId, g.id, { type: 'FFA', matchId, gameId: g.id, winnerParticipantId: ids[winnerIdx] });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
  }
  return { matchId, ids };
}

/** Finished Position match; `order` lists player indexes first to last. */
export async function finishedPosition(gameId: string, players: number, order: number[]) {
  const { mapIds } = await modeWithMaps(gameId, 'Position', 1, 1);
  const { matchId, ids } = await newMatch(gameId, mapIds, players);
  for (const s of ['gather', 'assign', 'battle']) await moveMatch(matchId, s);
  const [g] = await gamesOf(matchId);
  const positionResults = Object.fromEntries(order.map((idx, k) => [ids[idx], k + 1]));
  const res = await scoreGame(matchId, g.id, { type: 'Position', matchId, gameId: g.id, positionResults });
  expect(res.status, JSON.stringify(res.data)).toBe(200);
  return { matchId, ids };
}
