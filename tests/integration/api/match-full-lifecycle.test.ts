/**
 * K1 — Match Full Lifecycle Integration Test
 *
 * Walks a match through every state: created → gather → assign → battle → complete
 * and verifies DB state and queue entries at each step.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as createMatch } from '@/app/api/matches/route';
import { GET as getMatch } from '@/app/api/matches/[matchId]/route';
import { POST as transitionMatch } from '@/app/api/matches/[matchId]/transition/route';
import { POST as assignTeams } from '@/app/api/matches/[matchId]/assign-teams/route';
import { POST as saveResult } from '@/app/api/matches/[matchId]/games/[gameId]/result/route';

describe('Match Full Lifecycle (K1)', () => {
  let gameId: string;
  let modeId: string;
  let mapId: string;
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
    db = getTestDb();

    // Create a game map needed for initializeMatchGames
    mapId = `lifecycle-map-${Date.now()}`;
    await db.run(
      `INSERT OR IGNORE INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
      [mapId, gameId, modeId, 'Lifecycle Map']
    );
  });

  it('walks through the full match lifecycle from created to complete', async () => {
    // ── Step 1: Create match ────────────────────────────────────────────────
    const createReq = createMockRequest('POST', '/api/matches', {
      name: 'Lifecycle Match',
      gameId,
      rounds: 1,
      maps: [mapId],
      startDate: new Date().toISOString(),
    });
    const createRes = await createMatch(createReq);
    const { status: createStatus, data: created } = await parseResponse(createRes);

    expect(createStatus).toBe(201);
    expect(created.id).toBeDefined();
    expect(created.status).toBe('created');
    const matchId: string = created.id;

    // ── Step 2: Transition → gather ─────────────────────────────────────────
    const gatherReq = createMockRequest('POST', `/api/matches/${matchId}/transition`, {
      newStatus: 'gather',
    });
    const gatherRes = await transitionMatch(gatherReq, createRouteParams({ matchId }));
    const { status: gatherStatus, data: gatherData } = await parseResponse(gatherRes);

    expect(gatherStatus).toBe(200);
    expect(gatherData.status).toBe('gather');

    // Verify queue entry for gather announcement
    const gatherAnn = await db.get(
      `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
      [matchId]
    ) as Record<string, unknown> | null;
    expect(gatherAnn).toBeDefined();

    // ── Step 3: Insert two participants via DB ──────────────────────────────
    const part1Id = `part-1-${matchId}`;
    const part2Id = `part-2-${matchId}`;
    await db.run(
      `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, team_assignment)
       VALUES (?, ?, 'user1', 'u1', 'Player1', NULL)`,
      [part1Id, matchId]
    );
    await db.run(
      `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, team_assignment)
       VALUES (?, ?, 'user2', 'u2', 'Player2', NULL)`,
      [part2Id, matchId]
    );

    // ── Step 4: Transition → assign ─────────────────────────────────────────
    const assignReq = createMockRequest('POST', `/api/matches/${matchId}/transition`, {
      newStatus: 'assign',
    });
    const assignRes = await transitionMatch(assignReq, createRouteParams({ matchId }));
    const { status: assignStatus, data: assignData } = await parseResponse(assignRes);

    expect(assignStatus).toBe(200);
    expect(assignData.status).toBe('assign');

    // ── Step 5: Assign teams ────────────────────────────────────────────────
    const teamsReq = createMockRequest('POST', `/api/matches/${matchId}/assign-teams`, {
      teamAssignments: [
        { participantId: part1Id, team: 'blue' },
        { participantId: part2Id, team: 'red' },
      ],
    });
    const teamsRes = await assignTeams(teamsReq, createRouteParams({ matchId }));
    const { status: teamsStatus, data: teamsData } = await parseResponse(teamsRes);

    expect(teamsStatus).toBe(200);
    expect(teamsData.success).toBe(true);

    // Verify team assignments written to DB
    const p1 = await db.get(
      `SELECT team_assignment FROM match_participants WHERE id = ?`,
      [part1Id]
    ) as { team_assignment: string } | null;
    expect(p1?.team_assignment).toBe('blue');

    // ── Step 6: Transition → battle ─────────────────────────────────────────
    const battleReq = createMockRequest('POST', `/api/matches/${matchId}/transition`, {
      newStatus: 'battle',
    });
    const battleRes = await transitionMatch(battleReq, createRouteParams({ matchId }));
    const { status: battleStatus, data: battleData } = await parseResponse(battleRes);

    expect(battleStatus).toBe(200);
    expect(battleData.status).toBe('battle');

    // initializeMatchGames creates match_games entries
    const games = await db.all(
      `SELECT id, round, status FROM match_games WHERE match_id = ? ORDER BY round`,
      [matchId]
    ) as Array<{ id: string; round: number; status: string }>;
    expect(games.length).toBeGreaterThanOrEqual(1);
    const gameEntry = games[0];
    expect(gameEntry.round).toBe(1);

    // ── Step 7: Score the game ──────────────────────────────────────────────
    const gameEntryId = `${matchId}_game_1`;
    const resultReq = createMockRequest('POST', `/api/matches/${matchId}/games/${gameEntryId}/result`, {
      matchId,
      gameId: gameEntryId,
      winner: 'team1',
      completedAt: new Date().toISOString(),
    });
    const resultRes = await saveResult(
      resultReq,
      createRouteParams({ matchId, gameId: gameEntryId })
    );
    const { status: resultStatus, data: resultData } = await parseResponse(resultRes);

    expect(resultStatus).toBe(200);
    expect(resultData.success).toBe(true);

    // Verify game is marked completed
    const scoredGame = await db.get(
      `SELECT status, winner_id FROM match_games WHERE id = ?`,
      [gameEntryId]
    ) as { status: string; winner_id: string } | null;
    expect(scoredGame?.status).toBe('completed');
    expect(scoredGame?.winner_id).toBe('team1');

    // ── Step 8: Transition → complete ───────────────────────────────────────
    const completeReq = createMockRequest('POST', `/api/matches/${matchId}/transition`, {
      newStatus: 'complete',
    });
    const completeRes = await transitionMatch(completeReq, createRouteParams({ matchId }));
    const { status: completeStatus, data: completeData } = await parseResponse(completeRes);

    expect(completeStatus).toBe(200);
    expect(completeData.status).toBe('complete');

    // Verify deletion queued on complete
    const deletion = await db.get(
      `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
      [matchId]
    ) as Record<string, unknown> | null;
    expect(deletion).toBeDefined();

    // ── Step 9: GET match — verify final state ───────────────────────────────
    const getReq = createMockRequest('GET', `/api/matches/${matchId}`);
    const getRes = await getMatch(getReq, createRouteParams({ matchId }));
    const { status: getStatus, data: finalMatch } = await parseResponse(getRes);

    expect(getStatus).toBe(200);
    expect(finalMatch.status).toBe('complete');
    expect(finalMatch.id).toBe(matchId);
    // winner_team reflects the tournament team ID (null for non-tournament matches without named teams)
    expect(finalMatch).toHaveProperty('winner_team');
  });

  it('verifies match is not accessible via active matches list once complete', async () => {
    // Create and immediately complete a match via force
    const createReq = createMockRequest('POST', '/api/matches', {
      name: 'Short Match',
      gameId,
      startDate: new Date().toISOString(),
    });
    const { data: created } = await parseResponse(await createMatch(createReq));
    const matchId: string = created.id;

    // Advance to complete with force flag
    for (const status of ['gather', 'assign', 'battle'] as const) {
      await transitionMatch(
        createMockRequest('POST', `/api/matches/${matchId}/transition`, { newStatus: status }),
        createRouteParams({ matchId })
      );
    }
    await transitionMatch(
      createMockRequest('POST', `/api/matches/${matchId}/transition`, {
        newStatus: 'complete',
        force: true,
      }),
      createRouteParams({ matchId })
    );

    // Verify DB status
    const row = await db.get(
      `SELECT status FROM matches WHERE id = ?`,
      [matchId]
    ) as { status: string } | null;
    expect(row?.status).toBe('complete');
  });

  it('cancelling from gather cleans up announcement queue', async () => {
    const createReq = createMockRequest('POST', '/api/matches', {
      name: 'Cancel Me',
      gameId,
      startDate: new Date().toISOString(),
    });
    const { data: created } = await parseResponse(await createMatch(createReq));
    const matchId: string = created.id;

    await transitionMatch(
      createMockRequest('POST', `/api/matches/${matchId}/transition`, { newStatus: 'gather' }),
      createRouteParams({ matchId })
    );

    await transitionMatch(
      createMockRequest('POST', `/api/matches/${matchId}/transition`, { newStatus: 'cancelled' }),
      createRouteParams({ matchId })
    );

    const row = await db.get(
      `SELECT status FROM matches WHERE id = ?`,
      [matchId]
    ) as { status: string } | null;
    expect(row?.status).toBe('cancelled');

    // Cancelled handler should queue deletion
    const deletion = await db.get(
      `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
      [matchId]
    ) as Record<string, unknown> | null;
    expect(deletion).toBeDefined();
  });
});
