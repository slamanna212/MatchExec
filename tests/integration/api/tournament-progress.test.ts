import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createTournament } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST } from '@/app/api/tournaments/[tournamentId]/progress/route';

describe('Tournament Progress API', () => {
  let db: any;
  let game: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    db = getTestDb();
  });

  describe('POST /api/tournaments/[tournamentId]/progress', () => {
    it('returns 404 for non-existent tournament', async () => {
      const request = createMockRequest('POST', '/api/tournaments/nonexistent/progress', {});
      const response = await POST(request, createRouteParams({ tournamentId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns 400 when tournament is not in battle phase', async () => {
      const tournament = await createTournament(game.id);

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/progress`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 for tournament in created status', async () => {
      const tournament = await createTournament(game.id);
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['created', tournament.id]);

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/progress`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 for tournament in completed status', async () => {
      const tournament = await createTournament(game.id);
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', ['complete', tournament.id]);

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/progress`, {});
      const response = await POST(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });
  });
});
