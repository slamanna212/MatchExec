// @vitest-environment node
/**
 * Races on the tournament / bracket write paths (plan 1.3): bracket progression, generation, transitions, team writes and
 * signups. The first block runs everywhere (on PGlite one connection serialises the requests, so the invariants still
 * hold); the second block needs real Postgres (`pnpm test:pg`): a background transaction holds the tournament / match row
 * lock while competing requests are fired, and the timestamps prove they really queued behind it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb, isRealPostgres } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createTournament } from '../../utils/pg-fixtures';
import {
  bracketGame, completeMatch, generateBracket, progressBracket, startAndScore, tournamentInAssign, tournamentTransition,
} from '../../utils/pg-tournament-fixtures';
import {
  discordAnnouncementQueue, discordMatchWinnerQueue, matches, tournamentMatches, tournamentParticipants, tournamentRoundByes, tournamentTeams, tournaments,
} from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import { addParticipant, lockTournament, lockTournamentMatches } from '@/lib/tournaments';
import { lockMatch } from '@/lib/matches';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', () => ({ logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));
vi.mock('@/lib/matches/voice-channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/matches/voice-channels')>()),
  VoiceChannelService: { setupMatchVoiceChannels: vi.fn().mockResolvedValue(true), queueVoiceAnnouncement: vi.fn().mockResolvedValue(undefined) },
}));

setupPgTestFile();
const pg = () => getPgTestDb();

let ctx: { gameId: string; modeId: string };
beforeEach(async () => {
  const g = await bracketGame({ maps: 4 });
  ctx = { gameId: g.gameId, modeId: g.modeId };
});

/** Tournament in battle with all round-1 matches scored for team1 (so the next round can be generated). */
async function roundOneDone(format: 'single-elimination' | 'double-elimination', teams: number) {
  const { id } = await tournamentInAssign(ctx, format, teams, { perTeam: 1 });
  expect((await generateBracket(id)).status).toBe(200);
  expect((await tournamentTransition(id, 'battle')).status).toBe(200);
  for (const m of await pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, id))) await startAndScore(m.id, 'team1');
  return id;
}
const roundCount = async (id: string, round: number) => (await pg().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, id))).filter((r) => r.round === round).length;

describe('tournament write races', () => {
  it('concurrent progress calls generate the next round exactly once (single elimination, 8 teams)', async () => {
    const id = await roundOneDone('single-elimination', 8);
    const results = await Promise.all(Array.from({ length: 6 }, () => progressBracket(id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400).every((r) => /not complete yet/.test(r.data.error))).toBe(true);
    expect(await roundCount(id, 2)).toBe(2);
    expect(await pg().select().from(matches).where(eq(matches.tournament_id, id))).toHaveLength(4 + 2);
  });

  it('concurrent progress calls with a bye record the bye once and generate one round (5 teams)', async () => {
    const id = await roundOneDone('single-elimination', 5);
    const results = await Promise.all(Array.from({ length: 5 }, () => progressBracket(id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    // round 2: bye team from round 1 + 2 winners -> 1 match + a new bye for round 2
    expect(await roundCount(id, 2)).toBe(1);
    expect(await pg().select().from(tournamentRoundByes).where(eq(tournamentRoundByes.round, 2))).toHaveLength(1);
  });

  it('concurrent progress calls on a double-elimination bracket never duplicate planned matches', async () => {
    const id = await roundOneDone('double-elimination', 4);
    const results = await Promise.all(Array.from({ length: 5 }, () => progressBracket(id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const rows = await pg().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, id));
    const keys = rows.map((r) => `${r.bracket_type}:${r.round}:${[r.team1_id, r.team2_id].sort().join('/')}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows.filter((r) => r.bracket_type === 'winners' && r.round === 2)).toHaveLength(1);
    expect(rows.filter((r) => r.bracket_type === 'losers' && r.round === 1)).toHaveLength(1);
  });

  it('concurrent final progress calls complete the tournament once and announce the winner once', async () => {
    const { id, teamIds } = await tournamentInAssign(ctx, 'single-elimination', 2, { perTeam: 1 });
    await generateBracket(id);
    await tournamentTransition(id, 'battle');
    const [m] = await pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, id));
    await completeMatch(m.id, teamIds[0]);
    const results = await Promise.all(Array.from({ length: 5 }, () => progressBracket(id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await pg().select().from(tournaments).where(eq(tournaments.id, id)))[0].status).toBe('complete');
    expect(await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, id))).toHaveLength(1);
  });

  it('progress and transition-to-complete racing leave one consistent final state', async () => {
    const { id, teamIds } = await tournamentInAssign(ctx, 'single-elimination', 2, { perTeam: 1 });
    await generateBracket(id);
    await tournamentTransition(id, 'battle');
    const [m] = await pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, id));
    await completeMatch(m.id, teamIds[0]);
    const [a, b] = await Promise.all([progressBracket(id), tournamentTransition(id, 'complete')]);
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    expect((await pg().select().from(tournaments).where(eq(tournaments.id, id)))[0].status).toBe('complete');
  });

  it('concurrent generate-matches builds one bracket (8 teams, 8 callers)', async () => {
    const { id } = await tournamentInAssign(ctx, 'single-elimination', 8, { perTeam: 1 });
    const results = await Promise.all(Array.from({ length: 8 }, () => generateBracket(id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(7);
    expect(await pg().select().from(matches).where(eq(matches.tournament_id, id))).toHaveLength(4);
    expect(await pg().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, id))).toHaveLength(4);
    expect((await pg().select().from(discordAnnouncementQueue)).filter((a) => a.announcement_type === 'standard')).toHaveLength(4);
  });

  it('simultaneous identical transitions: one wins and queues one announcement', async () => {
    await createTournament(ctx.gameId, { id: 'tr', game_mode_id: ctx.modeId });
    const results = await Promise.all([1, 2, 3, 4].map(() => tournamentTransition('tr', 'gather')));
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400, 400]);
    expect(await pg().select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.match_id, 'tr'))).toHaveLength(1);
  });

  it('cancel racing with advance leaves the tournament cancelled or advanced, never both effects', async () => {
    await createTournament(ctx.gameId, { id: 'cv', game_mode_id: ctx.modeId, status: 'gather' });
    const [a, b] = await Promise.all([tournamentTransition('cv', 'assign'), tournamentTransition('cv', 'cancelled')]);
    expect(b.status).toBe(200);
    expect([200, 400]).toContain(a.status);
    expect((await pg().select().from(tournaments).where(eq(tournaments.id, 'cv')))[0].status).toBe('cancelled');
  });

  it('simultaneous team creation with the same name yields one team', async () => {
    await createTournament(ctx.gameId, { id: 'tn', game_mode_id: ctx.modeId });
    const results = await Promise.all(Array.from({ length: 6 }, () => appRequest('/api/tournaments/tn/teams', { method: 'POST', json: { teamName: 'Dupes' } })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, 'tn'))).toHaveLength(1);
  });

  it('many simultaneous signups never exceed the capacity and never double-sign a player', async () => {
    await createTournament(ctx.gameId, { id: 'su', game_mode_id: ctx.modeId, status: 'gather' });
    const users = Array.from({ length: 30 }, (_, i) => `user-${i % 15}`); // each user tries twice
    const results = await Promise.all(users.map((userId) => addParticipant(db, { tournamentId: 'su', userId, discordUserId: userId, username: userId, signupData: null }, { capacity: 4 })));
    expect(await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, 'su'))).toHaveLength(4);
    expect(results.filter((r) => r.status === 'added')).toHaveLength(4);
  });

  it('team assignment saves racing each other end with exactly one roster', async () => {
    const { id, teamIds } = await tournamentInAssign(ctx, 'single-elimination', 2, { perTeam: 2 });
    await pg().update(tournaments).set({ status: 'gather' }).where(eq(tournaments.id, id));
    const put = (swap: boolean) => appRequest(`/api/tournaments/${id}/teams`, {
      method: 'PUT',
      json: { teams: teamIds.map((teamId, i) => ({ teamId, members: [0, 1].map((k) => ({ userId: `${id}-pu${((swap ? 1 - i : i) * 2) + k}`, username: `n${k}` })) })) },
    });
    const results = await Promise.all([put(false), put(true), put(false), put(true)]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    const parts = await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, id)).orderBy(asc(tournamentParticipants.id));
    expect(parts.every((p) => p.team_assignment !== null)).toBe(true);
    const { tournamentTeamMembers } = await import('../../../lib/db/schema');
    expect(await pg().select().from(tournamentTeamMembers)).toHaveLength(4); // never duplicated by interleaving
  });
});

describe.skipIf(!isRealPostgres())('real overlap on Postgres', () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Hold a lock in a background transaction for `ms`; resolves with the release time once the work is done. */
  async function hold(take: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<unknown>, ms: number) {
    let locked!: () => void;
    const ready = new Promise<void>((r) => { locked = r; });
    const done = db.transaction(async (tx) => {
      await take(tx);
      locked();
      await sleep(ms);
      return Date.now();
    });
    await ready;
    return done;
  }

  it('the pooled connections really run queries at the same time', async () => {
    const t0 = Date.now();
    await Promise.all([1, 2, 3].map(() => pg().execute(sql`select pg_sleep(0.4)`)));
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('progress queues behind a transaction holding the tournament row lock and then runs once', async () => {
    const id = await roundOneDone('single-elimination', 4);
    const release = hold((tx) => lockTournament(tx, id), 600);
    await sleep(100);
    const reqs = Promise.all([progressBracket(id), progressBracket(id), progressBracket(id)].map((p) => p.then((r) => ({ r, at: Date.now() }))));
    await sleep(250);
    expect(await roundCount(id, 2)).toBe(0); // all three still waiting on the lock
    const [releasedAt, results] = await Promise.all([release, reqs]);
    expect(results.every(({ at }) => at >= releasedAt)).toBe(true);
    expect(results.filter(({ r }) => r.status === 200)).toHaveLength(1);
    expect(await roundCount(id, 2)).toBe(1);
  });

  it('generate-matches and transitions queue behind the tournament row lock too', async () => {
    const { id } = await tournamentInAssign(ctx, 'single-elimination', 4, { perTeam: 1 });
    const release = hold((tx) => lockTournament(tx, id), 500);
    await sleep(100);
    const gen = generateBracket(id).then((r) => ({ r, at: Date.now() }));
    const cancel = tournamentTransition(id, 'cancelled').then((r) => ({ r, at: Date.now() }));
    await sleep(200);
    expect(await pg().select().from(matches).where(eq(matches.tournament_id, id))).toHaveLength(0);
    expect((await pg().select().from(tournaments).where(eq(tournaments.id, id)))[0].status).toBe('assign');
    const [releasedAt, g, c] = await Promise.all([release, gen, cancel]);
    expect(g.at).toBeGreaterThanOrEqual(releasedAt);
    expect(c.at).toBeGreaterThanOrEqual(releasedAt);
    // The lock order decides who goes first and either order is consistent: generate then cancel (both 200), or cancel
    // first (200) and generation refused because the tournament is no longer in the assign phase (400, no matches).
    expect(c.r.status).toBe(200);
    expect([200, 400]).toContain(g.r.status);
    const bracket = await pg().select().from(matches).where(eq(matches.tournament_id, id));
    expect(bracket).toHaveLength(g.r.status === 200 ? 2 : 0);
    expect((await pg().select().from(tournaments).where(eq(tournaments.id, id)))[0].status).toBe('cancelled');
  });

  it('progress waits for a match row lock (a result submission in flight) and then reads the committed winner', async () => {
    const { id, teamIds } = await tournamentInAssign(ctx, 'single-elimination', 2, { perTeam: 1 });
    await generateBracket(id);
    await tournamentTransition(id, 'battle');
    const [m] = await pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, id));
    // Simulates a scorer that holds the match lock and commits the winner a moment later.
    const scorer = hold(async (tx) => {
      await lockMatch(tx, m.id);
      await tx.update(matches).set({ status: 'complete', winner_team: teamIds[1] }).where(eq(matches.id, m.id));
    }, 400);
    await sleep(100);
    const t0 = Date.now();
    const res = await progressBracket(id);
    const scorerDone = await scorer;
    expect(Date.now()).toBeGreaterThanOrEqual(scorerDone);
    expect(Date.now() - t0).toBeGreaterThan(150);
    expect(res.status).toBe(200);
    expect(res.data.winner).toBe(teamIds[1]); // it saw the winner committed under the lock, not a stale 'not complete'
  });

  it('a progress call does not block other tournaments', async () => {
    const a = await roundOneDone('single-elimination', 4);
    const b = await roundOneDone('single-elimination', 4);
    const release = hold((tx) => lockTournament(tx, a), 800);
    await sleep(100);
    const t0 = Date.now();
    const res = await progressBracket(b);
    expect(res.status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(700);
    await release;
  });

  it('lockTournamentMatches orders by id (two lockers can not deadlock)', async () => {
    const id = await roundOneDone('single-elimination', 8);
    const results = await Promise.all([1, 2, 3, 4].map(() => db.transaction(async (tx) => { await lockTournamentMatches(tx, id); await sleep(20); return true; })));
    expect(results.every(Boolean)).toBe(true);
  });

  it('repeated progress races always generate each round once', async () => {
    for (let i = 0; i < 4; i++) {
      const id = await roundOneDone('single-elimination', 4);
      const results = await Promise.all(Array.from({ length: 5 }, () => progressBracket(id)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await roundCount(id, 2)).toBe(1);
    }
  }, 60_000);
});

