import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createTournament } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST } from '@/app/api/tournaments/[tournamentId]/generate-matches/route';

describe('Tournament Generate Matches API', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();

    // Bracket generation requires game maps to exist for the mode
    await db.run(
      `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
      [`map_${Date.now()}_1`, game.id, mode.id, 'Test Map 1']
    );
    await db.run(
      `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
      [`map_${Date.now()}_2`, game.id, mode.id, 'Test Map 2']
    );
    await db.run(
      `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
      [`map_${Date.now()}_3`, game.id, mode.id, 'Test Map 3']
    );
  });

  describe('POST /api/tournaments/[tournamentId]/generate-matches', () => {
    it('returns 404 for non-existent tournament', async () => {
      const request = createMockRequest('POST', '/api/tournaments/nonexistent/generate-matches', {});
      const response = await POST(request, createRouteParams({ tournamentId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns 400 when tournament is not in assign phase', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      // Tournament is in 'created' status by default

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/generate-matches`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when tournament is in battle phase', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['battle', tournament.id]);

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/generate-matches`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when fewer than 2 teams are in the bracket', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['assign', tournament.id]);

      // Only 1 team
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name, created_at) VALUES ('t1', ?, 'Team 1', CURRENT_TIMESTAMP)`,
        [tournament.id]
      );

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/generate-matches`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('generates bracket matches for tournament in assign phase with 2+ teams', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['assign', tournament.id]);

      // Insert 2 teams
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name, created_at) VALUES ('t1', ?, 'Team Alpha', CURRENT_TIMESTAMP)`,
        [tournament.id]
      );
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name, created_at) VALUES ('t2', ?, 'Team Bravo', CURRENT_TIMESTAMP)`,
        [tournament.id]
      );

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/generate-matches`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.matchCount).toBeGreaterThanOrEqual(1);
      expect(data.format).toBe('single-elimination');
      expect(data.tournamentId).toBe(tournament.id);

      // Verify matches were actually created in the database
      const matches = await db.all('SELECT * FROM matches WHERE tournament_id = ?', [tournament.id]);
      expect(matches.length).toBe(data.matchCount);

      // Verify tournament_matches junction rows were created
      const tmRows = await db.all('SELECT * FROM tournament_matches WHERE tournament_id = ?', [tournament.id]);
      expect(tmRows.length).toBe(data.matchCount);
    });

    it('returns 400 when matches have already been generated', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['assign', tournament.id]);

      // Insert 2 teams
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name, created_at) VALUES ('t1', ?, 'Team A', CURRENT_TIMESTAMP)`,
        [tournament.id]
      );
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name, created_at) VALUES ('t2', ?, 'Team B', CURRENT_TIMESTAMP)`,
        [tournament.id]
      );

      // Generate matches first time
      const request1 = createMockRequest('POST', `/api/tournaments/${tournament.id}/generate-matches`, {});
      const response1 = await POST(request1, createRouteParams({ tournamentId: tournament.id }));
      const { status: status1 } = await parseResponse(response1);
      expect(status1).toBe(200);

      // Try generating again — should fail
      const request2 = createMockRequest('POST', `/api/tournaments/${tournament.id}/generate-matches`, {});
      const response2 = await POST(request2, createRouteParams({ tournamentId: tournament.id }));
      const { status: status2 } = await parseResponse(response2);
      expect(status2).toBe(400);
    });

  });
});
