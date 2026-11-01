// @vitest-environment node
/** Bracket generation + progression through the real routes, with scoring through the match result route. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGameMode } from '../../utils/pg-fixtures';
import {
  bracketGame, generateBracket, playOutBracket, progressBracket, startAndScore, tournamentInAssign, tournamentTransition,
} from '../../utils/pg-tournament-fixtures';
import { gameMaps, matchGames, matches, tournamentMatches, tournaments } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));
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

const statusOf = async (id: string) => (await pg().select({ s: tournaments.status }).from(tournaments).where(eq(tournaments.id, id)))[0]?.s;
const bracketWithWinners = (id: string) => pg()
  .select({ bracket_type: tournamentMatches.bracket_type, round: tournamentMatches.round, team1_id: tournamentMatches.team1_id, team2_id: tournamentMatches.team2_id, winner_team: matches.winner_team })
  .from(tournamentMatches).innerJoin(matches, eq(matches.id, tournamentMatches.match_id))
  .where(eq(tournamentMatches.tournament_id, id)).orderBy(asc(tournamentMatches.round), asc(tournamentMatches.match_order));

describe('single elimination', () => {
  it.each([3, 5, 6, 7])('with %i teams: every team plays, n-1 matches, the winner of the final never lost', async (n) => {
    const { id, teamIds } = await tournamentInAssign(ctx, 'single-elimination', n);
    expect((await generateBracket(id)).status).toBe(200);
    expect((await tournamentTransition(id, 'battle')).status).toBe(200);
    await playOutBracket(id);
    expect(await statusOf(id)).toBe('complete');

    const bracket = await bracketWithWinners(id);
    expect(bracket).toHaveLength(n - 1);
    expect([...new Set(bracket.flatMap((m) => [m.team1_id, m.team2_id]))].sort()).toEqual([...teamIds].sort()); // nobody dropped

    const final = bracket[bracket.length - 1];
    const losers = new Set(bracket.map((m) => (m.winner_team === m.team1_id ? m.team2_id : m.team1_id)));
    expect(losers.has(final.winner_team)).toBe(false);
    expect(losers.size).toBe(n - 1); // every other team lost exactly once
  });

  it('generates round 1 with named match teams, rosters and a Discord announcement per match, and rejects regeneration', async () => {
    const { id, teamIds } = await tournamentInAssign(ctx, 'single-elimination', 4);
    const res = await generateBracket(id);
    expect(res.data).toMatchObject({ message: 'Tournament bracket generated successfully', matchCount: 2, format: 'single-elimination', tournamentId: id });
    const rows = await pg().select().from(matches).where(eq(matches.tournament_id, id));
    expect(rows.every((m) => m.status === 'assign' && m.tournament_round === 1 && m.tournament_bracket_type === 'winners')).toBe(true);
    expect(rows.map((m) => m.blue_team_id).sort()).toEqual([teamIds[0], teamIds[2]].sort());
    expect((await generateBracket(id)).status).toBe(400);
  });
});

describe('double elimination', () => {
  it('plays 4 teams to a champion', async () => {
    const { id, teamIds } = await tournamentInAssign(ctx, 'double-elimination', 4);
    expect((await generateBracket(id)).status).toBe(200);
    expect((await tournamentTransition(id, 'battle')).status).toBe(200);
    await playOutBracket(id);
    expect(await statusOf(id)).toBe('complete');
    const played = await pg().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, id));
    expect(new Set(played.flatMap((m) => [m.team1_id, m.team2_id]))).toEqual(new Set(teamIds));
  });

  it('only draws maps from the tournament mode pool (never an FFA map)', async () => {
    // An FFA mode on the same game: an unfiltered pool picks it about half the time.
    const ffa = await createGameMode(ctx.gameId, { scoring_type: 'FFA', team_size: null, name: 'FFA' });
    const ffaMaps = ['ffa-1', 'ffa-2', 'ffa-3', 'ffa-4'];
    for (const mid of ffaMaps) await pg().insert(gameMaps).values({ id: mid, game_id: ctx.gameId, mode_id: ffa.id, name: mid });
    for (let run = 0; run < 3; run++) {
      const { id } = await tournamentInAssign(ctx, 'double-elimination', 4);
      await generateBracket(id);
      await tournamentTransition(id, 'battle');
      await playOutBracket(id, run % 2 === 0 ? 'team1' : 'team2');
      expect(await statusOf(id)).toBe('complete');
      const used = await pg().select({ map_id: matchGames.map_id }).from(matchGames).innerJoin(matches, eq(matches.id, matchGames.match_id)).where(eq(matches.tournament_id, id));
      expect(used.some((u) => u.map_id && ffaMaps.includes(u.map_id))).toBe(false);
    }
  }, 120_000);

  describe.each([2, 3, 4, 5, 6, 8, 9])('%i teams, played through scoring', (n) => {
    it.each([
      ['team1', 'the winners-bracket champion wins the final (no reset)'],
      ['team2', 'the losers-bracket champion wins the final (reset is played)'],
    ] as const)('every team except the champion ends with exactly two losses when %s wins every match: %s', async (pick, _description) => {
      const { id, teamIds } = await tournamentInAssign(ctx, 'double-elimination', n, { perTeam: 1 });
      expect((await generateBracket(id)).status).toBe(200);
      expect((await tournamentTransition(id, 'battle')).status).toBe(200);
      await playOutBracket(id, pick);
      expect(await statusOf(id)).toBe('complete');

      const rows = await bracketWithWinners(id);
      const losses = new Map<string, number>(teamIds.map((t) => [t, 0]));
      for (const r of rows) {
        const loser = r.winner_team === r.team1_id ? r.team2_id : r.team1_id;
        losses.set(loser!, (losses.get(loser!) ?? 0) + 1);
      }
      const finals = rows.filter((r) => r.bracket_type === 'final').sort((a, b) => b.round - a.round);
      const champion = finals[0].winner_team;
      for (const [team, count] of losses) {
        if (team === champion) expect(count).toBeLessThanOrEqual(1);
        else expect(count, `team ${team}`).toBe(2);
      }
      const reset = finals.length === 2;
      expect(reset).toBe(pick === 'team2');
      expect(rows).toHaveLength(reset ? 2 * n - 1 : 2 * n - 2);
    }, 120_000);
  });
});

describe('a drawn tournament match', () => {
  async function drawMatch(matchId: string) {
    for (const st of ['gather', 'assign', 'battle']) {
      const [cur] = await pg().select({ s: matches.status }).from(matches).where(eq(matches.id, matchId));
      const order = ['created', 'gather', 'assign', 'battle'];
      if (order.indexOf(cur.s) < order.indexOf(st)) await appRequest(`/api/matches/${matchId}/transition`, { method: 'POST', json: { newStatus: st } });
    }
    const games = await pg().select({ id: matchGames.id }).from(matchGames).where(eq(matchGames.match_id, matchId));
    for (const g of games) {
      const res = await appRequest(`/api/matches/${matchId}/games/${g.id}/result`, { method: 'POST', json: { draw: true } });
      expect(res.status).toBe(200);
    }
  }

  it.each(['single-elimination', 'double-elimination'])('%s: a draw stalls the round instead of dropping teams or crowning a champion; rescoring unblocks it', async (format) => {
    const { id } = await tournamentInAssign(ctx, format, 4);
    await generateBracket(id);
    await tournamentTransition(id, 'battle');
    const [a, b] = await pg().select({ id: matches.id }).from(matches).innerJoin(tournamentMatches, eq(tournamentMatches.match_id, matches.id))
      .where(eq(matches.tournament_id, id)).orderBy(asc(tournamentMatches.match_order));
    await drawMatch(a.id);
    await startAndScore(b.id, 'team1');
    expect((await pg().select({ w: matches.winner_team }).from(matches).where(eq(matches.id, a.id)))[0].w).toBeNull();

    const stalled = await progressBracket(id);
    expect(stalled.status).toBe(400);
    expect(stalled.data.error).toMatch(/draw|winner/i);
    expect(await statusOf(id)).toBe('battle');

    // break the tie by rescoring the drawn map
    const games = await pg().select({ id: matchGames.id }).from(matchGames).where(eq(matchGames.match_id, a.id));
    for (const g of games) {
      const res = await appRequest(`/api/matches/${a.id}/games/${g.id}/result`, { method: 'POST', json: { winner: 'team1', winnerScore: 13, loserScore: 11, rescore: true } });
      expect(res.status, JSON.stringify(res.data)).toBe(200);
    }
    expect((await pg().select({ w: matches.winner_team }).from(matches).where(eq(matches.id, a.id)))[0].w).not.toBeNull();

    await playOutBracket(id);
    expect(await statusOf(id)).toBe('complete');
  }, 60_000);
});

describe('concurrency', () => {
  it('generate-matches builds the bracket once when called concurrently', async () => {
    const { id } = await tournamentInAssign(ctx, 'single-elimination', 4);
    const results = await Promise.all([generateBracket(id), generateBracket(id), generateBracket(id)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(2);
    expect(await pg().select().from(matches).where(eq(matches.tournament_id, id))).toHaveLength(2);
    expect(await pg().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, id))).toHaveLength(2);
  });

  it('progress generates the next round once when called concurrently', async () => {
    const { id } = await tournamentInAssign(ctx, 'single-elimination', 4);
    await generateBracket(id);
    await tournamentTransition(id, 'battle');
    for (const m of await pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, id))) await startAndScore(m.id, 'team1');

    const results = await Promise.all([progressBracket(id), progressBracket(id), progressBracket(id)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await pg().select().from(tournamentMatches).where(eq(tournamentMatches.round, 2))).toHaveLength(1);
  });
});

