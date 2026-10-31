/**
 * `/api/games/**`: game catalogue, modes, maps (+ tournament-enabled toggles) and stat definitions.
 * Thin handlers over `src/lib/games.ts`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import { logger } from '@/lib/logger';
import type { ModeDataJson } from '@/shared/types';
import {
  getGame, getGameDto, listGamesWithCounts, listMapModeCombinations, listMapsDeduplicated, listMapsForMode,
  listMapsGroupedWithModes, listModesDto, listStatDefinitions, setMapsTournamentEnabled,
} from '@/lib/games';
import { jsonError } from '../http';

function parseTournamentEnabled(value: unknown): boolean | null {
  if (value === 0 || value === false) return false;
  if (value === 1 || value === true) return true;
  return null;
}

export const games = new Hono()
  .get('/', async (c) => {
    try {
      const rows = await listGamesWithCounts(db);
      c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
      return c.json(rows);
    } catch (error) {
      logger.error('Error fetching games:', error);
      return jsonError(c, 'Failed to fetch games');
    }
  })
  .get('/:gameId', async (c) => {
    try {
      const game = await getGameDto(db, c.req.param('gameId'));
      if (!game) return jsonError(c, 'Game not found', 404);
      return c.json(game);
    } catch (error) {
      logger.error('Error fetching game:', error);
      return jsonError(c, 'Failed to fetch game');
    }
  })
  .get('/:gameId/modes', async (c) => {
    try {
      return c.json(await listModesDto(db, c.req.param('gameId')));
    } catch (error) {
      logger.error('Error fetching game modes:', error);
      return jsonError(c, 'Failed to fetch game modes');
    }
  })
  // Mode definition straight from the seed data on disk (setup components, etc.), not from the database.
  .get('/:gameId/modes/:modeId', async (c) => {
    const gameId = c.req.param('gameId');
    const modeId = c.req.param('modeId');
    try {
      const modesPath = path.join(process.cwd(), 'data', 'games', gameId, 'modes.json');
      let modes: ModeDataJson[];
      try {
        modes = JSON.parse(await fs.readFile(modesPath, 'utf8')) as ModeDataJson[];
      } catch (fileError) {
        logger.error(`Error reading modes file for game ${gameId}:`, fileError);
        return jsonError(c, `Game '${gameId}' not found or modes data unavailable`, 404);
      }
      const mode = modes.find((m) => m.id === modeId);
      if (!mode) return jsonError(c, `Mode '${modeId}' not found in game '${gameId}'`, 404);
      return c.json(mode);
    } catch (error) {
      logger.error('Error in GET /api/games/[gameId]/modes/[modeId]:', error);
      return jsonError(c, 'Internal server error');
    }
  })
  .get('/:gameId/modes/:modeId/maps', async (c) => {
    try {
      return c.json(await listMapsForMode(db, c.req.param('gameId'), c.req.param('modeId')));
    } catch (error) {
      logger.error('Error fetching maps for mode:', error);
      return jsonError(c, 'Failed to fetch maps for mode');
    }
  })
  .get('/:gameId/maps', async (c) => {
    try {
      const gameId = c.req.param('gameId');
      let maps;
      if (gameId === 'cs2') {
        maps = await listMapsGroupedWithModes(db, gameId);
      } else {
        const game = await getGame(db, gameId);
        maps = game?.supports_all_modes ? await listMapsDeduplicated(db, gameId) : await listMapModeCombinations(db, gameId);
      }
      c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return c.json(maps);
    } catch (error) {
      logger.error('Error fetching maps:', error);
      return jsonError(c, 'Failed to fetch maps');
    }
  })
  .patch('/:gameId/maps', async (c) => {
    try {
      const gameId = c.req.param('gameId');
      const body = await c.req.json();

      if (!body || !Array.isArray(body.updates) || body.updates.length === 0) {
        return jsonError(c, 'Missing or invalid updates array', 400);
      }
      const updates: Array<{ name: string; tournament_enabled: boolean }> = [];
      for (const item of body.updates) {
        const enabled = parseTournamentEnabled(item?.tournament_enabled);
        if (typeof item?.name !== 'string' || enabled === null) {
          return jsonError(c, 'Each update must have name (string) and tournament_enabled (0 or 1)', 400);
        }
        updates.push({ name: item.name, tournament_enabled: enabled });
      }

      const updated = await db.transaction((tx) => setMapsTournamentEnabled(tx, gameId, updates));
      return c.json({ success: true, updated });
    } catch (error) {
      if (error instanceof SyntaxError) throw error;
      logger.error('Error updating tournament-enabled maps:', error);
      return jsonError(c, 'Failed to update maps');
    }
  })
  .get('/:gameId/stats', async (c) => {
    try {
      return c.json(await listStatDefinitions(db, c.req.param('gameId')));
    } catch (error) {
      logger.error('Error fetching game stats:', error);
      return jsonError(c, 'Failed to fetch game stats');
    }
  });
