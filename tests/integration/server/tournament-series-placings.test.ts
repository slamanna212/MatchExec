// @vitest-environment node
/**
 * Series placings for a double-elimination tournament: the series scoring reads a tournament played through the real
 * tournament + match routes. The bracket behaviour itself is covered by tournament-brackets.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { addEventApi, createSeriesApi, standingsApi } from '../../utils/pg-series-fixtures';
import { bracketGame, generateBracket, playOutBracket, tournamentInAssign, tournamentTransition } from '../../utils/pg-tournament-fixtures';
import { matches, tournamentMatches } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();

let ctx: { gameId: string; modeId: string };
beforeEach(async () => {
  const g = await bracketGame({ maps: 4 });
  ctx = { gameId: g.gameId, modeId: g.modeId };
});

describe('series placings for a double-elimination tournament', () => {
  it.each([
    [4, 'team1'], [4, 'team2'], [6, 'team1'], [6, 'team2'],
  ] as const)('%i teams, %s wins every match: champion / runner-up / third earn 10 / 6 / 3', async (n, pick) => {
    const { id, teamIds } = await tournamentInAssign(ctx, 'double-elimination', n);
    await generateBracket(id);
    await tournamentTransition(id, 'battle');
    await playOutBracket(id, pick);

    const rows = await getPgTestDb()
      .select({ bracket_type: tournamentMatches.bracket_type, round: tournamentMatches.round, team1_id: tournamentMatches.team1_id, team2_id: tournamentMatches.team2_id, winner_team: matches.winner_team })
      .from(tournamentMatches).innerJoin(matches, eq(matches.id, tournamentMatches.match_id)).where(eq(tournamentMatches.tournament_id, id));
    const loserOf = (r: { team1_id: string | null; team2_id: string | null; winner_team: string | null }) => (r.winner_team === r.team1_id ? r.team2_id : r.team1_id)!;
    const finals = rows.filter((r) => r.bracket_type === 'final').sort((a, b) => b.round - a.round);
    const champion = finals[0].winner_team!;
    const runnerUp = loserOf(finals[0]);
    const lbFinal = rows.filter((r) => r.bracket_type === 'losers').sort((a, b) => b.round - a.round)[0];
    const third = loserOf(lbFinal);
    expect(new Set([champion, runnerUp, third]).size).toBe(3);

    const sid = await createSeriesApi({ tournament_position_points: [10, 6, 3] });
    expect((await addEventApi(sid, { event_type: 'tournament', tournament_id: id })).status).toBe(201);
    const points = new Map((await standingsApi(sid)).map((r) => [r.user_id, r.total_points]));

    // team i's players are participants 2i and 2i+1 (discord id d-p<index>-<tournament>)
    const pointsForTeam = (teamId: string) => {
      const i = teamIds.indexOf(teamId);
      return [points.get(`d-p${i * 2}-${id}`) ?? 0, points.get(`d-p${i * 2 + 1}-${id}`) ?? 0]; // players without a placing aren't listed at all
    };
    expect(pointsForTeam(champion)).toEqual([10, 10]);
    expect(pointsForTeam(runnerUp)).toEqual([6, 6]);
    expect(pointsForTeam(third)).toEqual([3, 3]);
    for (const t of teamIds.filter((x) => ![champion, runnerUp, third].includes(x))) expect(pointsForTeam(t)).toEqual([0, 0]);
  }, 60_000);
});
