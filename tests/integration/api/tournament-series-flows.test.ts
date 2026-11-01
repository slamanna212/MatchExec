/**
 * Tournament + Series flows through the REAL routes, with scoring done through the result route
 * (nothing in the scoring path is mocked). Mirrors scoring-lifecycle-by-type.test.ts.
 *
 * Regressions covered:
 *  - tournament transitions could skip phases (gather -> battle) or repeat, re-firing side effects
 *  - team DELETE left orphan members / participant assignments (FKs are off)
 *  - team PUT accepted a teamId from another tournament
 *  - tournament positionScoringOverride accepted garbage
 *  - DELETE match left match_participants / match_games behind
 *  - series standings gave tied players different ranks
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { createGame, createGameMode } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as createTournament, } from '@/app/api/tournaments/route';
import { PUT as updateTournament } from '@/app/api/tournaments/[tournamentId]/route';
import { POST as transitionTournament } from '@/app/api/tournaments/[tournamentId]/transition/route';
import { POST as createTeam, PUT as assignMembers, DELETE as deleteTeam } from '@/app/api/tournaments/[tournamentId]/teams/route';
import { POST as generateMatches } from '@/app/api/tournaments/[tournamentId]/generate-matches/route';
import { POST as progressTournament } from '@/app/api/tournaments/[tournamentId]/progress/route';
import { GET as getLeaderboard } from '@/app/api/tournaments/[tournamentId]/leaderboard/route';
import { forwardToApp as createMatch } from '../../utils/legacy-match-routes';
import { forwardToApp as deleteMatch } from '../../utils/legacy-match-routes';
import { forwardToApp as transitionMatch } from '../../utils/legacy-match-routes';
import { forwardToApp as assignTeams } from '../../utils/legacy-match-routes';
import { forwardToApp as saveResult } from '../../utils/legacy-match-routes';
import { POST as createSeries, } from '@/app/api/series/route';
import { DELETE as deleteSeries } from '@/app/api/series/[seriesId]/route';
import { POST as addEvent } from '@/app/api/series/[seriesId]/events/route';
import { GET as getStandings } from '@/app/api/series/[seriesId]/standings/route';
import { POST as transitionSeries } from '@/app/api/series/[seriesId]/transition/route';

let db: ReturnType<typeof getTestDb>;
let gameId: string;
let seq = 0;

const req = (method: string, url: string, body?: Record<string, unknown>) => createMockRequest(method, url, body);

async function mkMode(scoringType: 'Normal' | 'Position', teamSize: number) {
  const mode = await createGameMode(gameId, { scoring_type: scoringType, team_size: teamSize, name: `${scoringType} ${teamSize}` });
  const mapIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const id = `tmap-${++seq}`;
    await db.run(`INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`, [id, gameId, mode.id, `Map ${id}`]);
    mapIds.push(id);
  }
  return { modeId: mode.id, mapIds };
}

async function newTournament(modeId: string, format: string, extra: Record<string, unknown> = {}) {
  const res = await parseResponse(await createTournament(req('POST', '/api/tournaments', {
    name: `T${++seq}`, gameId, gameModeId: modeId, format, roundsPerMatch: 1, ...extra,
  })));
  expect(res.status).toBe(201);
  return res.data.id as string;
}

const tPost = async (tournamentId: string, newStatus: string) =>
  parseResponse(await transitionTournament(
    req('POST', `/api/tournaments/${tournamentId}/transition`, { newStatus }), createRouteParams({ tournamentId })
  ));

async function addPlayers(tournamentId: string, n: number, discordBase: number) {
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const userId = `${tournamentId}-u${i}`;
    await db.run(
      `INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`,
      [`${tournamentId}-tp${i}`, tournamentId, userId, `${discordBase + i}`, `P${discordBase + i}`]
    );
    users.push(userId);
  }
  return users;
}

async function newTeams(tournamentId: string, users: string[], perTeam: number) {
  const teamIds: string[] = [];
  for (let i = 0; i < users.length / perTeam; i++) {
    const res = await parseResponse(await createTeam(
      req('POST', `/api/tournaments/${tournamentId}/teams`, { teamName: `Team ${i + 1}` }), createRouteParams({ tournamentId })
    ));
    teamIds.push(res.data.id);
  }
  const put = await assignMembers(req('PUT', `/api/tournaments/${tournamentId}/teams`, {
    teams: teamIds.map((teamId, i) => ({
      teamId,
      members: users.slice(i * perTeam, (i + 1) * perTeam).map(userId => ({ userId, username: `name-${userId}` })),
    })),
  }), createRouteParams({ tournamentId }));
  expect(put.status).toBe(200);
  return teamIds;
}

async function scoreNormal(matchId: string, winner: 'team1' | 'team2') {
  const games = await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ? ORDER BY round`, [matchId]);
  expect(games.length).toBeGreaterThan(0);
  for (const g of games) {
    const res = await parseResponse(await saveResult(
      req('POST', `/api/matches/${matchId}/games/${g.id}/result`, { winner, winnerScore: 13, loserScore: 4 }),
      createRouteParams({ matchId, gameId: g.id })
    ));
    expect(res.status).toBe(200);
  }
}

async function startMatch(matchId: string) {
  const row = await db.get<{ status: string }>(`SELECT status FROM matches WHERE id = ?`, [matchId]);
  const path = ['gather', 'assign', 'battle'];
  for (const s of path.slice(path.indexOf(row!.status) + 1)) {
    const res = await parseResponse(await transitionMatch(
      req('POST', `/api/matches/${matchId}/transition`, { newStatus: s }), createRouteParams({ matchId })
    ));
    expect(res.status).toBe(200);
  }
}

describe('Tournament & Series flows', () => {
  beforeEach(async () => {
    db = getTestDb();
    gameId = (await createGame()).id;
  });

  describe('tournament transitions', () => {
    it('rejects skipping phases, repeating a phase, and leaving a terminal phase', async () => {
      const { modeId } = await mkMode('Normal', 5);
      const id = await newTournament(modeId, 'single-elimination');

      expect((await tPost(id, 'battle')).status).toBe(400); // created -> battle
      expect((await tPost(id, 'complete')).status).toBe(400); // created -> complete
      expect((await tPost(id, 'gather')).status).toBe(200);
      expect((await tPost(id, 'gather')).status).toBe(400); // repeat
      expect((await tPost(id, 'battle')).status).toBe(400); // gather -> battle (no bracket)
      expect((await tPost(id, 'assign')).status).toBe(200);
      expect((await tPost(id, 'gather')).status).toBe(400); // backwards

      expect((await tPost(id, 'cancelled')).status).toBe(200);
      expect((await tPost(id, 'assign')).status).toBe(400); // terminal
      expect((await tPost(id, 'cancelled')).status).toBe(400);
    });

    it('does not re-queue side effects on a repeated transition', async () => {
      const { modeId } = await mkMode('Normal', 5);
      const id = await newTournament(modeId, 'single-elimination');
      await tPost(id, 'gather');
      const before = await db.get<{ c: number }>(`SELECT COUNT(*) c FROM activity_feed WHERE tournament_id = ?`, [id]);
      await tPost(id, 'gather');
      const after = await db.get<{ c: number }>(`SELECT COUNT(*) c FROM activity_feed WHERE tournament_id = ?`, [id]);
      expect(after?.c).toBe(before?.c);
    });
  });

  describe('tournament create/update validation', () => {
    it('rejects a malformed positionScoringOverride and accepts both valid shapes', async () => {
      const { modeId } = await mkMode('Position', 1);
      const base = { name: 'Cum', gameId, gameModeId: modeId, format: 'cumulative-points', roundsPerMatch: 1 };
      for (const bad of ['garbage', '[]', '{}', JSON.stringify({ '1': 'x' }), JSON.stringify({ first: 3 })]) {
        const res = await createTournament(req('POST', '/api/tournaments', { ...base, positionScoringOverride: bad }));
        expect(res.status, bad).toBe(400);
      }
      for (const good of [JSON.stringify({ '1': 5, '2': 3 }), JSON.stringify({ type: 'Position', pointsPerPosition: { '1': 5 } })]) {
        const res = await createTournament(req('POST', '/api/tournaments', { ...base, positionScoringOverride: good }));
        expect(res.status).toBe(201);
      }
    });

    it('validates positionScoringOverride on update too', async () => {
      const { modeId } = await mkMode('Position', 1);
      const id = await newTournament(modeId, 'cumulative-points');
      const bad = await updateTournament(
        req('PUT', `/api/tournaments/${id}`, { positionScoringOverride: 'nope' }), createRouteParams({ tournamentId: id })
      );
      expect(bad.status).toBe(400);
    });
  });

  describe('tournament teams', () => {
    it('refuses to write members into a team from another tournament', async () => {
      const { modeId } = await mkMode('Normal', 5);
      const a = await newTournament(modeId, 'single-elimination');
      const b = await newTournament(modeId, 'single-elimination');
      const usersA = await addPlayers(a, 2, 100);
      const [teamA] = await newTeams(a, usersA, 2);
      const usersB = await addPlayers(b, 2, 200);
      await newTeams(b, usersB, 2);

      const res = await assignMembers(req('PUT', `/api/tournaments/${b}/teams`, {
        teams: [{ teamId: teamA, members: [{ userId: usersB[0], username: 'x' }] }],
      }), createRouteParams({ tournamentId: b }));
      expect(res.status).toBe(400);

      const members = await db.all(`SELECT * FROM tournament_team_members WHERE team_id = ?`, [teamA]);
      expect(members).toHaveLength(2); // untouched
    });

    it('deleting a team removes its members and clears participant assignments', async () => {
      const { modeId } = await mkMode('Normal', 5);
      const id = await newTournament(modeId, 'single-elimination');
      const users = await addPlayers(id, 4, 300);
      const [t1] = await newTeams(id, users, 2);

      const res = await deleteTeam(
        req('DELETE', `/api/tournaments/${id}/teams?teamId=${t1}`), createRouteParams({ tournamentId: id })
      );
      expect(res.status).toBe(200);
      expect(await db.all(`SELECT 1 FROM tournament_team_members WHERE team_id = ?`, [t1])).toHaveLength(0);
      expect(await db.all(`SELECT 1 FROM tournament_participants WHERE team_assignment = ?`, [t1])).toHaveLength(0);
    });

    it('refuses to delete a team that is already in the bracket', async () => {
      const { modeId } = await mkMode('Normal', 5);
      const id = await newTournament(modeId, 'single-elimination');
      const users = await addPlayers(id, 4, 400);
      const teams = await newTeams(id, users, 2);
      await tPost(id, 'gather');
      await tPost(id, 'assign');
      expect((await parseResponse(await generateMatches(
        req('POST', `/api/tournaments/${id}/generate-matches`, {}), createRouteParams({ tournamentId: id })
      ))).status).toBe(200);

      const res = await deleteTeam(
        req('DELETE', `/api/tournaments/${id}/teams?teamId=${teams[0]}`), createRouteParams({ tournamentId: id })
      );
      expect(res.status).toBe(409);
      expect(await db.all(`SELECT 1 FROM tournament_team_members WHERE team_id = ?`, [teams[0]])).toHaveLength(2);
    });
  });

  describe('single elimination, played through scoring', () => {
    it('plays a 4-team bracket to a champion', async () => {
      const { modeId } = await mkMode('Normal', 5);
      const id = await newTournament(modeId, 'single-elimination');
      await tPost(id, 'gather');
      const users = await addPlayers(id, 8, 700);
      const teams = await newTeams(id, users, 2);
      expect((await tPost(id, 'assign')).status).toBe(200);
      const gen = await parseResponse(await generateMatches(
        req('POST', `/api/tournaments/${id}/generate-matches`, {}), createRouteParams({ tournamentId: id })
      ));
      expect(gen.status).toBe(200);
      expect((await tPost(id, 'battle')).status).toBe(200);

      const prog = async () => parseResponse(await progressTournament(
        req('POST', `/api/tournaments/${id}/progress`, {}), createRouteParams({ tournamentId: id })
      ));
      const round = async (r: number) => db.all<{ id: string; team1_id: string; team2_id: string }>(
        `SELECT m.id, tm.team1_id, tm.team2_id FROM matches m JOIN tournament_matches tm ON tm.match_id = m.id
         WHERE m.tournament_id = ? AND tm.round = ? ORDER BY tm.match_order`, [id, r]
      );

      const r1 = await round(1);
      expect(r1).toHaveLength(2);
      expect((await prog()).status).toBe(400); // round not finished

      await startMatch(r1[0].id);
      await scoreNormal(r1[0].id, 'team1');
      expect((await prog()).status).toBe(400); // one match still open
      await startMatch(r1[1].id);
      await scoreNormal(r1[1].id, 'team2');

      // winner_team of a tournament match is a tournament_teams.id, not a match_teams.id
      const w0 = await db.get<{ winner_team: string }>(`SELECT winner_team FROM matches WHERE id = ?`, [r1[0].id]);
      const w1 = await db.get<{ winner_team: string }>(`SELECT winner_team FROM matches WHERE id = ?`, [r1[1].id]);
      expect(w0?.winner_team).toBe(r1[0].team1_id);
      expect(w1?.winner_team).toBe(r1[1].team2_id);

      expect((await prog()).status).toBe(200);
      const r2 = await round(2);
      expect(r2).toHaveLength(1);
      expect([r2[0].team1_id, r2[0].team2_id].sort()).toEqual([r1[0].team1_id, r1[1].team2_id].sort());

      await startMatch(r2[0].id);
      await scoreNormal(r2[0].id, 'team2');
      const finalProg = await prog();
      expect(finalProg.status).toBe(200);

      const t = await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [id]);
      expect(t?.status).toBe('complete');
      expect(finalProg.data.winner).toBe(r2[0].team2_id);
      expect(teams).toContain(finalProg.data.winner);
    });
  });

  describe('cumulative points (Position), with a tournament override', () => {
    it('applies the tournament spread, completes, and ranks the leaderboard', async () => {
      const { modeId } = await mkMode('Position', 1);
      const id = await newTournament(modeId, 'cumulative-points', {
        roundsPerMatch: 2,
        positionScoringOverride: JSON.stringify({ type: 'Position', pointsPerPosition: { '1': 10, '2': 6, '3': 3, '4': 1 } }),
      });
      await tPost(id, 'gather');
      await addPlayers(id, 4, 600);
      expect((await tPost(id, 'assign')).status).toBe(200);
      expect((await parseResponse(await generateMatches(
        req('POST', `/api/tournaments/${id}/generate-matches`, {}), createRouteParams({ tournamentId: id })
      ))).status).toBe(200);
      expect((await tPost(id, 'battle')).status).toBe(200);

      const [match] = await db.all<{ id: string; mode_id: string | null }>(`SELECT id, mode_id FROM matches WHERE tournament_id = ?`, [id]);
      expect(match.mode_id).toBe(modeId);
      await startMatch(match.id);
      const ps = await db.all<{ id: string }>(`SELECT id FROM match_participants WHERE match_id = ? ORDER BY username`, [match.id]);
      const games = await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ? ORDER BY round`, [match.id]);
      expect(games).toHaveLength(2);
      const orders = [[0, 1, 2, 3], [0, 2, 1, 3]];
      for (let i = 0; i < 2; i++) {
        const res = await parseResponse(await saveResult(
          req('POST', `/api/matches/${match.id}/games/${games[i].id}/result`, {
            type: 'Position', matchId: match.id, gameId: games[i].id,
            positionResults: Object.fromEntries(orders[i].map((k, p) => [ps[k].id, p + 1])),
          }),
          createRouteParams({ matchId: match.id, gameId: games[i].id })
        ));
        expect(res.status).toBe(200);
      }

      const m = await db.get<{ status: string; winner_team: string }>(`SELECT status, winner_team FROM matches WHERE id = ?`, [match.id]);
      expect(m).toMatchObject({ status: 'complete', winner_team: ps[0].id });

      const lb = await parseResponse(await getLeaderboard(
        req('GET', `/api/tournaments/${id}/leaderboard`), createRouteParams({ tournamentId: id })
      ));
      const totals = lb.data.leaderboard.map((r: { total_points: number }) => r.total_points);
      expect(totals).toEqual([20, 9, 9, 2]); // 10+10, 6+3, 3+6, 1+1 (default spread would give 50)
      expect(lb.data.leaderboard.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 2, 4]);

      const prog = await parseResponse(await progressTournament(
        req('POST', `/api/tournaments/${id}/progress`, {}), createRouteParams({ tournamentId: id })
      ));
      expect(prog.status).toBe(200);
      expect((await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [id]))?.status).toBe('complete');
    });
  });

  describe('deleting', () => {
    it('DELETE match removes its participants, games, teams and series events', async () => {
      const { mapIds } = await mkMode('Normal', 5);
      const created = await parseResponse(await createMatch(req('POST', '/api/matches', {
        name: 'Doomed', gameId, maps: [mapIds[0]], startDate: new Date().toISOString(),
      })));
      const matchId: string = created.data.id;
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES (?, ?, 'u', 'd', 'P')`, [`${matchId}-p`, matchId]
      );
      for (const s of ['gather', 'assign', 'battle']) {
        await transitionMatch(req('POST', `/api/matches/${matchId}/transition`, { newStatus: s }), createRouteParams({ matchId }));
      }
      const series = await parseResponse(await createSeries(req('POST', '/api/series', { name: 'S' })));
      await addEvent(req('POST', `/api/series/${series.data.id}/events`, { event_type: 'match', match_id: matchId }),
        createRouteParams({ seriesId: series.data.id }));
      expect(await db.all(`SELECT 1 FROM match_games WHERE match_id = ?`, [matchId])).not.toHaveLength(0);

      const res = await deleteMatch(req('DELETE', `/api/matches/${matchId}`), createRouteParams({ matchId }));
      expect(res.status).toBe(200);
      for (const table of ['match_participants', 'match_games', 'match_teams', 'series_events']) {
        expect(await db.all(`SELECT 1 FROM ${table} WHERE match_id = ?`, [matchId]), table).toHaveLength(0);
      }
    });

    it('DELETE series removes its events', async () => {
      const series = await parseResponse(await createSeries(req('POST', '/api/series', { name: 'S' })));
      const sid: string = series.data.id;
      const { mapIds } = await mkMode('Normal', 5);
      const m = await parseResponse(await createMatch(req('POST', '/api/matches', {
        name: 'M', gameId, maps: [mapIds[0]], startDate: new Date().toISOString(),
      })));
      await addEvent(req('POST', `/api/series/${sid}/events`, { event_type: 'match', match_id: m.data.id }), createRouteParams({ seriesId: sid }));
      expect((await deleteSeries(req('DELETE', `/api/series/${sid}`), createRouteParams({ seriesId: sid }))).status).toBe(200);
      expect(await db.all(`SELECT 1 FROM series_events WHERE series_id = ?`, [sid])).toHaveLength(0);
    });
  });

  describe('series', () => {
    async function seriesWith(config: Record<string, unknown>) {
      const res = await parseResponse(await createSeries(req('POST', '/api/series', { name: `S${++seq}`, scoring_config: config })));
      expect(res.status).toBe(201);
      return res.data.id as string;
    }
    const add = async (sid: string, body: Record<string, unknown>) =>
      parseResponse(await addEvent(req('POST', `/api/series/${sid}/events`, body), createRouteParams({ seriesId: sid })));
    const standings = async (sid: string) =>
      (await parseResponse(await getStandings(req('GET', `/api/series/${sid}/standings`), createRouteParams({ seriesId: sid })))).data.standings as
        Array<{ rank: number; user_id: string; total_points: number; events_played: number }>;

    async function completedNormalMatch(players: number) {
      const { mapIds } = await mkMode('Normal', 5);
      const c = await parseResponse(await createMatch(req('POST', '/api/matches', {
        name: 'N', gameId, maps: [mapIds[0]], startDate: new Date().toISOString(),
      })));
      const matchId: string = c.data.id;
      const ids: string[] = [];
      for (let i = 0; i < players; i++) {
        const pid = `${matchId}-p${i}`;
        await db.run(`INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`,
          [pid, matchId, `su${i}`, `${800 + i}`, `S${800 + i}`]);
        ids.push(pid);
      }
      await transitionMatch(req('POST', `/api/matches/${matchId}/transition`, { newStatus: 'gather' }), createRouteParams({ matchId }));
      await transitionMatch(req('POST', `/api/matches/${matchId}/transition`, { newStatus: 'assign' }), createRouteParams({ matchId }));
      const teams = await db.all<{ id: string }>(`SELECT id FROM match_teams WHERE match_id = ? AND is_reserve = 0 ORDER BY team_order`, [matchId]);
      await assignTeams(req('POST', `/api/matches/${matchId}/assign-teams`, {
        teamAssignments: ids.map((participantId, i) => ({ participantId, teamId: teams[i % 2].id })),
      }), createRouteParams({ matchId }));
      await transitionMatch(req('POST', `/api/matches/${matchId}/transition`, { newStatus: 'battle' }), createRouteParams({ matchId }));
      await scoreNormal(matchId, 'team1'); // even-index players (team 0) win
      expect((await db.get<{ status: string }>(`SELECT status FROM matches WHERE id = ?`, [matchId]))?.status).toBe('complete');
      return matchId;
    }

    it('scores a completed match: winners get win points, the rest loss points, x multiplier', async () => {
      const matchId = await completedNormalMatch(4);
      const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1 });
      expect((await add(sid, { event_type: 'match', match_id: matchId, points_multiplier: 2 })).status).toBe(201);
      const rows = await standings(sid);
      const pts = Object.fromEntries(rows.map(r => [r.user_id, r.total_points]));
      expect(pts).toEqual({ '800': 6, '802': 6, '801': 2, '803': 2 });
      expect(rows.every(r => r.events_played === 1)).toBe(true);
    });

    it('gives tied players the same rank', async () => {
      const matchId = await completedNormalMatch(4);
      const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1 });
      await add(sid, { event_type: 'match', match_id: matchId });
      const rows = await standings(sid);
      // two winners on 3, two losers on 1
      expect(rows.map(r => r.rank)).toEqual([1, 1, 3, 3]);
    });

    it('ignores events that are not complete yet', async () => {
      const { mapIds } = await mkMode('Normal', 5);
      const open = await parseResponse(await createMatch(req('POST', '/api/matches', {
        name: 'Open', gameId, maps: [mapIds[0]], startDate: new Date().toISOString(),
      })));
      await db.run(`INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES ('op', ?, 'x', '1', 'X')`, [open.data.id]);
      const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1 });
      expect((await add(sid, { event_type: 'match', match_id: open.data.id })).status).toBe(201);
      expect(await standings(sid)).toEqual([]);
    });

    it('validates events and series transitions', async () => {
      const matchId = await completedNormalMatch(2);
      const sid = await seriesWith({ match_win_points: 1 });
      expect((await add(sid, { event_type: 'bogus' })).status).toBe(400);
      expect((await add(sid, { event_type: 'match', match_id: 'missing' })).status).toBe(400);
      expect((await add(sid, { event_type: 'match', match_id: matchId, points_multiplier: -1 })).status).toBe(400);
      expect((await add(sid, { event_type: 'match', match_id: matchId })).status).toBe(201);
      expect((await add(sid, { event_type: 'match', match_id: matchId })).status).toBe(409);

      const to = async (status: string) => (await transitionSeries(
        req('POST', `/api/series/${sid}/transition`, { status }), createRouteParams({ seriesId: sid })
      )).status;
      expect(await to('complete')).toBe(400); // created -> complete
      expect(await to('active')).toBe(200);
      expect(await to('complete')).toBe(200);
      expect(await to('active')).toBe(400); // terminal
      expect((await add(sid, { event_type: 'tournament', tournament_id: 'x' })).status).toBe(409);
    });

    it('combines match, Position and tournament events into one standing', async () => {
      // Position match (default spread, x2)
      const pos = await mkMode('Position', 1);
      const pm = await parseResponse(await createMatch(req('POST', '/api/matches', {
        name: 'Race', gameId, maps: [pos.mapIds[0]], startDate: new Date().toISOString(),
      })));
      const posId: string = pm.data.id;
      const pIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const pid = `${posId}-p${i}`;
        await db.run(`INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`,
          [pid, posId, `ru${i}`, `${900 + i}`, `R${900 + i}`]);
        pIds.push(pid);
      }
      await startMatch(posId);
      const [g] = await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ?`, [posId]);
      await saveResult(req('POST', `/api/matches/${posId}/games/${g.id}/result`, {
        type: 'Position', matchId: posId, gameId: g.id, positionResults: { [pIds[2]]: 1, [pIds[0]]: 2, [pIds[1]]: 3 },
      }), createRouteParams({ matchId: posId, gameId: g.id }));

      // Cumulative tournament, finished: positions 1..3 -> [10, 6, 3]
      const tm = await mkMode('Position', 1);
      const tid = await newTournament(tm.modeId, 'cumulative-points');
      await tPost(tid, 'gather');
      await addPlayers(tid, 3, 950);
      await tPost(tid, 'assign');
      await generateMatches(req('POST', `/api/tournaments/${tid}/generate-matches`, {}), createRouteParams({ tournamentId: tid }));
      await tPost(tid, 'battle');
      const [tmatch] = await db.all<{ id: string }>(`SELECT id FROM matches WHERE tournament_id = ?`, [tid]);
      await startMatch(tmatch.id);
      const tps = await db.all<{ id: string }>(`SELECT id FROM match_participants WHERE match_id = ? ORDER BY username`, [tmatch.id]);
      const [tg] = await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ?`, [tmatch.id]);
      await saveResult(req('POST', `/api/matches/${tmatch.id}/games/${tg.id}/result`, {
        type: 'Position', matchId: tmatch.id, gameId: tg.id, positionResults: { [tps[0].id]: 1, [tps[1].id]: 2, [tps[2].id]: 3 },
      }), createRouteParams({ matchId: tmatch.id, gameId: tg.id }));
      await progressTournament(req('POST', `/api/tournaments/${tid}/progress`, {}), createRouteParams({ tournamentId: tid }));
      expect((await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [tid]))?.status).toBe('complete');

      const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1, tournament_position_points: [10, 6, 3] });
      await add(sid, { event_type: 'match', match_id: posId, points_multiplier: 2 });
      await add(sid, { event_type: 'tournament', tournament_id: tid });

      const pts = Object.fromEntries((await standings(sid)).map(r => [r.user_id, r.total_points]));
      // Position event: default spread 25/18/15, x2 -> R902 50, R900 36, R901 30
      // Tournament event: 10/6/3 for the three cumulative players
      expect(pts).toMatchObject({ '902': 50, '900': 36, '901': 30, '950': 10, '951': 6, '952': 3 });
    });
  });
});
