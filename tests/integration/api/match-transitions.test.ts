import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as transitionMatch } from '@/app/api/matches/[matchId]/transition/route';

describe('Match Transitions API', () => {
  let game: any;
  let _mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    _mode = data.mode;
  });

  describe('POST /api/matches/[matchId]/transition', () => {
    it('should transition match to new status', async () => {
      const db = getTestDb();

      // Create match in created status
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'created', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('POST', `/api/matches/match-1/transition`, {
        newStatus: 'gather',
      });

      const response = await transitionMatch(request, createRouteParams({ matchId: 'match-1' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.status).toBe('gather');
    });

    it('should reject invalid status', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'created', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('POST', `/api/matches/match-1/transition`, {
        newStatus: 'invalid-status',
      });

      const response = await transitionMatch(request, createRouteParams({ matchId: 'match-1' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });

    it('should reject backwards transition', async () => {
      const db = getTestDb();

      // Create match in battle status
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'battle', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      // Try to go back to gather
      const request = createMockRequest('POST', `/api/matches/match-1/transition`, {
        newStatus: 'gather',
      });

      const response = await transitionMatch(request, createRouteParams({ matchId: 'match-1' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });

    it('should allow transition to cancelled from any status', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'battle', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('POST', `/api/matches/match-1/transition`, {
        newStatus: 'cancelled',
      });

      const response = await transitionMatch(request, createRouteParams({ matchId: 'match-1' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.status).toBe('cancelled');
    });

    it('should return 404 for non-existent match', async () => {
      const request = createMockRequest('POST', `/api/matches/nonexistent/transition`, {
        newStatus: 'gather',
      });

      const response = await transitionMatch(request, createRouteParams({ matchId: 'nonexistent' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });
});
