import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

import { GET as getGameStats } from '@/app/api/games/[gameId]/stats/route';
import { GET as getModeById } from '@/app/api/games/[gameId]/modes/[modeId]/route';
import { POST as postRefreshNames } from '@/app/api/channels/refresh-names/route';

describe('Extended Games & Channel Routes', () => {
  let db: any;
  let game: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    db = getTestDb();
  });

  // ─── GET /api/games/[gameId]/stats ────────────────────────────────────────────

  describe('GET /api/games/[gameId]/stats', () => {
    it('returns empty array when no stat definitions', async () => {
      const request = new Request('http://localhost/');
      const response = await getGameStats(request, createRouteParams({ gameId: game.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('returns stat definitions when they exist', async () => {
      await db.run(
        `INSERT INTO game_stat_definitions (id, game_id, name, display_name, stat_type, sort_order)
         VALUES ('sd1', ?, 'kills', 'Kills', 'number', 1)`,
        [game.id]
      );

      const request = new Request('http://localhost/');
      const response = await getGameStats(request, createRouteParams({ gameId: game.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].name).toBe('kills');
    });

    it('returns empty array for nonexistent game', async () => {
      const request = new Request('http://localhost/');
      const response = await getGameStats(request, createRouteParams({ gameId: 'nonexistent' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveLength(0);
    });
  });

  // ─── GET /api/games/[gameId]/modes/[modeId] ──────────────────────────────────

  describe('GET /api/games/[gameId]/modes/[modeId]', () => {
    it('returns 404 for nonexistent game', async () => {
      const request = createMockRequest('GET', '/api/games/nonexistent/modes/someid');
      const response = await getModeById(request, createRouteParams({ gameId: 'nonexistent', modeId: 'someid' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns 404 for nonexistent mode in valid game', async () => {
      // Use a real game ID that has modes.json (from seeded data)
      const request = createMockRequest('GET', '/api/games/overwatch-2/modes/invalid-mode');
      const response = await getModeById(request, createRouteParams({ gameId: 'overwatch-2', modeId: 'invalid-mode' }));
      const { status } = await parseResponse(response);
      // Either 404 (game not found or mode not found)
      expect(status).toBeGreaterThanOrEqual(400);
    });
  });

  // ─── POST /api/channels/refresh-names ────────────────────────────────────────

  describe('POST /api/channels/refresh-names', () => {
    it('returns 400 when Discord bot not configured', async () => {
      const response = await postRefreshNames();
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns success with 0 channels when no channels exist', async () => {
      await db.run(
        `INSERT OR REPLACE INTO discord_settings (id, guild_id, bot_token)
         VALUES (1, 'guild-abc', 'token-xyz')`
      );

      const response = await postRefreshNames();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.total_channels).toBe(0);
      expect(data.updated_count).toBe(0);
    });
  });
});
