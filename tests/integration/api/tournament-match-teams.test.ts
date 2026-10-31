/**
 * Tournament match_teams wiring + cumulative-points end-to-end.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createTournament, createGame, createGameMode } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as createTeam } from '@/app/api/tournaments/[tournamentId]/teams/route';
import { POST as transitionTournament } from '@/app/api/tournaments/[tournamentId]/transition/route';
import { POST as generateMatches } from '@/app/api/tournaments/[tournamentId]/generate-matches/route';
import { POST as progress } from '@/app/api/tournaments/[tournamentId]/progress/route';
import { GET as getStandings } from '@/app/api/tournaments/[tournamentId]/standings/route';
import { GET as getLeaderboard } from '@/app/api/tournaments/[tournamentId]/leaderboard/route';

type Db = ReturnType<typeof getTestDb>;

async function addMaps(db: Db, gameId: string, modeId: string, n = 3) {
  for (let i = 1; i <= n; i++) {
    await db.run(
      `INSERT OR IGNORE INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
      [`map-${i}-${modeId}`, gameId, modeId, `Map ${i}`]
    );
  }
}

async function transition(tournamentId: string, newStatus: string) {
  const res = await transitionTournament(
    createMockRequest('POST', `/api/tournaments/${tournamentId}/transition`, { newStatus }),
    createRouteParams({ tournamentId })
  );
  return parseResponse(res);
}

describe('Tournament matches get match_teams', () => {
  let db: Db;

  beforeEach(async () => {
    db = getTestDb();
  });

  it('creates match_teams named after tournament teams and links participants', async () => {
    const { game, mode } = await seedBasicTestData();
    await addMaps(db, game.id, mode.id);
    const tournament = await createTournament(game.id, { game_mode_id: mode.id, rounds_per_match: 1 });
    const tid = tournament.id;

    const t1 = (await parseResponse(await createTeam(
      createMockRequest('POST', `/api/tournaments/${tid}/teams`, { teamName: 'Red Dragons' }),
      createRouteParams({ tournamentId: tid })
    ))).data;
    const t2 = (await parseResponse(await createTeam(
      createMockRequest('POST', `/api/tournaments/${tid}/teams`, { teamName: 'Blue Phoenix' }),
      createRouteParams({ tournamentId: tid })
    ))).data;
    await db.run(`INSERT INTO tournament_team_members (id, team_id, user_id, discord_user_id, username) VALUES ('m1', ?, 'u1', 'd1', 'P1')`, [t1.id]);
    await db.run(`INSERT INTO tournament_team_members (id, team_id, user_id, discord_user_id, username) VALUES ('m2', ?, 'u2', 'd2', 'P2')`, [t2.id]);
    await db.run(`UPDATE tournaments SET status = 'assign' WHERE id = ?`, [tid]);

    const gen = await generateMatches(
      createMockRequest('POST', `/api/tournaments/${tid}/generate-matches`, {}),
      createRouteParams({ tournamentId: tid })
    );
    expect((await parseResponse(gen)).status).toBe(200);

    const match = await db.get<{ id: string }>(`SELECT id FROM matches WHERE tournament_id = ?`, [tid]);
    const teams = await db.all<{ id: string; team_name: string; team_order: number; team_color: string }>(
      `SELECT id, team_name, team_order, team_color FROM match_teams WHERE match_id = ? AND is_reserve = 0 ORDER BY team_order`,
      [match!.id]
    );
    expect(teams.map(t => t.team_name)).toEqual(['Red Dragons', 'Blue Phoenix']);
    expect(teams[0].team_color).toBe('#4A90E2');
    expect(teams[1].team_color).toBe('#E04A4A');

    const parts = await db.all<{ username: string; team_id: string; team_assignment: string }>(
      `SELECT username, team_id, team_assignment FROM match_participants WHERE match_id = ? ORDER BY username`,
      [match!.id]
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ username: 'P1', team_id: teams[0].id, team_assignment: 'blue' });
    expect(parts[1]).toMatchObject({ username: 'P2', team_id: teams[1].id, team_assignment: 'red' });
  });
});

describe('Cumulative-points tournament (Mario-Kart-like, NULL team_size)', () => {
  let db: Db;
  let gameId: string;
  let modeId: string;

  beforeEach(async () => {
    db = getTestDb();
    const game = await createGame();
    const mode = await createGameMode(game.id, { scoring_type: 'Position' });
    await db.run(`UPDATE game_modes SET team_size = NULL, max_teams = NULL WHERE id = ?`, [mode.id]);
    gameId = game.id;
    modeId = mode.id;
    await addMaps(db, gameId, modeId, 2);
  });

  async function setupAndStart() {
    const tournament = await createTournament(gameId, {
      game_mode_id: modeId, format: 'cumulative-points', rounds_per_match: 2,
    });
    const tid = tournament.id;
    await db.run(`UPDATE tournaments SET status = 'gather' WHERE id = ?`, [tid]);
    for (const [i, name] of ['Alice', 'Bob', 'Cara'].entries()) {
      await db.run(
        `INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`,
        [`tp${i}`, tid, `u${i}`, `d${i}`, name]
      );
    }
    expect((await transition(tid, 'assign')).status).toBe(200);

    const soloTeams = await db.all<{ id: string }>(`SELECT id FROM tournament_teams WHERE tournament_id = ?`, [tid]);
    expect(soloTeams).toHaveLength(3);
    const members = await db.all<{ discord_user_id: string }>(
      `SELECT ttm.discord_user_id FROM tournament_team_members ttm JOIN tournament_teams tt ON tt.id = ttm.team_id WHERE tt.tournament_id = ?`, [tid]);
    expect(members.every(m => m.discord_user_id)).toBe(true);

    const gen = await generateMatches(
      createMockRequest('POST', `/api/tournaments/${tid}/generate-matches`, {}),
      createRouteParams({ tournamentId: tid })
    );
    const genRes = await parseResponse(gen);
    expect(genRes.status).toBe(200);

    const match = await db.get<{ id: string; status: string }>(`SELECT id, status FROM matches WHERE tournament_id = ?`, [tid]);
    expect(match!.status).toBe('assign');
    const mteams = await db.all(`SELECT id FROM match_teams WHERE match_id = ? AND is_reserve = 0`, [match!.id]);
    expect(mteams).toHaveLength(3);

    expect((await transition(tid, 'battle')).status).toBe(200);
    const started = await db.get<{ status: string }>(`SELECT status FROM matches WHERE id = ?`, [match!.id]);
    expect(started!.status).toBe('battle');
    const games = await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ? ORDER BY round`, [match!.id]);
    expect(games).toHaveLength(2);
    return { tid, matchId: match!.id, games };
  }

  async function placeGame(matchId: string, gameRowId: string, order: string[]) {
    await db.run(`UPDATE match_games SET status = 'completed' WHERE id = ?`, [gameRowId]);
    const parts = await db.all<{ id: string; username: string }>(`SELECT id, username FROM match_participants WHERE match_id = ?`, [matchId]);
    for (const [i, name] of order.entries()) {
      const p = parts.find(x => x.username === name)!;
      await db.run(
        `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded) VALUES (?, ?, 'participant', ?, ?, ?)`,
        [`pl_${gameRowId}_${i}`, gameRowId, p.id, i + 1, [10, 5, 1][i]]
      );
    }
  }

  it('generates, starts, completes, and announces a winner; standings aggregate per player', async () => {
    const { tid, matchId, games } = await setupAndStart();

    // Progress too early is rejected
    const early = await progress(createMockRequest('POST', `/api/tournaments/${tid}/progress`, {}), createRouteParams({ tournamentId: tid }));
    expect((await parseResponse(early)).status).toBe(400);

    await placeGame(matchId, games[0].id, ['Alice', 'Bob', 'Cara']);
    await placeGame(matchId, games[1].id, ['Alice', 'Cara', 'Bob']);
    await db.run(`UPDATE matches SET status = 'complete' WHERE id = ?`, [matchId]);

    const res = await progress(createMockRequest('POST', `/api/tournaments/${tid}/progress`, {}), createRouteParams({ tournamentId: tid }));
    const { status, data } = await parseResponse(res);
    expect(status).toBe(200);
    expect(data.winner).toBe('Alice');

    const t = await db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [tid]);
    expect(t!.status).toBe('complete');
    const notif = await db.get<{ winning_team_name: string }>(`SELECT winning_team_name FROM discord_match_winner_queue WHERE match_id = ?`, [tid]);
    expect(notif!.winning_team_name).toBe('Alice');
  });

  it('standings aggregate the same discord user across two matches and share ranks on ties; leaderboard counts completed games', async () => {
    const { tid, matchId, games } = await setupAndStart();
    await placeGame(matchId, games[0].id, ['Alice', 'Bob', 'Cara']);
    await placeGame(matchId, games[1].id, ['Bob', 'Alice', 'Cara']);

    // A second tournament match with the same discord users
    const m2 = 'second-match';
    await db.run(
      `INSERT INTO matches (id, name, game_id, mode_id, status, tournament_id, start_date, start_time) VALUES (?, 'M2', ?, ?, 'complete', ?, '2099-01-01', '2099-01-01T00:00:00Z')`,
      [m2, gameId, modeId, tid]
    );
    for (const [i, name] of ['Alice', 'Bob'].entries()) {
      await db.run(`INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`, [`m2p${i}`, m2, `other${i}`, `d${i}`, name]);
    }
    await db.run(`INSERT INTO match_games (id, match_id, map_id, round, status) VALUES ('m2g1', ?, ?, 1, 'completed')`, [m2, `map-1-${modeId}`]);
    await db.run(`INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded) VALUES ('m2pl0', 'm2g1', 'participant', 'm2p0', 1, 10)`);
    await db.run(`INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded) VALUES ('m2pl1', 'm2g1', 'participant', 'm2p1', 2, 5)`);

    const res = await getStandings(createMockRequest('GET', `/api/tournaments/${tid}/standings`), createRouteParams({ tournamentId: tid }));
    const { data } = await parseResponse(res);
    const rows = data.standings as Array<{ username: string; total_points: number; rank: number }>;
    expect(rows).toHaveLength(3);
    const alice = rows.find(r => r.username === 'Alice')!;
    const bob = rows.find(r => r.username === 'Bob')!;
    expect(alice.total_points).toBe(10 + 5 + 10);
    expect(bob.total_points).toBe(5 + 10 + 5);
    expect(alice.rank).toBe(1);
    expect(bob.rank).toBe(2);

    const lb = await getLeaderboard(createMockRequest('GET', `/api/tournaments/${tid}/leaderboard`), createRouteParams({ tournamentId: tid }));
    const lbData = (await parseResponse(lb)).data;
    expect(lbData.leaderboard.find((r: any) => r.username === 'Alice').total_points).toBe(25);
    const withPlacements = lbData.match_breakdown.filter((r: any) => r.position != null);
    expect(withPlacements.length).toBeGreaterThanOrEqual(7);
  });
});
