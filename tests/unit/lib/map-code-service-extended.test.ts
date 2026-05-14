import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(async () => {
    const { getTestDb } = await import('../../utils/test-db');
    return getTestDb();
  }),
}));

import { MapCodeService } from '@/lib/map-code-service';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

describe('MapCodeService — Extended', () => {
  let game: { id: string };
  let mode: { id: string };

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    vi.clearAllMocks();
  });

  describe('processMapCode — queue row verification', () => {
    it('inserts a row into discord_map_code_queue with correct fields', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const mapCodes = { 'hanamura': 'TESTCODE' };

      const result = await MapCodeService.processMapCode(match.id, game.id, 'hanamura', mapCodes);
      expect(result).toBe(true);

      const row = await db.get<{ match_id: string; map_code: string; status: string }>(
        `SELECT match_id, map_code, status FROM discord_map_code_queue WHERE match_id = ? ORDER BY rowid DESC LIMIT 1`,
        [match.id]
      );
      expect(row?.match_id).toBe(match.id);
      expect(row?.map_code).toBe('TESTCODE');
      expect(row?.status).toBe('pending');
    });

    it('stores map_name in queue row', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await db.run(
        `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES ('hanamura', ?, ?, 'Hanamura')`,
        [game.id, mode.id]
      );

      const mapCodes = { 'hanamura': 'CODE42' };
      await MapCodeService.processMapCode(match.id, game.id, 'hanamura', mapCodes);

      const row = await db.get<{ map_name: string }>(
        `SELECT map_name FROM discord_map_code_queue WHERE match_id = ? ORDER BY rowid DESC LIMIT 1`,
        [match.id]
      );
      expect(row?.map_name).toBe('Hanamura');
    });

    it('falls back to mapId as map_name when no DB entry found', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const mapCodes = { 'obscure-map': 'FALLBACK' };

      await MapCodeService.processMapCode(match.id, game.id, 'obscure-map', mapCodes);

      const row = await db.get<{ map_name: string }>(
        `SELECT map_name FROM discord_map_code_queue WHERE match_id = ? ORDER BY rowid DESC LIMIT 1`,
        [match.id]
      );
      expect(row?.map_name).toBe('obscure-map');
    });

    it('special characters in map code are stored verbatim', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const specialCode = 'CODE-123/ABC!@#';
      const mapCodes = { 'blizzard-world': specialCode };

      const result = await MapCodeService.processMapCode(match.id, game.id, 'blizzard-world', mapCodes);
      expect(result).toBe(true);

      const row = await db.get<{ map_code: string }>(
        `SELECT map_code FROM discord_map_code_queue WHERE match_id = ? ORDER BY rowid DESC LIMIT 1`,
        [match.id]
      );
      expect(row?.map_code).toBe(specialCode);
    });

    it('map code with spaces is stored and returned correctly', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const spaceCode = 'MY CODE 999';
      const mapCodes = { 'eichenwalde': spaceCode };

      const result = await MapCodeService.processMapCode(match.id, game.id, 'eichenwalde', mapCodes);
      expect(result).toBe(true);

      const row = await db.get<{ map_code: string }>(
        `SELECT map_code FROM discord_map_code_queue WHERE match_id = ? ORDER BY rowid DESC LIMIT 1`,
        [match.id]
      );
      expect(row?.map_code).toBe(spaceCode);
    });
  });

  describe('processMapCode — case-insensitive and diacritic matching', () => {
    it('matches map code with different casing', async () => {
      const match = await createMatch(game.id, mode.id);
      const mapCodes = { 'Hanamura': 'UPPER_CODE' };

      // lowercase lookup should match uppercase key
      const result = await MapCodeService.processMapCode(match.id, game.id, 'hanamura', mapCodes);
      expect(result).toBe(true);
    });

    it('matches map code with mixed case key', async () => {
      const match = await createMatch(game.id, mode.id);
      const mapCodes = { 'KING-OF-THE-HILL': 'KOTH_CODE' };

      const result = await MapCodeService.processMapCode(match.id, game.id, 'king-of-the-hill', mapCodes);
      expect(result).toBe(true);
    });

    it('matches diacritic-normalized map ID', async () => {
      const match = await createMatch(game.id, mode.id);
      // key has accent, lookup without accent
      const mapCodes = { 'Anubis': 'DIAC_CODE' };

      const result = await MapCodeService.processMapCode(match.id, game.id, 'anubis', mapCodes);
      expect(result).toBe(true);
    });
  });

  describe('processMapCode — instance ID suffix stripping', () => {
    it('exact instance ID match finds the code', async () => {
      const match = await createMatch(game.id, mode.id);
      const instanceId = 'nepal-1776547135000-abcdefghi';
      const mapCodes = { [instanceId]: 'INST_CODE' };

      const result = await MapCodeService.processMapCode(match.id, game.id, instanceId, mapCodes);
      expect(result).toBe(true);
    });

    it('returns false when only base name key exists but full instance ID is queried', async () => {
      const match = await createMatch(game.id, mode.id);
      const instanceId = 'nepal-1776547135000-abcdefghi';
      const mapCodes = { 'nepal': 'BASE_CODE' };

      const result = await MapCodeService.processMapCode(match.id, game.id, instanceId, mapCodes);
      expect(result).toBe(false);
    });
  });

  describe('processFirstMapCode — first-map-only behavior', () => {
    it('only queues code for the first map even when multiple maps exist', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await db.run(`UPDATE games SET map_codes_supported = 1 WHERE id = ?`, [game.id]);
      await db.run(
        `UPDATE matches SET maps = ?, map_codes = ? WHERE id = ?`,
        [
          JSON.stringify(['map-one', 'map-two', 'map-three']),
          JSON.stringify({ 'map-one': 'CODE1', 'map-two': 'CODE2', 'map-three': 'CODE3' }),
          match.id,
        ]
      );

      await MapCodeService.processFirstMapCode(match.id);

      const rows = await db.all<{ map_code: string }>(
        `SELECT map_code FROM discord_map_code_queue WHERE match_id = ?`,
        [match.id]
      );
      expect(rows).toHaveLength(1);
      expect((rows[0] as { map_code: string }).map_code).toBe('CODE1');
    });

    it('returns false when maps is an empty JSON array', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await db.run(`UPDATE games SET map_codes_supported = 1 WHERE id = ?`, [game.id]);
      await db.run(
        `UPDATE matches SET maps = ? WHERE id = ?`,
        [JSON.stringify([]), match.id]
      );

      const result = await MapCodeService.processFirstMapCode(match.id);
      expect(result).toBe(false);
    });

    it('returns false when map_codes is null but maps exist', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await db.run(`UPDATE games SET map_codes_supported = 1 WHERE id = ?`, [game.id]);
      await db.run(
        `UPDATE matches SET maps = ?, map_codes = NULL WHERE id = ?`,
        [JSON.stringify(['hanamura']), match.id]
      );

      const result = await MapCodeService.processFirstMapCode(match.id);
      expect(result).toBe(false);
    });

    it('is not idempotent — calling twice inserts two queue rows', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      await db.run(`UPDATE games SET map_codes_supported = 1 WHERE id = ?`, [game.id]);
      await db.run(
        `UPDATE matches SET maps = ?, map_codes = ? WHERE id = ?`,
        [JSON.stringify(['hanamura']), JSON.stringify({ 'hanamura': 'DUP_CODE' }), match.id]
      );

      await MapCodeService.processFirstMapCode(match.id);
      await MapCodeService.processFirstMapCode(match.id);

      const rows = await db.all(
        `SELECT id FROM discord_map_code_queue WHERE match_id = ?`,
        [match.id]
      );
      expect(rows.length).toBe(2);
    });
  });
});
