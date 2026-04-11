import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createTournament } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST } from '@/app/api/tournaments/[tournamentId]/generate-matches/route';

describe('Tournament Generate Matches API', () => {
  let db: any;
  let game: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    db = getTestDb();
  });

  describe('POST /api/tournaments/[tournamentId]/generate-matches', () => {
    it('returns 404 for non-existent tournament', async () => {
      const request = createMockRequest('POST', '/api/tournaments/nonexistent/generate-matches', {});
      const response = await POST(request, createRouteParams({ tournamentId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns 400 when tournament is not in assign phase', async () => {
      const tournament = await createTournament(game.id);
      // Tournament is in 'created' status by default

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/generate-matches`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when tournament is in battle phase', async () => {
      const tournament = await createTournament(game.id);
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['battle', tournament.id]);

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/generate-matches`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when fewer than 2 teams are in the bracket', async () => {
      const tournament = await createTournament(game.id);
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

  });
});
