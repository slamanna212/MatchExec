import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('../../../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
  },
}));

import { MapCodeService } from '../../../src/lib/map-code-service';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

describe('MapCodeService', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
    vi.clearAllMocks();
  });

  describe('processFirstMapCode', () => {
    it('returns false when match_codes_supported is false/null', async () => {
      const match = await createMatch(game.id, mode.id);
      // games table has map_codes_supported = 0 by default
      const result = await MapCodeService.processFirstMapCode(match.id);
      expect(result).toBe(false);
    });

    it('returns false for nonexistent match', async () => {
      const result = await MapCodeService.processFirstMapCode('nonexistent-match');
      expect(result).toBe(false);
    });

    it('returns false when no maps configured', async () => {
      const match = await createMatch(game.id, mode.id);
      // Enable map codes on the game
      await db.run(`UPDATE games SET map_codes_supported = 1 WHERE id = ?`, [game.id]);
      // Match has no maps by default
      const result = await MapCodeService.processFirstMapCode(match.id);
      expect(result).toBe(false);
    });

    it('returns false when no map code found for first map', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE games SET map_codes_supported = 1 WHERE id = ?`, [game.id]);
      // Set maps but no map_codes
      await db.run(
        `UPDATE matches SET maps = ? WHERE id = ?`,
        [JSON.stringify(['map-1']), match.id]
      );
      const result = await MapCodeService.processFirstMapCode(match.id);
      expect(result).toBe(false);
    });

    it('attempts to queue map code PM when match has maps and codes', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE games SET map_codes_supported = 1 WHERE id = ?`, [game.id]);
      await db.run(
        `UPDATE matches SET maps = ?, map_codes = ? WHERE id = ?`,
        [JSON.stringify(['hanamura']), JSON.stringify({ 'hanamura': 'ABC123' }), match.id]
      );

      // Method finds map code and successfully queues PM
      const result = await MapCodeService.processFirstMapCode(match.id);
      expect(result).toBe(true);
    });
  });

  describe('processMapCode', () => {
    it('returns false when no map code found', async () => {
      const match = await createMatch(game.id, mode.id);
      const result = await MapCodeService.processMapCode(match.id, game.id, 'unknown-map', {});
      expect(result).toBe(false);
    });

    it('queues PM when map code found', async () => {
      const match = await createMatch(game.id, mode.id);
      const mapCodes = { 'hanamura': 'XYZ789' };

      // processMapCode finds the code and queues it successfully
      const result = await MapCodeService.processMapCode(match.id, game.id, 'hanamura', mapCodes);
      expect(result).toBe(true);
    });

    it('strips numeric suffix from map ID before lookup', async () => {
      const match = await createMatch(game.id, mode.id);
      // "hanamura-1" should be cleaned to "hanamura"
      const mapCodes = { 'hanamura': 'CODE99' };
      const mapCodesWithSuffix = { 'hanamura-1': 'WRONG' };

      // With exact key "hanamura-1" in codes — numeric suffix stripped, looks up "hanamura" but code is keyed as "hanamura-1"
      const noMatch = await MapCodeService.processMapCode(match.id, game.id, 'hanamura-1', mapCodesWithSuffix);
      expect(noMatch).toBe(false);

      // With base key "hanamura" — finds a match and queues successfully
      const hasMatch = await MapCodeService.processMapCode(match.id, game.id, 'hanamura-1', mapCodes);
      expect(hasMatch).toBe(true);
    });

    it('returns false for case where no code found in codes map', async () => {
      const match = await createMatch(game.id, mode.id);
      const mapCodes = { 'other-map': 'CODE99' };
      const result = await MapCodeService.processMapCode(match.id, game.id, 'hanamura', mapCodes);
      expect(result).toBe(false);
    });
  });
});
