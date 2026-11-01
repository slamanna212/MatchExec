// @vitest-environment node
/**
 * Races on the match write paths (plan 1.3). Meaningful against real Postgres (`pnpm test:pg`, several pooled connections
 * really overlap); on PGlite the single connection serialises the requests, so the same assertions still hold.
 * Each test fires the competing requests together and asserts the invariant: exactly one winner, no duplicate rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import {
  discordAnnouncementQueue, discordMatchWinnerQueue, discordScoreNotificationQueue, gameMaps, matchGamePlacements, matchGames,
  matchParticipants, matchTeams, matches,
} from '../../../lib/db/schema';
import { addParticipant, createMatchTeams } from '@/lib/matches';
import { db } from '../../../lib/db';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', () => ({ logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  gameId = (await createGame({ max_signups: 3 })).id;
  modeId = (await createGameMode(gameId, { scoring_type: 'Normal' })).id;
});

const status = (matchId: string, newStatus: string) => appRequest(`/api/matches/${matchId}/transition`, { method: 'POST', json: { newStatus } });

async function battleMatch(maps: number) {
  const mapIds = Array.from({ length: maps }, (_, i) => `race-map-${i}`);
  for (const id of mapIds) await pg().insert(gameMaps).values({ id, game_id: gameId, mode_id: modeId, name: id });
  const m = await createMatch(gameId, modeId, { id: 'race', status: 'assign', maps: mapIds });
  await createMatchTeams(db, m.id);
  expect((await status(m.id, 'battle')).status).toBe(200);
  const teams = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, m.id), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
  const games_ = await pg().select().from(matchGames).where(eq(matchGames.match_id, m.id)).orderBy(asc(matchGames.round));
  return { matchId: m.id, teams, games: games_ };
}

describe('match write races', () => {
  it('two simultaneous transitions: exactly one wins, the loser queues nothing', async () => {
    const m = await createMatch(gameId, modeId, { id: 'tr', status: 'created' });
    const results = await Promise.all([status(m.id, 'gather'), status(m.id, 'gather'), status(m.id, 'gather')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400]);
    expect(await pg().select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.match_id, m.id))).toHaveLength(1);
  });

  it('conflicting transitions (cancel vs advance) leave one consistent state', async () => {
    const m = await createMatch(gameId, modeId, { id: 'cv', status: 'gather' });
    const [a, b] = await Promise.all([status(m.id, 'assign'), status(m.id, 'cancelled')]);
    // cancelling is always allowed, so it ends 'cancelled'; 'assign' either ran first (200) or lost to the cancel (400)
    expect(b.status).toBe(200);
    expect([200, 400]).toContain(a.status);
    expect((await pg().select().from(matches).where(eq(matches.id, m.id)))[0].status).toBe('cancelled');
  });

  it('the same map scored twice at once: one score, one notification, the other gets 409', async () => {
    const { matchId, teams, games: gs } = await battleMatch(2);
    const score = (winner: string) => appRequest(`/api/matches/${matchId}/games/${gs[0].id}/result`, { method: 'POST', json: { winnerTeamId: winner } });
    const results = await Promise.all([score(teams[0].id), score(teams[1].id), score(teams[0].id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await pg().select().from(matchGamePlacements).where(eq(matchGamePlacements.match_game_id, gs[0].id))).toHaveLength(2);
    expect(await pg().select().from(discordScoreNotificationQueue).where(eq(discordScoreNotificationQueue.match_id, matchId))).toHaveLength(1);
    expect((await pg().select().from(matchGames).where(eq(matchGames.id, gs[1].id)))[0].status).toBe('ongoing');
  });

  it('the last two maps finishing together complete the match exactly once', async () => {
    const { matchId, teams, games: gs } = await battleMatch(2);
    const score = (gameId_: string, winner: string) => appRequest(`/api/matches/${matchId}/games/${gameId_}/result`, { method: 'POST', json: { winnerTeamId: winner } });
    // game 2 is still 'pending' for the web UI but scoring it is allowed once the match is in battle
    const results = await Promise.all([score(gs[0].id, teams[0].id), score(gs[1].id, teams[0].id)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const row = (await pg().select().from(matches).where(eq(matches.id, matchId)))[0];
    expect(row.status).toBe('complete');
    expect(row.winner_team).toBe(teams[0].id);
    expect(await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, matchId))).toHaveLength(1);
  });

  it('concurrent createMatchTeams never duplicates teams', async () => {
    const m = await createMatch(gameId, modeId, { id: 'ct', status: 'assign' });
    await Promise.all([1, 2, 3, 4].map(() => createMatchTeams(db, m.id)));
    const teams = await pg().select().from(matchTeams).where(eq(matchTeams.match_id, m.id));
    expect(teams.map((t) => t.team_name).sort()).toEqual(['Blue', 'Red', 'Reserve']);
  });

  it('concurrent signups cannot exceed capacity or sign one user up twice', async () => {
    const m = await createMatch(gameId, modeId, { id: 'su' });
    const join = (userId: string) => addParticipant(db, { matchId: m.id, userId, discordUserId: userId, username: userId, signupData: null, avatarUrl: null }, { capacity: 3 });
    const results = await Promise.all(['a', 'b', 'c', 'd', 'e', 'a', 'a'].map(join));
    expect(await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, m.id))).toHaveLength(3);
    expect(results.filter((r) => r.status === 'added')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'full' || r.status === 'duplicate')).toHaveLength(4);
  });

  it('assigning teams while the match transitions to battle is atomic: the assignment either lands before or is refused', async () => {
    const m = await createMatch(gameId, modeId, { id: 'as', status: 'assign' });
    await createMatchTeams(db, m.id);
    await pg().insert(matchParticipants).values({ id: 'as-p', match_id: m.id, user_id: 'u', username: 'U' });
    const teams = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, m.id), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
    const [assign] = await Promise.all([
      appRequest(`/api/matches/${m.id}/assign-teams`, { method: 'POST', json: { teamAssignments: [{ participantId: 'as-p', teamId: teams[0].id }] } }),
      status(m.id, 'battle'),
    ]);
    const participant = (await pg().select().from(matchParticipants).where(eq(matchParticipants.id, 'as-p')))[0];
    if (assign.status === 200) expect(participant.team_id).toBe(teams[0].id);
    else { expect(assign.status).toBe(409); expect(participant.team_id).toBeNull(); }
  });
});
