import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { GET } from '@/app/api/matches/[matchId]/participants/route';

describe('Match Participants API', () => {
  let game: any;
  let _mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    _mode = data.mode;
  });

  describe('GET /api/matches/[matchId]/participants', () => {
    it('should return empty array when no participants', async () => {
      const db = getTestDb();

      // Create a match
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'created', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/matches/match-1/participants');
      const response = await GET(request, createRouteParams({ matchId: 'match-1' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.participants).toEqual([]);
    });

    it('should return all participants for a match', async () => {
      const db = getTestDb();

      // Create a match
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'created', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      // Add participants
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, joined_at)
           VALUES
           ('p1', 'match-1', 'user-1', 'user-1', 'Player 1', datetime('now')),
           ('p2', 'match-1', 'user-2', 'user-2', 'Player 2', datetime('now'))`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/matches/match-1/participants');
      const response = await GET(request, createRouteParams({ matchId: 'match-1' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.participants).toHaveLength(2);
      expect(data.participants[0].discord_user_id).toBe('user-1');
      expect(data.participants[1].discord_user_id).toBe('user-2');
    });

    it('should return 404 for non-existent match', async () => {
      const request = createMockRequest('GET', '/api/matches/nonexistent/participants');
      const response = await GET(request, createRouteParams({ matchId: 'nonexistent' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });

    it('should include signup data when present', async () => {
      const db = getTestDb();

      // Create a match
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'created', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      // Add participant with signup data
      const signupData = JSON.stringify({ role: 'Tank', rank: 'Gold' });
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, signup_data, joined_at)
           VALUES ('p1', 'match-1', 'user-1', 'user-1', 'Player 1', ?, datetime('now'))`,
          [signupData],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/matches/match-1/participants');
      const response = await GET(request, createRouteParams({ matchId: 'match-1' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.participants[0].signup_data).toEqual({ role: 'Tank', rank: 'Gold' });
    });
  });
});
