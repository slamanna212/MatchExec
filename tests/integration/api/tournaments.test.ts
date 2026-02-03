import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { GET, POST } from '@/app/api/tournaments/route';
import { GET as getTournament, DELETE as deleteTournament } from '@/app/api/tournaments/[tournamentId]/route';

describe('Tournaments API', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  describe('GET /api/tournaments', () => {
    it('should return empty array when no tournaments exist', async () => {
      const request = createMockRequest('GET', '/api/tournaments');
      const response = await GET(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('should return all non-complete tournaments by default', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES
           ('t1', 'Tournament 1', ?, 'created', 'single-elimination', 1, 'casual'),
           ('t2', 'Tournament 2', ?, 'gather', 'single-elimination', 1, 'casual'),
           ('t3', 'Tournament 3', ?, 'complete', 'single-elimination', 1, 'casual')`,
          [game.id, game.id, game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/tournaments');
      const response = await GET(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveLength(2);
      expect(data.map((t: any) => t.status)).not.toContain('complete');
    });
  });

  describe('POST /api/tournaments', () => {
    it('should create tournament with valid data', async () => {
      const request = createMockRequest('POST', '/api/tournaments', {
        name: 'Test Tournament',
        gameId: game.id,
        gameModeId: mode.id,
        format: 'single-elimination',
        roundsPerMatch: 3,
      });

      const response = await POST(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.name).toBe('Test Tournament');
      expect(data.format).toBe('single-elimination');
    });

    it('should reject missing required fields', async () => {
      const request = createMockRequest('POST', '/api/tournaments', {
        name: 'Test Tournament',
        // missing gameId, gameModeId, format, roundsPerMatch
      });

      const response = await POST(request);
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });

    it('should reject invalid format', async () => {
      const request = createMockRequest('POST', '/api/tournaments', {
        name: 'Test Tournament',
        gameId: game.id,
        gameModeId: mode.id,
        format: 'invalid-format',
        roundsPerMatch: 3,
      });

      const response = await POST(request);
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });
  });

  describe('GET /api/tournaments/[tournamentId]', () => {
    it('should return tournament details', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t1', 'Test Tournament', ?, 'created', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/tournaments/t1');
      const response = await getTournament(request, createRouteParams({ tournamentId: 't1' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.id).toBe('t1');
      expect(data.name).toBe('Test Tournament');
    });

    it('should return 404 for non-existent tournament', async () => {
      const request = createMockRequest('GET', '/api/tournaments/nonexistent');
      const response = await getTournament(request, createRouteParams({ tournamentId: 'nonexistent' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });

  describe('DELETE /api/tournaments/[tournamentId]', () => {
    it('should delete existing tournament', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t1', 'Test Tournament', ?, 'created', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('DELETE', '/api/tournaments/t1');
      const response = await deleteTournament(request, createRouteParams({ tournamentId: 't1' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(200);

      // Verify deletion
      const deleted = await new Promise<any>((resolve, reject) => {
        db.get('SELECT * FROM tournaments WHERE id = ?', ['t1'], (err, row) =>
          err ? reject(err) : resolve(row)
        );
      });

      expect(deleted).toBeUndefined();
    });

    it('should return 404 for non-existent tournament', async () => {
      const request = createMockRequest('DELETE', '/api/tournaments/nonexistent');
      const response = await deleteTournament(request, createRouteParams({ tournamentId: 'nonexistent' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });
});
