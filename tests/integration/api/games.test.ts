import { describe, it, expect } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { createGame, createGameMode } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { GET as getGames } from '@/app/api/games/route';
import { GET as getGame } from '@/app/api/games/[gameId]/route';
import { GET as getGameModes } from '@/app/api/games/[gameId]/modes/route';
import { GET as getGameMaps } from '@/app/api/games/[gameId]/modes/[modeId]/maps/route';

describe('Games API', () => {
  describe('GET /api/games', () => {
    it('should return empty array when no games exist', async () => {
      const response = await getGames();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should return all games', async () => {
      const game1 = await createGame({ name: 'Game 1' });
      const game2 = await createGame({ name: 'Game 2' });

      const response = await getGames();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveLength(2);
      const gameIds = data.map((g: any) => g.id);
      expect(gameIds).toContain(game1.id);
      expect(gameIds).toContain(game2.id);
    });

    it('should include game metadata', async () => {
      await createGame({
        name: 'Test Game',
        icon_url: '/logo.png',
      });

      const response = await getGames();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data[0].name).toBe('Test Game');
      expect(data[0].iconUrl).toBe('/logo.png');
    });
  });

  describe('GET /api/games/[gameId]', () => {
    it('should return game details', async () => {
      const game = await createGame({ name: 'Overwatch 2' });

      const request = createMockRequest('GET', `/api/games/${game.id}`);
      const response = await getGame(request, createRouteParams({ gameId: String(game.id) }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.id).toBe(game.id);
      expect(data.name).toBe('Overwatch 2');
    });

    it('should return 404 for non-existent game', async () => {
      const request = createMockRequest('GET', '/api/games/99999');
      const response = await getGame(request, createRouteParams({ gameId: '99999' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });

  describe('GET /api/games/[gameId]/modes', () => {
    it('should return empty array when game has no modes', async () => {
      const game = await createGame();

      const request = createMockRequest('GET', `/api/games/${game.id}/modes`);
      const response = await getGameModes(request, createRouteParams({ gameId: String(game.id) }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should return all modes for a game', async () => {
      const game = await createGame();
      await createGameMode(game.id, { name: 'Control' });
      await createGameMode(game.id, { name: 'Push' });
      await createGameMode(game.id, { name: 'Escort' });

      const request = createMockRequest('GET', `/api/games/${game.id}/modes`);
      const response = await getGameModes(request, createRouteParams({ gameId: String(game.id) }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveLength(3);
      expect(data.map((m: any) => m.name)).toContain('Control');
      expect(data.map((m: any) => m.name)).toContain('Push');
      expect(data.map((m: any) => m.name)).toContain('Escort');
    });

    it('should return empty array for non-existent game', async () => {
      const request = createMockRequest('GET', '/api/games/99999/modes');
      const response = await getGameModes(request, createRouteParams({ gameId: '99999' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toEqual([]);
    });
  });

  describe('GET /api/games/[gameId]/modes/[modeId]/maps', () => {
    it('should return empty array when mode has no maps', async () => {
      const game = await createGame();
      const mode = await createGameMode(game.id);

      const request = createMockRequest('GET', `/api/games/${game.id}/modes/${(mode as any).id}/maps`);
      const response = await getGameMaps(
        request,
        createRouteParams({ gameId: String(game.id), modeId: String((mode as any).id) })
      );
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should return all maps for a game mode', async () => {
      const game = await createGame();
      const mode = await createGameMode(game.id);
      const db = getTestDb();

      // Add maps
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          db.run(
            'INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)',
            ['nepal', game.id, (mode as any).id, 'Nepal'],
            (err) => (err ? reject(err) : resolve())
          );
        }),
        new Promise<void>((resolve, reject) => {
          db.run(
            'INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)',
            ['lijiang-tower', game.id, (mode as any).id, 'Lijiang Tower'],
            (err) => (err ? reject(err) : resolve())
          );
        }),
      ]);

      const request = createMockRequest('GET', `/api/games/${game.id}/modes/${(mode as any).id}/maps`);
      const response = await getGameMaps(
        request,
        createRouteParams({ gameId: String(game.id), modeId: String((mode as any).id) })
      );
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveLength(2);
      expect(data.map((m: any) => m.name)).toContain('Nepal');
      expect(data.map((m: any) => m.name)).toContain('Lijiang Tower');
    });

    it('should include map metadata', async () => {
      const game = await createGame();
      const mode = await createGameMode(game.id);
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO game_maps (id, game_id, mode_id, name, image_url) VALUES (?, ?, ?, ?, ?)',
          ['nepal', game.id, (mode as any).id, 'Nepal', '/images/nepal.jpg'],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', `/api/games/${game.id}/modes/${(mode as any).id}/maps`);
      const response = await getGameMaps(
        request,
        createRouteParams({ gameId: String(game.id), modeId: String((mode as any).id) })
      );
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data[0].imageUrl).toBe('/images/nepal.jpg');
    });

    it('should return empty array for non-existent game', async () => {
      const request = createMockRequest('GET', '/api/games/99999/modes/1/maps');
      const response = await getGameMaps(request, createRouteParams({ gameId: '99999', modeId: '1' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should return empty array for non-existent mode', async () => {
      const game = await createGame();

      const request = createMockRequest('GET', `/api/games/${game.id}/modes/99999/maps`);
      const response = await getGameMaps(request, createRouteParams({ gameId: String(game.id), modeId: '99999' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toEqual([]);
    });
  });

  describe('Game data integrity', () => {
    it('should maintain foreign key relationships', async () => {
      const game = await createGame();
      const mode = await createGameMode(game.id);
      const db = getTestDb();

      // Add map with correct foreign keys
      await new Promise<void>((resolve, reject) => {
        db.run(
          'INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)',
          ['test-map', game.id, (mode as any).id, 'Test Map'],
          (err) => (err ? reject(err) : resolve())
        );
      });

      // Verify the map is linked to the correct game and mode
      const maps = await new Promise<any[]>((resolve, reject) => {
        db.all(
          'SELECT * FROM game_maps WHERE game_id = ? AND mode_id = ?',
          [game.id, (mode as any).id],
          (err, rows) => (err ? reject(err) : resolve(rows))
        );
      });

      expect(maps).toHaveLength(1);
      expect(maps[0].game_id).toBe(game.id);
      expect(maps[0].mode_id).toBe((mode as any).id);
    });
  });
});
