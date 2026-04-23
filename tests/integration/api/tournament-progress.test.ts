import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createTournament } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST } from '@/app/api/tournaments/[tournamentId]/progress/route';
import { POST as generateMatches } from '@/app/api/tournaments/[tournamentId]/generate-matches/route';

describe('Tournament Progress API', () => {
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

  describe('POST /api/tournaments/[tournamentId]/progress', () => {
    it('returns 404 for non-existent tournament', async () => {
      const request = createMockRequest('POST', '/api/tournaments/nonexistent/progress', {});
      const response = await POST(request, createRouteParams({ tournamentId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns 400 when tournament is not in battle phase', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/progress`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 for tournament in created status', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['created', tournament.id]);

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/progress`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 for tournament in completed status', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['complete', tournament.id]);

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/progress`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('completes a single-elimination tournament when final match is done', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['assign', tournament.id]);

      // Create 2 teams
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name, created_at) VALUES ('t1', ?, 'Team Alpha', CURRENT_TIMESTAMP)`,
        [tournament.id]
      );
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name, created_at) VALUES ('t2', ?, 'Team Bravo', CURRENT_TIMESTAMP)`,
        [tournament.id]
      );

      // Generate bracket matches
      const genReq = createMockRequest('POST', `/api/tournaments/${tournament.id}/generate-matches`, {});
      const genRes = await generateMatches(genReq, createRouteParams({ tournamentId: tournament.id }));
      const { status: genStatus } = await parseResponse(genRes);
      expect(genStatus).toBe(200);

      // Set tournament to battle phase
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['battle', tournament.id]);

      // Complete the generated match with a winner
      const matches = await db.all('SELECT m.id FROM matches m JOIN tournament_matches tm ON m.id = tm.match_id WHERE tm.tournament_id = ?', [tournament.id]);
      expect(matches.length).toBe(1);

      await db.run('UPDATE matches SET status = ?, winner_team = ? WHERE id = ?', ['complete', 't1', matches[0].id]);

      // Progress the tournament
      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/progress`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.message).toContain('completed');
      expect(data.winner).toBe('t1');

      // Verify tournament status in DB
      const updatedTournament = await db.get('SELECT status FROM tournaments WHERE id = ?', [tournament.id]);
      expect(updatedTournament.status).toBe('complete');
    });
  });
});
