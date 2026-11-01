// @vitest-environment node
/**
 * Scoring on Postgres (ported from the old scoring-functions / -extended / -edge-cases / -n-team-results suites):
 * map games, saving and reading results, rescoring, winners, overall scores and notifications.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import {
  discordDeletionQueue, discordMapCodeQueue, discordMatchWinnerQueue, discordScoreNotificationQueue, gameMaps, games, matchGamePlacements,
  matchGames, matchParticipants, matchTeams, matches,
} from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import {
  GameAlreadyScoredError, calculatePositionPoints, determineMatchWinner, ensureMatchGameExists, getGameResult, getMatchGames,
  getMatchGamesWithResults, getMatchResult, getOverallMatchScore, getOverallPositionScore, getPointsForPositionByMatchId,
  initializeMatchGames, resolvePositionScoringConfig, resolveWinnerEntity, saveMatchResult,
} from '@/lib/matches';
import { DEFAULT_POSITION_SPREAD, getPointsForPosition } from '@/lib/scoring/position';
import type { MatchResult, PositionScoringConfig } from '@/shared/types';
import { logFeedEvent } from '@/lib/feed-helpers';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', () => ({ logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  vi.mocked(logFeedEvent).mockClear();
  gameId = (await createGame()).id;
  modeId = (await createGameMode(gameId)).id;
});

const cfg = (pointsPerPosition: Record<string, number>): PositionScoringConfig => ({ type: 'Position', pointsPerPosition });
let seq = 0;
const addMap = async (id: string, name = id, forGame = gameId, forMode: string | null = modeId) => {
  await pg().insert(gameMaps).values({ id, game_id: forGame, mode_id: forMode, name });
};
const addPlayer = async (matchId: string, name: string, discord = `disc-${name}`) => {
  const id = `${matchId}-${name}-${++seq}`;
  await pg().insert(matchParticipants).values({ id, match_id: matchId, user_id: `u-${id}`, discord_user_id: discord, username: name });
  return { id };
};
async function addTeams(matchId: string, names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < names.length; i++) {
    ids.push(`${matchId}_t${i}`);
    await pg().insert(matchTeams).values({ id: ids[i], match_id: matchId, team_name: names[i], team_order: i, is_reserve: false });
  }
  return ids;
}
async function addGames(matchId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    ids.push(`${matchId}_game_${i}`);
    await pg().insert(matchGames).values({ id: ids[i - 1], match_id: matchId, round: i, status: i === 1 ? 'ongoing' : 'pending' });
  }
  return ids;
}
const result = (matchId: string, gId: string, extra: Partial<MatchResult> = {}): MatchResult =>
  ({ matchId, gameId: gId, winner: 'team1', isFfaMode: false, completedAt: new Date(), ...extra });
const save = (matchId: string, gId: string, extra: Partial<MatchResult> = {}) => saveMatchResult(db, gId, result(matchId, gId, extra));
const placementsOf = (gId: string) => pg().select().from(matchGamePlacements).where(eq(matchGamePlacements.match_game_id, gId)).orderBy(asc(matchGamePlacements.entity_id));
const matchRow = async (id: string) => (await pg().select().from(matches).where(eq(matches.id, id)))[0];
const count = async (table: typeof discordDeletionQueue | typeof discordMatchWinnerQueue | typeof discordScoreNotificationQueue, matchId: string) =>
  (await pg().select().from(table).where(eq(table.match_id, matchId))).length;

/** Insert completed games with team placements directly (winner null = no winner row, draw = every team at position 1). */
async function scoredGame(matchId: string, round: number, teamIds: string[], winnerId: string | null, status: 'completed' | 'pending' = 'completed') {
  const id = `${matchId}_game_${round}`;
  await pg().insert(matchGames).values({ id, match_id: matchId, round, status });
  if (winnerId === null) return id;
  await pg().insert(matchGamePlacements).values(teamIds.map((t, i) => ({
    id: `${id}-pl${i}`, match_game_id: id, entity_type: 'team' as const, entity_id: t, position: t === winnerId ? 1 : 2, is_winner: t === winnerId,
  })));
  return id;
}

describe('getPointsForPosition', () => {
  it('returns the configured points for valid positions', () => {
    const c = cfg({ '1': 10, '2': 8, '3': 6, '4': 4 });
    expect([1, 2, 3, 4].map((p) => getPointsForPosition(p, c))).toEqual([10, 8, 6, 4]);
  });

  it('returns 0 for positions beyond the spread, zero, negative, huge and fractional ones', () => {
    const c = cfg({ '1': 10, '2': 5 });
    for (const p of [5, 10, 0, -1, 99, 1000000, 1.5]) expect(getPointsForPosition(p, c)).toBe(0);
  });

  it('honours an explicitly configured position 0 and very large keys', () => {
    expect(getPointsForPosition(0, cfg({ '0': 100, '1': 50 }))).toBe(100);
    expect(getPointsForPosition(1000, cfg({ '1000': 1 }))).toBe(1);
  });

  it('returns 0 for an empty spread and for spreads that award 0', () => {
    expect(getPointsForPosition(1, cfg({}))).toBe(0);
    const zeros = cfg({ '1': 0, '2': 0 });
    expect([getPointsForPosition(1, zeros), getPointsForPosition(2, zeros)]).toEqual([0, 0]);
  });

  it.each([[1, 100], [2, 75], [3, 50], [4, 25], [5, 0], [0, 0]])('position %i scores %i on a 100/75/50/25 spread', (pos, expected) => {
    expect(getPointsForPosition(pos, cfg({ '1': 100, '2': 75, '3': 50, '4': 25 }))).toBe(expected);
  });
});

describe('position points per match', () => {
  it('resolves the spread through match override > tournament > game config > default', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await resolvePositionScoringConfig(db, m.id)).pointsPerPosition).toEqual(DEFAULT_POSITION_SPREAD);
    await pg().update(games).set({ scoring_config: { type: 'Position', pointsPerPosition: { '1': 7 } } }).where(eq(games.id, gameId));
    expect((await resolvePositionScoringConfig(db, m.id)).pointsPerPosition).toEqual({ '1': 7 });
    await pg().update(matches).set({ position_scoring_override: { '1': 99, '2': 1 } as never }).where(eq(matches.id, m.id));
    expect((await resolvePositionScoringConfig(db, m.id)).pointsPerPosition).toEqual({ '1': 99, '2': 1 });
    expect(await getPointsForPositionByMatchId(db, 2, m.id)).toBe(1);
    expect(await getPointsForPositionByMatchId(db, 5, m.id)).toBe(0);
  });

  it('falls back to the default spread for an unknown match', async () => {
    expect((await resolvePositionScoringConfig(db, 'ghost')).pointsPerPosition).toEqual(DEFAULT_POSITION_SPREAD);
  });

  it('calculatePositionPoints uses the default spread when the game has no scoring config', async () => {
    const m = await createMatch(gameId, modeId);
    const [g] = await addGames(m.id, 1);
    expect(await calculatePositionPoints(db, { p1: 1, p2: 2, p3: 11 }, g)).toEqual({ p1: 25, p2: 18, p3: 0 });
  });

  it('calculatePositionPoints follows the match override and ignores an unknown game', async () => {
    const m = await createMatch(gameId, modeId, { position_scoring_override: { '1': 5, '2': 3 } as never });
    const [g] = await addGames(m.id, 1);
    expect(await calculatePositionPoints(db, { a: 2, b: 1 }, g)).toEqual({ a: 3, b: 5 });
    expect(await calculatePositionPoints(db, { a: 1 }, 'no-game')).toEqual({ a: 25 });
  });

  it('a malformed stored spread falls back to the default instead of awarding 0', async () => {
    await pg().update(games).set({ scoring_config: 'not-valid-json' as never }).where(eq(games.id, gameId));
    const m = await createMatch(gameId, modeId);
    const [g] = await addGames(m.id, 1);
    expect(await calculatePositionPoints(db, { p1: 1 }, g)).toEqual({ p1: 25 });
  });
});

describe('initializeMatchGames', () => {
  it('creates one game per map, the first ongoing and the rest pending, in round order', async () => {
    await addMap('map-a');
    const m = await createMatch(gameId, modeId, { maps: ['map-a', 'map-a', 'map-a'] });
    await initializeMatchGames(db, m.id);
    const rows = await pg().select().from(matchGames).where(eq(matchGames.match_id, m.id)).orderBy(asc(matchGames.round));
    expect(rows.map((r) => [r.round, r.status])).toEqual([[1, 'ongoing'], [2, 'pending'], [3, 'pending']]);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3].map((n) => `${m.id}_game_${n}`));
  });

  it('skips matches without maps (none, null or an empty list)', async () => {
    const plain = await createMatch(gameId, modeId);
    const empty = await createMatch(gameId, modeId, { maps: [] });
    for (const id of [plain.id, empty.id, 'ghost']) {
      await initializeMatchGames(db, id);
      expect(await pg().select().from(matchGames).where(eq(matchGames.match_id, id))).toHaveLength(0);
    }
  });

  it('ignores non-string junk in the stored maps', async () => {
    const m = await createMatch(gameId, modeId, { maps: ['m1', 5, null, 'm2'] as never });
    await initializeMatchGames(db, m.id);
    expect(await pg().select().from(matchGames).where(eq(matchGames.match_id, m.id))).toHaveLength(2);
  });

  it('is idempotent: calling again keeps the same rows', async () => {
    const m = await createMatch(gameId, modeId, { maps: ['m1', 'm2', 'm3'] });
    await initializeMatchGames(db, m.id);
    const first = await pg().select().from(matchGames).where(eq(matchGames.match_id, m.id));
    await initializeMatchGames(db, m.id);
    const second = await pg().select().from(matchGames).where(eq(matchGames.match_id, m.id));
    expect(second).toHaveLength(3);
    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort());
  });
});

describe('getMatchGames', () => {
  it('returns games with their map data, in round order', async () => {
    await pg().insert(gameMaps).values({ id: 'map-img', game_id: gameId, mode_id: modeId, name: 'Image Map', image_url: '/test-image.png' });
    await addMap('map-b', 'Map B');
    const m = await createMatch(gameId, modeId, { maps: ['map-img', 'map-b', 'map-img'] });
    await initializeMatchGames(db, m.id);
    const list = await getMatchGames(db, m.id);
    expect(list.map((g) => g.round)).toEqual([1, 2, 3]);
    expect(list[0]).toMatchObject({ map_name: 'Image Map', image_url: '/test-image.png' });
    expect(list[1]).toMatchObject({ map_name: 'Map B' });
  });

  it('returns an empty list for matches without games and for unknown matches', async () => {
    const m = await createMatch(gameId, modeId);
    expect(await getMatchGames(db, m.id)).toEqual([]);
    expect(await getMatchGames(db, 'nonexistent')).toEqual([]);
  });
});

describe('saveMatchResult and getMatchResult', () => {
  it('saves and reads back a team result, creating the missing game row', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    const gid = `${m.id}_game_1`;
    await save(m.id, gid);
    const got = await getMatchResult(db, gid);
    expect(got).toMatchObject({ winner: 'team1', matchId: m.id, isFfaMode: false });
    expect(got?.completedAt).toBeInstanceOf(Date);
  });

  it('saves and reads back an FFA winner', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA', name: 'FFA' });
    const m = await createMatch(gameId, ffa.id, { status: 'battle' });
    const p = await addPlayer(m.id, 'Solo');
    const gid = `${m.id}_game_1`;
    await save(m.id, gid, { isFfaMode: true, participantWinnerId: p.id });
    expect(await getMatchResult(db, gid)).toMatchObject({ isFfaMode: true, participantWinnerId: p.id });
  });

  it('returns null for unknown games and for games without a result yet', async () => {
    expect(await getMatchResult(db, 'non-existent-game')).toBeNull();
    await addMap('map-r');
    const m = await createMatch(gameId, modeId, { maps: ['map-r'] });
    await initializeMatchGames(db, m.id);
    expect(await getMatchResult(db, `${m.id}_game_1`)).toBeNull();
  });

  it('reads a one-racer Position game back as Position (scoring_type from the mode, not row counts)', async () => {
    const pos = await createGameMode(gameId, { scoring_type: 'Position', name: 'Race' });
    const m = await createMatch(gameId, pos.id, { status: 'battle' });
    const [gid] = await addGames(m.id, 2);
    const a = await addPlayer(m.id, 'Solo');
    await save(m.id, gid, { isPositionMode: true, positionResults: { [a.id]: 1 } });
    expect(await getMatchResult(db, gid)).toMatchObject({ isPositionMode: true, positionResults: { [a.id]: 1 } });
    expect((await getGameResult(db, gid))?.type).toBe('Position');
  });
});

describe('rescoring replaces placements', () => {
  it('FFA rescore leaves exactly one winner row', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA', name: 'FFA Mode' });
    const m = await createMatch(gameId, ffa.id, { status: 'battle' });
    const [gid] = await addGames(m.id, 2);
    const p1 = await addPlayer(m.id, 'Alice');
    const p2 = await addPlayer(m.id, 'Bob');
    await save(m.id, gid, { isFfaMode: true, participantWinnerId: p1.id });
    await save(m.id, gid, { isFfaMode: true, participantWinnerId: p2.id, rescore: true });
    const rows = await placementsOf(gid);
    expect(rows).toHaveLength(1);
    expect(rows[0].entity_id).toBe(p2.id);
    expect(rows.filter((r) => r.is_winner)).toHaveLength(1);
  });

  it('Position rescore drops racers no longer present', async () => {
    const pos = await createGameMode(gameId, { scoring_type: 'Position', name: 'Race' });
    const m = await createMatch(gameId, pos.id, { status: 'battle' });
    const [gid] = await addGames(m.id, 2);
    const [a, b, c] = [await addPlayer(m.id, 'A'), await addPlayer(m.id, 'B'), await addPlayer(m.id, 'C')];
    const base = { isPositionMode: true };
    await save(m.id, gid, { ...base, positionResults: { [a.id]: 1, [b.id]: 2, [c.id]: 3 } });
    await save(m.id, gid, { ...base, positionResults: { [b.id]: 1, [a.id]: 2 }, rescore: true });
    const rows = await placementsOf(gid);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.entity_id === b.id)?.position).toBe(1);
    expect(rows.find((r) => r.entity_id === c.id)).toBeUndefined();
  });

  it('Normal rescore flips the single winner', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    const [t0, t1] = await addTeams(m.id, ['Alpha', 'Beta']);
    const [gid] = await addGames(m.id, 2);
    await save(m.id, gid, { winnerTeamId: t0 });
    await save(m.id, gid, { winner: 'team2', winnerTeamId: t1, rescore: true });
    const rows = await placementsOf(gid);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.is_winner).map((r) => r.entity_id)).toEqual([t1]);
    expect(await getMatchResult(db, gid)).toMatchObject({ winner: 'team2', winnerTeamId: t1 });
  });

  it('rejects re-saving a scored game without rescore and leaves the result intact', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    const [t0, t1] = await addTeams(m.id, ['Alpha', 'Beta']);
    const [gid] = await addGames(m.id, 2);
    await save(m.id, gid, { winnerTeamId: t0 });
    await expect(save(m.id, gid, { winner: 'team2', winnerTeamId: t1 })).rejects.toBeInstanceOf(GameAlreadyScoredError);
    expect((await placementsOf(gid)).filter((r) => r.is_winner).map((r) => r.entity_id)).toEqual([t0]);
    const ongoing = await pg().select().from(matchGames).where(and(eq(matchGames.match_id, m.id), eq(matchGames.status, 'ongoing')));
    expect(ongoing).toHaveLength(1);
  });

  it('does not re-fire completion side effects but recomputes winner_team', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    const [t0, t1] = await addTeams(m.id, ['Alpha', 'Beta']);
    const [gid] = await addGames(m.id, 1);
    await save(m.id, gid, { winnerTeamId: t0 });
    expect(await matchRow(m.id)).toMatchObject({ status: 'complete', winner_team: t0 });
    expect(await count(discordDeletionQueue, m.id)).toBe(1);
    expect(await count(discordMatchWinnerQueue, m.id)).toBe(1);
    const completedEvents = () => vi.mocked(logFeedEvent).mock.calls.filter(([e]) => e.eventType === 'match_completed').length;
    expect(completedEvents()).toBe(1);
    const scoreNotifs = await count(discordScoreNotificationQueue, m.id);

    await save(m.id, gid, { winner: 'team2', winnerTeamId: t1, rescore: true });
    expect(await count(discordDeletionQueue, m.id)).toBe(1);
    expect(await count(discordMatchWinnerQueue, m.id)).toBe(1);
    expect(completedEvents()).toBe(1);
    expect(await count(discordScoreNotificationQueue, m.id)).toBe(scoreNotifs);
    expect((await matchRow(m.id)).winner_team).toBe(t1);
  });
});

describe('game ids', () => {
  it('refuses to create a match_games row for an arbitrary id', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    await expect(save(m.id, 'made-up-id')).rejects.toThrow(/not found/i);
    expect(await pg().select().from(matchGames).where(eq(matchGames.id, 'made-up-id'))).toHaveLength(0);
  });

  it('refuses a game belonging to another match', async () => {
    const m1 = await createMatch(gameId, modeId, { status: 'battle' });
    const m2 = await createMatch(gameId, modeId, { status: 'battle' });
    const [g2] = await addGames(m2.id, 1);
    await expect(save(m1.id, g2)).rejects.toThrow(/does not belong/i);
  });

  it('creates a missing `_game_N` row with round N and the Nth map', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle', maps: ['m-one', 'm-two-1776547135395-abc'] });
    const [t0] = await addTeams(m.id, ['Alpha', 'Beta']);
    const gid = `${m.id}_game_2`;
    await save(m.id, gid, { winnerTeamId: t0 });
    const row = (await pg().select().from(matchGames).where(eq(matchGames.id, gid)))[0];
    expect(row).toMatchObject({ round: 2, map_id: 'm-two-1776547135395-abc' });
  });

  it('rejects ids that do not follow the `_game_N` convention, or whose match does not exist', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    for (const suffix of ['x', '0', '01', '-1']) {
      await expect(save(m.id, `${m.id}_game_${suffix}`)).rejects.toThrow(/not found/);
    }
    await expect(ensureMatchGameExists(db, 'ghost_game_1', 'ghost')).rejects.toThrow(/not found/);
    await expect(ensureMatchGameExists(db, `${m.id}_game_1`, m.id)).resolves.toBeUndefined();
  });
});

describe('winner notifications', () => {
  it('names a 3rd team winner from match_teams and lists its players by team_id', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    const [, , t2] = await addTeams(m.id, ['Alpha', 'Beta', 'Gamma Squad']);
    const [gid] = await addGames(m.id, 1);
    const p = await addPlayer(m.id, 'Zed', 'discord-9');
    await pg().update(matchParticipants).set({ team_id: t2 }).where(eq(matchParticipants.id, p.id));
    await save(m.id, gid, { winner: 'team' as never, winnerTeamId: t2 });
    const q = (await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, m.id)))[0];
    expect(q).toMatchObject({ winner: 'team', winning_team_name: 'Gamma Squad', winning_players: ['<@discord-9>'] });
    const sn = (await pg().select().from(discordScoreNotificationQueue).where(eq(discordScoreNotificationQueue.match_id, m.id)))[0];
    expect(sn).toMatchObject({ winner: 'team', winning_team_name: 'Gamma Squad' });
    expect(await getMatchResult(db, gid)).toMatchObject({ winner: 'team', winnerTeamId: t2 });
  });

  it('queues a tie notification for a tied Normal match and leaves winner_team null', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    const [t0, t1] = await addTeams(m.id, ['Alpha', 'Beta']);
    const [g1, g2] = await addGames(m.id, 2);
    await save(m.id, g1, { winnerTeamId: t0 });
    await save(m.id, g2, { winner: 'team2', winnerTeamId: t1 });
    const q = (await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, m.id)))[0];
    expect(q).toMatchObject({ winner: 'tie', winning_team_name: 'Match Tied' });
    expect((await matchRow(m.id)).winner_team).toBeNull();
  });

  it('queues an FFA winner notification with the winner username', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA', name: 'FFA Mode' });
    const m = await createMatch(gameId, ffa.id, { status: 'battle' });
    const [g1, g2] = await addGames(m.id, 2);
    const a = await addPlayer(m.id, 'Alice', 'disc-a');
    await addPlayer(m.id, 'Bob', 'disc-b');
    await save(m.id, g1, { isFfaMode: true, participantWinnerId: a.id });
    await save(m.id, g2, { isFfaMode: true, participantWinnerId: a.id });
    const q = (await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, m.id)))[0];
    expect(q).toMatchObject({ winner: 'participant', winning_team_name: 'Alice', winning_players: ['<@disc-a>'], total_maps: 2 });
    expect((await matchRow(m.id)).winner_team).toBe(a.id);
    expect(await resolveWinnerEntity(db, m.id)).toEqual({ type: 'participant', id: a.id });
  });

  it('queues a Position tie when the totals are level', async () => {
    const pos = await createGameMode(gameId, { scoring_type: 'Position', name: 'Race' });
    const m = await createMatch(gameId, pos.id, { status: 'battle' });
    const [g1, g2] = await addGames(m.id, 2);
    const a = await addPlayer(m.id, 'Alice');
    const b = await addPlayer(m.id, 'Bob');
    const race = (first: string, second: string) => ({ isPositionMode: true, positionResults: { [first]: 1, [second]: 2 } });
    await save(m.id, g1, race(a.id, b.id));
    await save(m.id, g2, race(b.id, a.id));
    expect(await determineMatchWinner(db, m.id)).toBeNull();
    const q = (await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, m.id)))[0];
    expect(q.winner).toBe('tie');
  });
});

describe('draws', () => {
  it('records a Normal draw as a completed result with no winner', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    const [t0, t1] = await addTeams(m.id, ['Alpha', 'Beta']);
    const [gid] = await addGames(m.id, 2);
    await save(m.id, gid, { winner: 'tie', draw: true });
    const rows = await placementsOf(gid);
    expect(rows.map((r) => r.entity_id).sort()).toEqual([t0, t1].sort());
    expect(rows.every((r) => r.position === 1 && !r.is_winner)).toBe(true);
    expect((await pg().select().from(matchGames).where(eq(matchGames.id, gid)))[0].status).toBe('completed');
    expect(await getMatchResult(db, gid)).toMatchObject({ winner: 'tie', draw: true });
    const typed = await getGameResult(db, gid);
    expect(typed?.type).toBe('Normal');
    expect(typed?.placements.every((p) => !p.isWinner)).toBe(true);
  });
});

describe('team Position ranking', () => {
  it('writes tied team-endurance placements with no winner', async () => {
    const pos = await createGameMode(gameId, { scoring_type: 'Position', name: 'Endurance' });
    const m = await createMatch(gameId, pos.id, { status: 'battle', position_scoring_override: { '1': 4, '2': 3, '3': 2, '4': 1 } as never });
    const [t0, t1] = await addTeams(m.id, ['Alpha', 'Beta']);
    const [gid] = await addGames(m.id, 2);
    const ps = [];
    for (const [i, n] of ['A1', 'A2', 'B1', 'B2'].entries()) {
      const p = await addPlayer(m.id, n);
      await pg().update(matchParticipants).set({ team_id: i < 2 ? t0 : t1 }).where(eq(matchParticipants.id, p.id));
      ps.push(p);
    }
    // Spread 4/3/2/1: Alpha (1st + 4th) = 5, Beta (2nd + 3rd) = 5 -> tie.
    await save(m.id, gid, { isPositionMode: true, positionResults: { [ps[0].id]: 1, [ps[1].id]: 4, [ps[2].id]: 2, [ps[3].id]: 3 } });
    const teamRows = (await placementsOf(gid)).filter((r) => r.entity_type === 'team');
    expect(teamRows).toHaveLength(2);
    expect(teamRows.every((r) => r.position === 1 && r.points_awarded === 5 && !r.is_winner)).toBe(true);
  });
});

describe('getOverallPositionScore', () => {
  it('totals placements and reports a top tie as no winner', async () => {
    const pos = await createGameMode(gameId, { scoring_type: 'Position', name: 'Race' });
    const m = await createMatch(gameId, pos.id, { status: 'battle' });
    const [g1, g2] = await addGames(m.id, 3);
    const a = await addPlayer(m.id, 'A');
    const b = await addPlayer(m.id, 'B');
    await save(m.id, g1, { isPositionMode: true, positionResults: { [a.id]: 1, [b.id]: 2 } });
    await save(m.id, g2, { isPositionMode: true, positionResults: { [b.id]: 1, [a.id]: 2 } });
    const score = await getOverallPositionScore(db, m.id);
    expect(score.participantScores[a.id]).toEqual({ username: 'A', totalPoints: 43, races: 2 });
    expect(score.participantScores[b.id]).toEqual({ username: 'B', totalPoints: 43, races: 2 });
    expect(score.winner).toBeNull();
  });

  it('names the leader when the totals differ', async () => {
    const pos = await createGameMode(gameId, { scoring_type: 'Position', name: 'Race' });
    const m = await createMatch(gameId, pos.id, { status: 'battle' });
    const [g1] = await addGames(m.id, 2);
    const a = await addPlayer(m.id, 'A');
    const b = await addPlayer(m.id, 'B');
    await save(m.id, g1, { isPositionMode: true, positionResults: { [a.id]: 1, [b.id]: 2 } });
    expect((await getOverallPositionScore(db, m.id)).winner).toBe(a.id);
  });

  it('is empty for a match without results', async () => {
    const m = await createMatch(gameId, modeId);
    expect(await getOverallPositionScore(db, m.id)).toEqual({ participantScores: {}, winner: null });
  });
});

describe('getOverallMatchScore', () => {
  async function bestOf(winners: Array<'team1' | 'team2' | null>, status: 'completed' | 'pending' = 'completed') {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    const teams = await addTeams(m.id, ['Alpha', 'Beta']);
    for (const [i, w] of winners.entries()) await scoredGame(m.id, i + 1, teams, w === null ? null : w === 'team1' ? teams[0] : teams[1], status);
    return { m, teams };
  }

  it('counts wins for a 2-1 match', async () => {
    const { m, teams } = await bestOf(['team1', 'team2', 'team1']);
    const s = await getOverallMatchScore(db, m.id);
    expect(s).toMatchObject({ team1Wins: 2, team2Wins: 1, totalNormalGames: 3, overallWinner: 'team1', overallWinnerTeamId: teams[0], scoringType: 'Normal' });
  });

  it('is a tie when the wins are equal', async () => {
    const { m } = await bestOf(['team1', 'team2']);
    const s = await getOverallMatchScore(db, m.id);
    expect([s.team1Wins, s.team2Wins, s.overallWinner, s.overallWinnerTeamId]).toEqual([1, 1, 'tie', null]);
  });

  it('has no winner before any game is completed', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    await addTeams(m.id, ['Alpha', 'Beta']);
    const s = await getOverallMatchScore(db, m.id);
    expect([s.team1Wins, s.team2Wins, s.totalNormalGames, s.overallWinner]).toEqual([0, 0, 0, null]);
  });

  it('has no winner for a match with no teams at all', async () => {
    const m = await createMatch(gameId, modeId);
    expect((await getOverallMatchScore(db, m.id)).overallWinner).toBeNull();
    expect((await getOverallMatchScore(db, 'nonexistent')).overallWinner).toBeNull();
  });

  it('has no winner when only pending games exist', async () => {
    const { m } = await bestOf(['team1'], 'pending');
    expect((await getOverallMatchScore(db, m.id)).overallWinner).toBeNull();
  });

  it('has no winner when completed games produced no placements', async () => {
    const { m } = await bestOf([null]);
    const s = await getOverallMatchScore(db, m.id);
    expect([s.totalNormalGames, s.overallWinner]).toEqual([0, null]);
  });

  it('identifies the winner of a single-map match for either side', async () => {
    const { m } = await bestOf(['team2']);
    const s = await getOverallMatchScore(db, m.id);
    expect([s.team2Wins, s.overallWinner]).toEqual([1, 'team2']);
  });

  it('handles 3-0 sweeps for both sides', async () => {
    const t1 = await bestOf(['team1', 'team1', 'team1']);
    expect(await getOverallMatchScore(db, t1.m.id)).toMatchObject({ team1Wins: 3, team2Wins: 0, overallWinner: 'team1' });
    const t2 = await bestOf(['team2', 'team2', 'team2']);
    expect(await getOverallMatchScore(db, t2.m.id)).toMatchObject({ team1Wins: 0, team2Wins: 3, totalNormalGames: 3, overallWinner: 'team2' });
  });

  it('does not produce a team score for FFA matches, whose games hold participant placements', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA', name: 'FFA' });
    const m = await createMatch(gameId, ffa.id, { status: 'battle' });
    const [g] = await addGames(m.id, 1);
    const p = await addPlayer(m.id, 'Solo');
    await save(m.id, g, { isFfaMode: true, participantWinnerId: p.id });
    const s = await getOverallMatchScore(db, m.id);
    expect(s).toMatchObject({ scoringType: 'FFA', totalNormalGames: 0, overallWinner: null, teamScores: [] });
  });

  it('reports a 3rd team as the winner by id while the legacy label stays null', async () => {
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    const teams = await addTeams(m.id, ['A', 'B', 'C']);
    await scoredGame(m.id, 1, teams, teams[2]);
    const s = await getOverallMatchScore(db, m.id);
    expect(s.overallWinnerTeamId).toBe(teams[2]);
    expect(s.overallWinner).toBeNull();
    expect(s.teamScores.map((t) => t.wins)).toEqual([0, 0, 1]);
  });
});

describe('getMatchGamesWithResults', () => {
  it('returns FFA results with the participant winner and name', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA', name: 'FFA' });
    await addMap('ffa-map', 'FFA Map', gameId, ffa.id);
    const m = await createMatch(gameId, ffa.id, { status: 'battle', maps: ['ffa-map'] });
    const p = await addPlayer(m.id, 'TestUser');
    await save(m.id, `${m.id}_game_1`, { isFfaMode: true, participantWinnerId: p.id });
    const list = await getMatchGamesWithResults(db, m.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ is_ffa_mode: true, participant_winner_id: p.id, participant_winner_name: 'TestUser', status: 'completed', mode_scoring_type: 'FFA' });
  });

  it('returns an empty list for matches without games', async () => {
    const m = await createMatch(gameId, modeId);
    expect(await getMatchGamesWithResults(db, m.id)).toEqual([]);
  });

  it('scopes map lookups to the match game and resolves instance-suffixed map ids', async () => {
    const other = await createGame({ name: 'Other Game' });
    const otherMode = await createGameMode(other.id, { scoring_type: 'FFA', name: 'Other FFA' });
    // Same map id in two games (like "midtown" in Overwatch 2 and Marvel Rivals).
    await addMap('midtown', 'Midtown (ours)', gameId, modeId);
    await addMap('midtown', 'Midtown (theirs)', other.id, otherMode.id);
    const m = await createMatch(gameId, modeId, { status: 'battle' });
    await pg().insert(matchGames).values({ id: `${m.id}_game_1`, match_id: m.id, round: 1, map_id: 'midtown', status: 'ongoing' });
    await pg().insert(matchGames).values({ id: `${m.id}_game_2`, match_id: m.id, round: 2, map_id: 'midtown-1776547135395-abc', status: 'pending' });
    const list = await getMatchGamesWithResults(db, m.id);
    expect(list.map((g) => g.map_name)).toEqual(['Midtown (ours)', 'Midtown (ours)']);
    expect(list.every((g) => g.mode_scoring_type === 'Normal')).toBe(true);
  });
});

describe('round 2+ map code queueing', () => {
  async function twoMapMatch(map1: string, map2: string, codes: Record<string, string>, supported: boolean) {
    await pg().update(games).set({ map_codes_supported: supported }).where(eq(games.id, gameId));
    const base = (id: string) => id.replace(/-\d+-[a-z]+$/, '');
    await addMap(base(map1), `${base(map1)} name`);
    await addMap(base(map2), `${base(map2)} name`);
    const m = await createMatch(gameId, modeId, { status: 'battle', maps: [map1, map2], map_codes: codes });
    await initializeMatchGames(db, m.id);
    await addTeams(m.id, ['Alpha', 'Beta']);
    await save(m.id, `${m.id}_game_1`);
    return (await pg().select().from(discordMapCodeQueue).where(eq(discordMapCodeQueue.match_id, m.id)));
  }

  it('queues the next map code using the instance-id key', async () => {
    const rows = await twoMapMatch('map-r1-base-1776547135395-aaa', 'map-r2-base-1776547135396-bbb', { 'map-r1-base-1776547135395-aaa': 'ROUND1CODE', 'map-r2-base-1776547135396-bbb': 'ROUND2CODE' }, true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ map_code: 'ROUND2CODE', map_name: 'map-r2-base name' });
  });

  it('keeps an emoji-prefixed code intact', async () => {
    const rows = await twoMapMatch('map-emoji-r1-1776547135395-ccc', 'map-emoji-r2-1776547135396-ddd', { 'map-emoji-r1-1776547135395-ccc': 'PLAIN_CODE', 'map-emoji-r2-1776547135396-ddd': '🎮 JOINCODE999' }, true);
    expect(rows[0].map_code).toBe('🎮 JOINCODE999');
  });

  it('does not queue codes when the game does not support map codes', async () => {
    const rows = await twoMapMatch('map-ns-1-1776547135395-eee', 'map-ns-2-1776547135396-fff', { 'map-ns-1-1776547135395-eee': 'CODE1', 'map-ns-2-1776547135396-fff': 'CODE2' }, false);
    expect(rows).toHaveLength(0);
  });
});
