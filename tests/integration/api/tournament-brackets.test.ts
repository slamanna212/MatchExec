/**
 * Bracket shapes played to completion through the real routes: odd team counts (byes),
 * double elimination, and concurrent generate/progress calls.
 *
 * Regressions covered:
 *  - with an odd number of teams the unpaired team was silently dropped (3 teams -> 1 match,
 *    the leftover team never played and the first winner was crowned champion)
 *  - the double-elimination grand final drew from an unfiltered mode/map pool and could pick
 *    an FFA map that a team match can't be scored on
 *  - concurrent generate-matches calls each built a full bracket
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { createGame, createGameMode } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as createTournament } from '@/app/api/tournaments/route';
import { POST as transitionTournament } from '@/app/api/tournaments/[tournamentId]/transition/route';
import { POST as createTeam, PUT as assignMembers } from '@/app/api/tournaments/[tournamentId]/teams/route';
import { POST as generateMatches } from '@/app/api/tournaments/[tournamentId]/generate-matches/route';
import { POST as progressTournament } from '@/app/api/tournaments/[tournamentId]/progress/route';
import { POST as transitionMatch } from '@/app/api/matches/[matchId]/transition/route';
import { POST as saveResult } from '@/app/api/matches/[matchId]/games/[gameId]/result/route';
import { POST as createSeries } from '@/app/api/series/route';
import { POST as addSeriesEvent } from '@/app/api/series/[seriesId]/events/route';
import { GET as getSeriesStandings } from '@/app/api/series/[seriesId]/standings/route';

let db: ReturnType<typeof getTestDb>;
let gameId: string;
let normalModeId: string;
let seq = 0;

const req = (method: string, url: string, body?: Record<string, unknown>) => createMockRequest(method, url, body);

async function addMode(scoringType: 'Normal' | 'FFA', teamSize: number | null) {
  const mode = await createGameMode(gameId, {
    scoring_type: scoringType, team_size: teamSize as number, name: `${scoringType} ${++seq}`,
  });
  const mapIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const id = `bmap-${++seq}`;
    await db.run(`INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`, [id, gameId, mode.id, id]);
    mapIds.push(id);
  }
  return { modeId: mode.id, mapIds };
}

async function tPost(tournamentId: string, newStatus: string) {
  return parseResponse(await transitionTournament(
    req('POST', `/api/tournaments/${tournamentId}/transition`, { newStatus }), createRouteParams({ tournamentId })
  ));
}

const generate = async (tournamentId: string) => parseResponse(await generateMatches(
  req('POST', `/api/tournaments/${tournamentId}/generate-matches`, {}), createRouteParams({ tournamentId })
));
const progress = async (tournamentId: string) => parseResponse(await progressTournament(
  req('POST', `/api/tournaments/${tournamentId}/progress`, {}), createRouteParams({ tournamentId })
));

/** Create a tournament in the 'assign' phase with `nTeams` two-player teams. */
async function tournamentInAssign(format: string, nTeams: number) {
  const created = await parseResponse(await createTournament(req('POST', '/api/tournaments', {
    name: `B${++seq}`, gameId, gameModeId: normalModeId, format, roundsPerMatch: 1,
  })));
  expect(created.status).toBe(201);
  const id: string = created.data.id;
  await tPost(id, 'gather');

  const teamIds: string[] = [];
  for (let i = 0; i < nTeams; i++) {
    teamIds.push((await parseResponse(await createTeam(
      req('POST', `/api/tournaments/${id}/teams`, { teamName: `T${i + 1}` }), createRouteParams({ tournamentId: id })
    ))).data.id);
  }
  for (let i = 0; i < nTeams * 2; i++) {
    await db.run(
      `INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`,
      [`${id}-tp${i}`, id, `${id}-u${i}`, `d-${id}-${i}`, `U${i}`]
    );
  }
  const put = await assignMembers(req('PUT', `/api/tournaments/${id}/teams`, {
    teams: teamIds.map((teamId, i) => ({
      teamId, members: [0, 1].map(k => ({ userId: `${id}-u${i * 2 + k}`, username: `U${i * 2 + k}` })),
    })),
  }), createRouteParams({ tournamentId: id }));
  expect(put.status).toBe(200);
  expect((await tPost(id, 'assign')).status).toBe(200);
  return { id, teamIds };
}

async function startAndScore(matchId: string, winner: 'team1' | 'team2') {
  for (const s of ['gather', 'assign', 'battle']) {
    const cur = (await db.get<{ status: string }>(`SELECT status FROM matches WHERE id = ?`, [matchId]))!.status;
    const order = ['created', 'gather', 'assign', 'battle'];
    if (order.indexOf(cur) < order.indexOf(s)) {
      const res = await parseResponse(await transitionMatch(
        req('POST', `/api/matches/${matchId}/transition`, { newStatus: s }), createRouteParams({ matchId })
      ));
      expect(res.status, `match -> ${s}`).toBe(200);
    }
  }
  const games = await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ?`, [matchId]);
  for (const g of games) {
    const res = await parseResponse(await saveResult(
      req('POST', `/api/matches/${matchId}/games/${g.id}/result`, { winner, winnerScore: 13, loserScore: 2 }),
      createRouteParams({ matchId, gameId: g.id })
    ));
    expect(res.status, `score: ${JSON.stringify(res.data)}`).toBe(200);
  }
}

/** Play every open match (first-listed team wins) and progress until the tournament completes. */
async function playOut(tournamentId: string, pick: 'team1' | 'team2' = 'team1') {
  for (let iter = 0; iter < 40; iter++) {
    const t = await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [tournamentId]);
    if (t?.status !== 'battle') break;
    const open = await db.all<{ id: string; team1_id: string | null; team2_id: string | null }>(
      `SELECT m.id, tm.team1_id, tm.team2_id FROM matches m JOIN tournament_matches tm ON tm.match_id = m.id
       WHERE m.tournament_id = ? AND m.status != 'complete' ORDER BY tm.round, tm.match_order`, [tournamentId]
    );
    for (const m of open) {
      expect(m.team1_id && m.team2_id, 'every generated match has both teams').toBeTruthy();
      await startAndScore(m.id, pick);
    }
    const p = await progress(tournamentId);
    if (p.status !== 200 && !/not complete/.test(p.data.error ?? '')) {
      throw new Error(`progress failed: ${p.status} ${JSON.stringify(p.data)}`);
    }
  }
}

describe('Tournament brackets', () => {
  beforeEach(async () => {
    db = getTestDb();
    gameId = (await createGame()).id;
    normalModeId = (await addMode('Normal', 5)).modeId;
  });

  describe.each([3, 5, 6, 7])('single elimination with %i teams', (n) => {
    it('has every team play, uses n-1 matches, and crowns the winner of the final', async () => {
      const { id, teamIds } = await tournamentInAssign('single-elimination', n);
      expect((await generate(id)).status).toBe(200);
      expect((await tPost(id, 'battle')).status).toBe(200);
      await playOut(id);

      expect((await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [id]))?.status).toBe('complete');

      const bracket = await db.all<{ team1_id: string; team2_id: string; round: number; winner_team: string }>(
        `SELECT tm.team1_id, tm.team2_id, tm.round, m.winner_team
         FROM tournament_matches tm JOIN matches m ON m.id = tm.match_id WHERE tm.tournament_id = ? ORDER BY tm.round`, [id]
      );
      expect(bracket).toHaveLength(n - 1);

      const played = new Set(bracket.flatMap(m => [m.team1_id, m.team2_id]));
      expect([...played].sort()).toEqual([...teamIds].sort()); // nobody dropped

      // the champion is the winner of the last match and never lost
      const final = bracket[bracket.length - 1];
      const losers = new Set(bracket.map(m => (m.winner_team === m.team1_id ? m.team2_id : m.team1_id)));
      expect(losers.has(final.winner_team)).toBe(false);
      expect(losers.size).toBe(n - 1); // every other team lost exactly once
    });
  });

  describe('double elimination', () => {
    it('plays 4 teams to a champion', async () => {
      const { id, teamIds } = await tournamentInAssign('double-elimination', 4);
      expect((await generate(id)).status).toBe(200);
      expect((await tPost(id, 'battle')).status).toBe(200);
      await playOut(id);
      expect((await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [id]))?.status).toBe('complete');
      const played = await db.all<{ team1_id: string; team2_id: string }>(`SELECT team1_id, team2_id FROM tournament_matches WHERE tournament_id = ?`, [id]);
      expect(new Set(played.flatMap(m => [m.team1_id, m.team2_id]))).toEqual(new Set(teamIds));
    });

    it('only draws grand-final maps from the tournament mode pool (never an FFA map)', async () => {
      // An FFA mode on the same game: an unfiltered pool picks it about half the time.
      const ffa = await addMode('FFA', null);
      for (let run = 0; run < 8; run++) {
        const { id } = await tournamentInAssign('double-elimination', 4);
        await generate(id);
        await tPost(id, 'battle');
        await playOut(id, run % 2 === 0 ? 'team1' : 'team2');
        expect((await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [id]))?.status).toBe('complete');
        const used = await db.all<{ map_id: string }>(
          `SELECT mg.map_id FROM match_games mg JOIN matches m ON m.id = mg.match_id WHERE m.tournament_id = ?`, [id]
        );
        expect(used.some(u => ffa.mapIds.includes(u.map_id))).toBe(false);
      }
    });

    describe.each([2, 3, 4, 5, 6, 8, 9])('%i teams, played through scoring', (n) => {
      it.each([
        ['team1', 'the winners-bracket champion wins the final (no reset)'],
        ['team2', 'the losers-bracket champion wins the final (reset is played)'],
      ] as const)('every team except the champion ends with exactly two losses when %s wins every match: %s', async (pick, _description) => {
        const { id, teamIds } = await tournamentInAssign('double-elimination', n);
        expect((await generate(id)).status).toBe(200);
        expect((await tPost(id, 'battle')).status).toBe(200);
        await playOut(id, pick);
        expect((await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [id]))?.status).toBe('complete');

        const rows = await db.all<{ bracket_type: string; round: number; team1_id: string; team2_id: string; winner_team: string }>(
          `SELECT tm.bracket_type, tm.round, tm.team1_id, tm.team2_id, m.winner_team
           FROM tournament_matches tm JOIN matches m ON m.id = tm.match_id WHERE tm.tournament_id = ?
           ORDER BY tm.round`, [id]
        );
        const losses = new Map<string, number>(teamIds.map(t => [t, 0]));
        for (const r of rows) {
          const loser = r.winner_team === r.team1_id ? r.team2_id : r.team1_id;
          losses.set(loser, (losses.get(loser) ?? 0) + 1);
        }
        const finals = rows.filter(r => r.bracket_type === 'final').sort((a, b) => b.round - a.round);
        const champion = finals[0].winner_team;
        for (const [team, count] of losses) {
          if (team === champion) expect(count).toBeLessThanOrEqual(1);
          else expect(count, `team ${team}`).toBe(2);
        }
        const reset = finals.length === 2;
        expect(reset).toBe(pick === 'team2');
        expect(rows).toHaveLength(reset ? 2 * n - 1 : 2 * n - 2);
      });
    });
  });

  describe('series placings for a double-elimination tournament', () => {
    it.each([
      [4, 'team1'], [4, 'team2'], [6, 'team1'], [6, 'team2'],
    ] as const)('%i teams, %s wins every match: champion / runner-up / third earn 10 / 6 / 3', async (n, pick) => {
      const { id, teamIds } = await tournamentInAssign('double-elimination', n);
      await generate(id);
      await tPost(id, 'battle');
      await playOut(id, pick);

      const rows = await db.all<{ bracket_type: string; round: number; team1_id: string; team2_id: string; winner_team: string }>(
        `SELECT tm.bracket_type, tm.round, tm.team1_id, tm.team2_id, m.winner_team
         FROM tournament_matches tm JOIN matches m ON m.id = tm.match_id WHERE tm.tournament_id = ?`, [id]
      );
      const loserOf = (r: { team1_id: string; team2_id: string; winner_team: string }) =>
        r.winner_team === r.team1_id ? r.team2_id : r.team1_id;
      const finals = rows.filter(r => r.bracket_type === 'final').sort((a, b) => b.round - a.round);
      const champion = finals[0].winner_team;
      const runnerUp = loserOf(finals[0]);
      const lbFinal = rows.filter(r => r.bracket_type === 'losers').sort((a, b) => b.round - a.round)[0];
      const third = loserOf(lbFinal);
      expect(new Set([champion, runnerUp, third]).size).toBe(3);

      const series = await parseResponse(await createSeries(req('POST', '/api/series', {
        name: `DE series ${++seq}`, scoring_config: { tournament_position_points: [10, 6, 3] },
      })));
      const sid: string = series.data.id;
      expect((await parseResponse(await addSeriesEvent(
        req('POST', `/api/series/${sid}/events`, { event_type: 'tournament', tournament_id: id }), createRouteParams({ seriesId: sid })
      ))).status).toBe(201);

      const standings = (await parseResponse(await getSeriesStandings(
        req('GET', `/api/series/${sid}/standings`), createRouteParams({ seriesId: sid })
      ))).data.standings as Array<{ user_id: string; total_points: number }>;
      const points = new Map(standings.map(r => [r.user_id, r.total_points]));

      // team i's players are users 2i and 2i+1 (discord id d-<tournament>-<index>)
      const pointsForTeam = (teamId: string) => {
        const i = teamIds.indexOf(teamId);
        // players without a placing aren't listed in standings at all
        return [points.get(`d-${id}-${i * 2}`) ?? 0, points.get(`d-${id}-${i * 2 + 1}`) ?? 0];
      };
      expect(pointsForTeam(champion)).toEqual([10, 10]);
      expect(pointsForTeam(runnerUp)).toEqual([6, 6]);
      expect(pointsForTeam(third)).toEqual([3, 3]);
      for (const t of teamIds.filter(t => ![champion, runnerUp, third].includes(t))) {
        expect(pointsForTeam(t)).toEqual([0, 0]);
      }
    });
  });

  describe('a drawn tournament match', () => {
    async function drawMatch(matchId: string) {
      for (const st of ['gather', 'assign', 'battle']) {
        const cur = (await db.get<{ status: string }>(`SELECT status FROM matches WHERE id = ?`, [matchId]))!.status;
        const order = ['created', 'gather', 'assign', 'battle'];
        if (order.indexOf(cur) < order.indexOf(st)) {
          await transitionMatch(req('POST', `/api/matches/${matchId}/transition`, { newStatus: st }), createRouteParams({ matchId }));
        }
      }
      const games = await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ?`, [matchId]);
      for (const g of games) {
        const res = await saveResult(
          req('POST', `/api/matches/${matchId}/games/${g.id}/result`, { draw: true }), createRouteParams({ matchId, gameId: g.id })
        );
        expect(res.status).toBe(200);
      }
    }

    it.each(['single-elimination', 'double-elimination'])('%s: a draw stalls the round instead of dropping teams or crowning a champion; rescoring unblocks it', async (format) => {
      const { id } = await tournamentInAssign(format, 4);
      await generate(id);
      await tPost(id, 'battle');
      const [a, b] = await db.all<{ id: string }>(
        `SELECT m.id FROM matches m JOIN tournament_matches tm ON tm.match_id = m.id WHERE m.tournament_id = ? ORDER BY tm.match_order`, [id]
      );
      await drawMatch(a.id);
      await startAndScore(b.id, 'team1');
      expect((await db.get<{ winner_team: string | null }>(`SELECT winner_team FROM matches WHERE id = ?`, [a.id]))?.winner_team).toBeNull();

      const stalled = await progress(id);
      expect(stalled.status).toBe(400);
      expect(stalled.data.error).toMatch(/draw|winner/i);
      expect((await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [id]))?.status).toBe('battle');

      // break the tie by rescoring the drawn map
      const games = await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ?`, [a.id]);
      for (const g of games) {
        const res = await saveResult(
          req('POST', `/api/matches/${a.id}/games/${g.id}/result`, { winner: 'team1', winnerScore: 13, loserScore: 11, rescore: true }),
          createRouteParams({ matchId: a.id, gameId: g.id })
        );
        expect(res.status).toBe(200);
      }
      expect((await db.get<{ winner_team: string | null }>(`SELECT winner_team FROM matches WHERE id = ?`, [a.id]))?.winner_team).not.toBeNull();

      await playOut(id);
      expect((await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [id]))?.status).toBe('complete');
    });
  });

  describe('concurrency', () => {
    it('generate-matches builds the bracket once when called concurrently', async () => {
      const { id } = await tournamentInAssign('single-elimination', 4);
      const results = await Promise.all([generate(id), generate(id), generate(id)]);
      expect(results.filter(r => r.status === 200)).toHaveLength(1);
      expect(results.filter(r => r.status === 400)).toHaveLength(2);
      const count = await db.get<{ c: number }>(`SELECT COUNT(*) c FROM matches WHERE tournament_id = ?`, [id]);
      expect(count?.c).toBe(2);
      const links = await db.get<{ c: number }>(`SELECT COUNT(*) c FROM tournament_matches WHERE tournament_id = ?`, [id]);
      expect(links?.c).toBe(2);
    });

    it('progress generates the next round once when called concurrently', async () => {
      const { id } = await tournamentInAssign('single-elimination', 4);
      await generate(id);
      await tPost(id, 'battle');
      const r1 = await db.all<{ id: string }>(`SELECT id FROM matches WHERE tournament_id = ?`, [id]);
      for (const m of r1) await startAndScore(m.id, 'team1');

      const results = await Promise.all([progress(id), progress(id), progress(id)]);
      expect(results.filter(r => r.status === 200)).toHaveLength(1);
      const round2 = await db.get<{ c: number }>(
        `SELECT COUNT(*) c FROM tournament_matches WHERE tournament_id = ? AND round = 2`, [id]
      );
      expect(round2?.c).toBe(1);
    });
  });
});
