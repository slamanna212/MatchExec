/**
 * Series placings for a double-elimination tournament: the series scoring (still on the legacy SQLite harness until the
 * series domain is ported) reads a tournament played through the real tournament + match routes.
 * The bracket behaviour itself is covered by tests/integration/server/tournament-brackets.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { createGame, createGameMode } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as createSeries } from '@/app/api/series/route';
import { POST as addSeriesEvent } from '@/app/api/series/[seriesId]/events/route';
import { GET as getSeriesStandings } from '@/app/api/series/[seriesId]/standings/route';
import { generateBracket, playOutBracket, tournamentInAssign, tournamentTransition, type BracketCtx } from '../../utils/bracket-helpers';

let ctx: BracketCtx;
let seq = 0;

beforeEach(async () => {
  const db = getTestDb();
  const gameId = (await createGame()).id;
  const mode = await createGameMode(gameId, { scoring_type: 'Normal', team_size: 5, name: 'Normal 5' });
  for (let i = 0; i < 4; i++) await db.run(`INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`, [`bmap-${++seq}`, gameId, mode.id, `m${i}`]);
  ctx = { db, gameId, normalModeId: mode.id };
});

describe('series placings for a double-elimination tournament', () => {
  it.each([
    [4, 'team1'], [4, 'team2'], [6, 'team1'], [6, 'team2'],
  ] as const)('%i teams, %s wins every match: champion / runner-up / third earn 10 / 6 / 3', async (n, pick) => {
    const { id, teamIds } = await tournamentInAssign(ctx, 'double-elimination', n);
    await generateBracket(id);
    await tournamentTransition(id, 'battle');
    await playOutBracket(ctx, id, pick);

    const rows = await ctx.db.all<{ bracket_type: string; round: number; team1_id: string; team2_id: string; winner_team: string }>(
      `SELECT tm.bracket_type, tm.round, tm.team1_id, tm.team2_id, m.winner_team
       FROM tournament_matches tm JOIN matches m ON m.id = tm.match_id WHERE tm.tournament_id = ?`, [id]
    );
    const loserOf = (r: { team1_id: string; team2_id: string; winner_team: string }) => (r.winner_team === r.team1_id ? r.team2_id : r.team1_id);
    const finals = rows.filter(r => r.bracket_type === 'final').sort((a, b) => b.round - a.round);
    const champion = finals[0].winner_team;
    const runnerUp = loserOf(finals[0]);
    const lbFinal = rows.filter(r => r.bracket_type === 'losers').sort((a, b) => b.round - a.round)[0];
    const third = loserOf(lbFinal);
    expect(new Set([champion, runnerUp, third]).size).toBe(3);

    const series = await parseResponse(await createSeries(createMockRequest('POST', '/api/series', {
      name: `DE series ${++seq}`, scoring_config: { tournament_position_points: [10, 6, 3] },
    })));
    const sid: string = series.data.id;
    expect((await parseResponse(await addSeriesEvent(
      createMockRequest('POST', `/api/series/${sid}/events`, { event_type: 'tournament', tournament_id: id }), createRouteParams({ seriesId: sid })
    ))).status).toBe(201);

    const standings = (await parseResponse(await getSeriesStandings(
      createMockRequest('GET', `/api/series/${sid}/standings`), createRouteParams({ seriesId: sid })
    ))).data.standings as Array<{ user_id: string; total_points: number }>;
    const points = new Map(standings.map(r => [r.user_id, r.total_points]));

    // team i's players are users 2i and 2i+1 (discord id d-<tournament>-<index>)
    const pointsForTeam = (teamId: string) => {
      const i = teamIds.indexOf(teamId);
      return [points.get(`d-${id}-${i * 2}`) ?? 0, points.get(`d-${id}-${i * 2 + 1}`) ?? 0]; // players without a placing aren't listed at all
    };
    expect(pointsForTeam(champion)).toEqual([10, 10]);
    expect(pointsForTeam(runnerUp)).toEqual([6, 6]);
    expect(pointsForTeam(third)).toEqual([3, 3]);
    for (const t of teamIds.filter(t => ![champion, runnerUp, third].includes(t))) expect(pointsForTeam(t)).toEqual([0, 0]);
  }, 60_000);
});
