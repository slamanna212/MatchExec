import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as submitResult, GET as getResult } from '@/app/api/matches/[matchId]/games/[gameId]/result/route';
import { GET as getMatchGames } from '@/app/api/matches/[matchId]/games/route';

describe('Match Results API', () => {
  let game: any;
  let _mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    _mode = data.mode;
  });

  describe('GET /api/matches/[matchId]/games', () => {
    it('should return match games', async () => {
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

      // Create match_games
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO match_games (id, match_id, round, status)
           VALUES
           ('game-1', 'match-1', 1, 'pending'),
           ('game-2', 'match-1', 2, 'pending'),
           ('game-3', 'match-1', 3, 'pending')`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/matches/match-1/games');
      const response = await getMatchGames(request, createRouteParams({ matchId: 'match-1' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.games).toHaveLength(3);
      expect(data.games[0].round).toBe(1);
    });
  });

  describe('POST /api/matches/[matchId]/games/[gameId]/result', () => {
    it('should submit valid match result', async () => {
      const db = getTestDb();

      // Create a match and game
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'battle', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO match_games (id, match_id, round, status)
           VALUES ('game-1', 'match-1', 1, 'pending')`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      const matchResult = {
        matchId: 'match-1',
        gameId: 'game-1',
        winner: 'team1',
        completedAt: new Date().toISOString(),
      };

      const request = createMockRequest('POST', '/api/matches/match-1/games/game-1/result', matchResult);
      const response = await submitResult(
        request,
        createRouteParams({ matchId: 'match-1', gameId: 'game-1' })
      );
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should reject invalid winner value', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'battle', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO match_games (id, match_id, round, status)
           VALUES ('game-1', 'match-1', 1, 'pending')`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      const matchResult = {
        matchId: 'match-1',
        gameId: 'game-1',
        winner: 'invalid',
        completedAt: new Date().toISOString(),
      };

      const request = createMockRequest('POST', '/api/matches/match-1/games/game-1/result', matchResult);
      const response = await submitResult(
        request,
        createRouteParams({ matchId: 'match-1', gameId: 'game-1' })
      );
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });

    it('should reject gameId mismatch', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'battle', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO match_games (id, match_id, round, status)
           VALUES ('game-1', 'match-1', 1, 'pending')`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      const matchResult = {
        matchId: 'match-1',
        gameId: 'wrong-game-id',
        winner: 'team1',
        completedAt: new Date().toISOString(),
      };

      const request = createMockRequest('POST', '/api/matches/match-1/games/game-1/result', matchResult);
      const response = await submitResult(
        request,
        createRouteParams({ matchId: 'match-1', gameId: 'game-1' })
      );
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });

    it('should reject matchId mismatch', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'battle', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO match_games (id, match_id, round, status)
           VALUES ('game-1', 'match-1', 1, 'pending')`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      const matchResult = {
        matchId: 'wrong-match-id',
        gameId: 'game-1',
        winner: 'team1',
        completedAt: new Date().toISOString(),
      };

      const request = createMockRequest('POST', '/api/matches/match-1/games/game-1/result', matchResult);
      const response = await submitResult(
        request,
        createRouteParams({ matchId: 'match-1', gameId: 'game-1' })
      );
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });
  });

  describe('GET /api/matches/[matchId]/games/[gameId]/result', () => {
    it('should return result after successful submission', async () => {
      const db = getTestDb();

      // Create a match and game
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-get', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'battle', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO match_games (id, match_id, round, status)
           VALUES ('game-get', 'match-get', 1, 'pending')`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      // Submit a result
      const matchResult = {
        matchId: 'match-get',
        gameId: 'game-get',
        winner: 'team1',
        completedAt: new Date().toISOString(),
      };

      const postRequest = createMockRequest('POST', '/api/matches/match-get/games/game-get/result', matchResult);
      const postResponse = await submitResult(
        postRequest,
        createRouteParams({ matchId: 'match-get', gameId: 'game-get' })
      );
      const { status: postStatus } = await parseResponse(postResponse);
      expect(postStatus).toBe(200);

      // Now GET the result and verify it matches what was submitted
      const getRequest = createMockRequest('GET', '/api/matches/match-get/games/game-get/result');
      const getResponse = await getResult(
        getRequest,
        createRouteParams({ matchId: 'match-get', gameId: 'game-get' })
      );
      const { status: getStatus, data: getData } = await parseResponse(getResponse);

      expect(getStatus).toBe(200);
      expect(getData).toBeDefined();
      expect(getData.winner).toBe('team1');
    });

    it('should return 404 when no result exists', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO matches (id, name, game_id, guild_id, channel_id, start_date, start_time, status, max_participants, match_format)
           VALUES ('match-1', 'Test Match', ?, 'guild', 'channel', datetime('now'), datetime('now'), 'battle', 10, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO match_games (id, match_id, round, status)
           VALUES ('game-1', 'match-1', 1, 'pending')`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/matches/match-1/games/game-1/result');
      const response = await getResult(
        request,
        createRouteParams({ matchId: 'match-1', gameId: 'game-1' })
      );
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });
});
