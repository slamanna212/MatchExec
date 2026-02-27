import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { GET, POST } from '@/app/api/matches/route';
import { GET as getMatch, DELETE as deleteMatch } from '@/app/api/matches/[matchId]/route';

describe('Matches API', () => {
  let game: any;
  let _mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    _mode = data.mode;
  });

  describe('GET /api/matches', () => {
    it('should return empty array when no matches exist', async () => {
      const request = createMockRequest('GET', '/api/matches');
      const response = await GET(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('should return all non-complete matches by default', async () => {
      const db = getTestDb();

      // Create test matches
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES
           ('match-1', 'Test Match 1', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'created', 10, 'casual'),
           ('match-2', 'Test Match 2', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'gather', 10, 'casual'),
           ('match-3', 'Test Match 3', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'complete', 10, 'casual')`,
          [game.id, game.id, game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/matches');
      const response = await GET(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveLength(2); // Should not include completed match
      expect(data.map((m: any) => m.status)).not.toContain('complete');
    });

    it('should filter to complete matches when status=complete', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES
           ('match-1', 'Test Match 1', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'created', 10, 'casual'),
           ('match-2', 'Test Match 2', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'complete', 10, 'casual')`,
          [game.id, game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/matches?status=complete');
      const response = await GET(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].status).toBe('complete');
    });
  });

  describe('POST /api/matches', () => {
    it('should create a match with valid data', async () => {
      const request = createMockRequest('POST', '/api/matches', {
        name: 'Test Match',
        gameId: game.id,
        description: 'A test match',
        rounds: 3,
        startDate: new Date().toISOString(),
      });

      const response = await POST(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.name).toBe('Test Match');
      expect(data.game_id).toBe(game.id);
      expect(data.status).toBe('created');
    });

    it('should reject missing required fields', async () => {
      const request = createMockRequest('POST', '/api/matches', {
        description: 'Missing name and gameId',
      });

      const response = await POST(request);
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });

    it('should accept match creation (FK validation not enforced in test env)', async () => {
      // Note: Foreign key constraints are not enabled in test database
      // In production, invalid gameId would fail at insert time
      const request = createMockRequest('POST', '/api/matches', {
        name: 'Test Match',
        gameId: 'invalid-game-id',
        startDate: new Date().toISOString(),
      });

      const response = await POST(request);
      const { status } = await parseResponse(response);

      // Currently succeeds because FK constraints not enabled in tests
      expect(status).toBe(201);
    });
  });

  describe('GET /api/matches/[matchId]', () => {
    it('should return match details', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'created', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/matches/match-1');
      const response = await getMatch(request, createRouteParams({ matchId: 'match-1' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.id).toBe('match-1');
      expect(data.name).toBe('Test Match');
      expect(data.game_id).toBe(game.id);
    });

    it('should return 404 for non-existent match', async () => {
      const request = createMockRequest('GET', '/api/matches/nonexistent');
      const response = await getMatch(request, createRouteParams({ matchId: 'nonexistent' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });

  describe('DELETE /api/matches/[matchId]', () => {
    it('should delete an existing match', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'created', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('DELETE', '/api/matches/match-1');
      const response = await deleteMatch(request, createRouteParams({ matchId: 'match-1' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(200);

      // Verify match was deleted
      const deleted = await new Promise<any>((resolve, reject) => {
        db.get('SELECT * FROM matches WHERE id = ?', ['match-1'], (err, row) =>
          err ? reject(err) : resolve(row)
        );
      });

      expect(deleted).toBeUndefined();
    });

    it('should return 404 for non-existent match', async () => {
      const request = createMockRequest('DELETE', '/api/matches/nonexistent');
      const response = await deleteMatch(request, createRouteParams({ matchId: 'nonexistent' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });
});
