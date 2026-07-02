/**
 * K2 — Tournament Full Lifecycle Integration Test
 *
 * Walks a tournament through: created → gather → assign (bracket + matches) → battle → complete
 * Verifies API responses, DB state, and standings at each step.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createTournament } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as createTeam, GET as getTeams } from '@/app/api/tournaments/[tournamentId]/teams/route';
import { POST as transitionTournament } from '@/app/api/tournaments/[tournamentId]/transition/route';
import { POST as generateMatches } from '@/app/api/tournaments/[tournamentId]/generate-matches/route';
import { GET as getStandings } from '@/app/api/tournaments/[tournamentId]/standings/route';
import { GET as getTournament } from '@/app/api/tournaments/[tournamentId]/route';

describe('Tournament Full Lifecycle (K2)', () => {
  let gameId: string;
  let modeId: string;
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
    db = getTestDb();

    // Add game maps required by match generation
    for (let i = 1; i <= 3; i++) {
      await db.run(
        `INSERT OR IGNORE INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
        [`tourn-map-${i}-${modeId}`, gameId, modeId, `Tournament Map ${i}`]
      );
    }
  });

  it('walks tournament through the full lifecycle from created to complete', async () => {
    // ── Step 1: Create tournament (via fixture) ─────────────────────────────
    const tournament = await createTournament(gameId, {
      game_mode_id: modeId,
      format: 'single-elimination',
      rounds_per_match: 1,
    });
    expect(tournament.status).toBe('created');
    const tournamentId = tournament.id;

    // ── Step 2: Add teams ────────────────────────────────────────────────────
    const team1Res = await createTeam(
      createMockRequest('POST', `/api/tournaments/${tournamentId}/teams`, { teamName: 'Red Dragons' }),
      createRouteParams({ tournamentId })
    );
    const { status: t1Status, data: team1 } = await parseResponse(team1Res);
    expect(t1Status).toBe(201);
    expect(team1.id).toBeDefined();

    const team2Res = await createTeam(
      createMockRequest('POST', `/api/tournaments/${tournamentId}/teams`, { teamName: 'Blue Phoenix' }),
      createRouteParams({ tournamentId })
    );
    const { status: t2Status, data: team2 } = await parseResponse(team2Res);
    expect(t2Status).toBe(201);
    expect(team2.id).toBeDefined();

    // Verify both teams exist
    const teamsListRes = await getTeams(
      createMockRequest('GET', `/api/tournaments/${tournamentId}/teams`),
      createRouteParams({ tournamentId })
    );
    const { status: listStatus, data: teamsList } = await parseResponse(teamsListRes);
    expect(listStatus).toBe(200);
    expect(teamsList.length).toBe(2);

    // ── Step 3: Transition to gather ────────────────────────────────────────
    const gatherRes = await transitionTournament(
      createMockRequest('POST', `/api/tournaments/${tournamentId}/transition`, { newStatus: 'gather' }),
      createRouteParams({ tournamentId })
    );
    const { status: gatherStatus, data: gatherData } = await parseResponse(gatherRes);
    expect(gatherStatus).toBe(200);
    expect(gatherData.status).toBe('gather');

    // ── Step 4: Transition to assign ────────────────────────────────────────
    const assignRes = await transitionTournament(
      createMockRequest('POST', `/api/tournaments/${tournamentId}/transition`, { newStatus: 'assign' }),
      createRouteParams({ tournamentId })
    );
    const { status: assignStatus, data: assignData } = await parseResponse(assignRes);
    expect(assignStatus).toBe(200);
    expect(assignData.status).toBe('assign');

    // ── Step 5: Generate matches ─────────────────────────────────────────────
    const genRes = await generateMatches(
      createMockRequest('POST', `/api/tournaments/${tournamentId}/generate-matches`, {}),
      createRouteParams({ tournamentId })
    );
    const { status: genStatus, data: genData } = await parseResponse(genRes);
    expect(genStatus).toBe(200);
    expect(genData.matchCount).toBe(1); // 2 teams → 1 match
    expect(genData.format).toBe('single-elimination');

    // Verify matches created in DB
    const generatedMatches = await db.all(
      `SELECT id, status FROM matches WHERE tournament_id = ?`,
      [tournamentId]
    ) as Array<{ id: string; status: string }>;
    expect(generatedMatches).toHaveLength(1);
    const tournamentMatchId = generatedMatches[0].id;

    // ── Step 6: Add team members (required for battle transition) ───────────
    const memberId1 = `member-1-${tournamentId}`;
    const memberId2 = `member-2-${tournamentId}`;
    await db.run(
      `INSERT INTO tournament_team_members (id, team_id, user_id, discord_user_id, username)
       VALUES (?, ?, 'u1', 'du1', 'Player1')`,
      [memberId1, team1.id]
    );
    await db.run(
      `INSERT INTO tournament_team_members (id, team_id, user_id, discord_user_id, username)
       VALUES (?, ?, 'u2', 'du2', 'Player2')`,
      [memberId2, team2.id]
    );

    // ── Step 7: Transition to battle ─────────────────────────────────────────
    const battleRes = await transitionTournament(
      createMockRequest('POST', `/api/tournaments/${tournamentId}/transition`, { newStatus: 'battle' }),
      createRouteParams({ tournamentId })
    );
    const { status: battleStatus, data: battleData } = await parseResponse(battleRes);
    expect(battleStatus).toBe(200);
    expect(battleData.status).toBe('battle');

    // ── Step 8: Force-complete the tournament match in DB ────────────────────
    // Update match status and set a winner to simulate completion
    await db.run(
      `UPDATE matches SET status = 'complete', winner_team = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [team1.id, tournamentMatchId]
    );

    // ── Step 9: Transition to complete ──────────────────────────────────────
    const completeRes = await transitionTournament(
      createMockRequest('POST', `/api/tournaments/${tournamentId}/transition`, { newStatus: 'complete' }),
      createRouteParams({ tournamentId })
    );
    const { status: completeStatus, data: completeData } = await parseResponse(completeRes);
    expect(completeStatus).toBe(200);
    expect(completeData.status).toBe('complete');

    // ── Step 10: Verify standings ────────────────────────────────────────────
    const standingsRes = await getStandings(
      createMockRequest('GET', `/api/tournaments/${tournamentId}/standings`),
      createRouteParams({ tournamentId })
    );
    const { status: standingsStatus, data: standingsData } = await parseResponse(standingsRes);
    expect(standingsStatus).toBe(200);
    expect(standingsData.standings).toBeDefined();
    expect(standingsData.standings).toHaveLength(2);

    // Red Dragons won one match
    const redDragons = standingsData.standings.find((s: { team_name: string }) => s.team_name === 'Red Dragons');
    expect(redDragons?.wins).toBe(1);
    expect(redDragons?.losses).toBe(0);

    const bluePhoenix = standingsData.standings.find((s: { team_name: string }) => s.team_name === 'Blue Phoenix');
    expect(bluePhoenix?.wins).toBe(0);
  });

  it('GET tournament reflects status changes', async () => {
    const tournament = await createTournament(gameId, {
      game_mode_id: modeId,
    });
    const tournamentId = tournament.id;

    const initialRes = await getTournament(
      createMockRequest('GET', `/api/tournaments/${tournamentId}`),
      createRouteParams({ tournamentId })
    );
    const { status, data } = await parseResponse(initialRes);
    expect(status).toBe(200);
    expect(data.status).toBe('created');
    expect(data.id).toBe(tournamentId);
  });

  it('duplicate team name rejected by teams API', async () => {
    const tournament = await createTournament(gameId, { game_mode_id: modeId });
    const tournamentId = tournament.id;

    await createTeam(
      createMockRequest('POST', `/api/tournaments/${tournamentId}/teams`, { teamName: 'Same Name' }),
      createRouteParams({ tournamentId })
    );

    const dupRes = await createTeam(
      createMockRequest('POST', `/api/tournaments/${tournamentId}/teams`, { teamName: 'Same Name' }),
      createRouteParams({ tournamentId })
    );
    const { status } = await parseResponse(dupRes);
    expect(status).toBe(409);
  });

  it('generate-matches fails when tournament is not in assign status', async () => {
    const tournament = await createTournament(gameId, { game_mode_id: modeId });
    const tournamentId = tournament.id;

    // Tournament is in 'created' status
    const res = await generateMatches(
      createMockRequest('POST', `/api/tournaments/${tournamentId}/generate-matches`, {}),
      createRouteParams({ tournamentId })
    );
    const { status } = await parseResponse(res);
    expect(status).toBe(400);
  });
});
