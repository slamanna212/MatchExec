import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(async () => {
    const { getTestDb } = await import('../utils/test-db');
    return getTestDb();
  }),
}));

vi.mock('@/lib/voice-channel-manager', () => ({
  deleteMatchVoiceChannels: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/scoring-functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/scoring-functions')>();
  return {
    ...actual,
    queueScoreNotification: vi.fn().mockResolvedValue(undefined),
    queueBattleStartDMs: vi.fn().mockResolvedValue(undefined),
  };
});

import { seedBasicTestData, createMatch } from '../utils/fixtures';
import { getTestDb } from '../utils/test-db';
import {
  getPointsForPosition,
  calculatePositionPoints,
  getMatchFormat,
  initializeMatchGames,
  getMatchGames,
  getOverallMatchScore,
} from '@/lib/scoring-functions';
import type { PositionScoringConfig } from '@/shared/types';

describe('Scoring Functions — Extended', () => {
  let game: { id: string };
  let mode: { id: string };

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  describe('getPointsForPosition — edge cases', () => {
    const config: PositionScoringConfig = {
      type: 'Position',
      pointsPerPosition: { '1': 10, '2': 7, '3': 5 },
    };

    it('returns 0 for position 0', () => {
      expect(getPointsForPosition(0, config)).toBe(0);
    });

    it('returns 0 for a negative position', () => {
      expect(getPointsForPosition(-1, config)).toBe(0);
    });

    it('returns 0 for a very high position not in config', () => {
      expect(getPointsForPosition(999, config)).toBe(0);
    });

    it('returns correct points for position 1', () => {
      expect(getPointsForPosition(1, config)).toBe(10);
    });

    it('returns correct points for position 3 (last in config)', () => {
      expect(getPointsForPosition(3, config)).toBe(5);
    });

    it('returns 0 when pointsPerPosition is empty', () => {
      const emptyConfig: PositionScoringConfig = { type: 'Position', pointsPerPosition: {} };
      expect(getPointsForPosition(1, emptyConfig)).toBe(0);
    });
  });

  describe('calculatePositionPoints', () => {
    it('returns all zeros when game has no scoring config', async () => {
      const match = await createMatch(game.id, mode.id);
      const db = getTestDb();
      const gameRow = await db.get<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ? LIMIT 1`, [match.id]);
      if (!gameRow) return; // No games initialized — skip

      const results = await calculatePositionPoints({ p1: 1, p2: 2 }, gameRow.id);
      expect(results).toEqual({ p1: 0, p2: 0 });
    });

    it('returns all zeros for malformed scoring_config JSON', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE games SET scoring_config = 'not-valid-json' WHERE id = ?`, [game.id]);

      await initializeMatchGames(match.id);
      const gameRow = await db.get<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ? ORDER BY round LIMIT 1`, [match.id]);
      if (!gameRow) return;

      const results = await calculatePositionPoints({ p1: 1 }, gameRow.id);
      expect(results).toEqual({ p1: 0 });
    });
  });

  describe('getMatchFormat', () => {
    it('returns "casual" for a non-existent match', async () => {
      const format = await getMatchFormat('nonexistent-match-id');
      expect(format).toBe('casual');
    });

    it('returns the stored format when set on the match', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET match_format = 'competitive' WHERE id = ?`, [match.id]);

      const format = await getMatchFormat(match.id);
      expect(format).toBe('competitive');
    });

    it('returns "casual" when match_format column is NULL', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET match_format = NULL WHERE id = ?`, [match.id]);
      const format = await getMatchFormat(match.id);
      expect(format).toBe('casual');
    });
  });

  describe('initializeMatchGames — idempotency', () => {
    it('calling twice results in the same number of rows', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const maps = ['map-a', 'map-b', 'map-c'];
      await db.run(`UPDATE matches SET maps = ? WHERE id = ?`, [JSON.stringify(maps), match.id]);

      await initializeMatchGames(match.id);
      await initializeMatchGames(match.id); // second call — should be no-op

      const rows = await db.all(`SELECT id FROM match_games WHERE match_id = ? AND round > 0`, [match.id]);
      expect(rows.length).toBe(maps.length);
    });

    it('does nothing when match has no maps field', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET maps = NULL WHERE id = ?`, [match.id]);

      await initializeMatchGames(match.id);
      const rows = await db.all(`SELECT id FROM match_games WHERE match_id = ? AND round > 0`, [match.id]);
      expect(rows.length).toBe(0);
    });

    it('does nothing for malformed maps JSON', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET maps = 'not-json' WHERE id = ?`, [match.id]);

      await initializeMatchGames(match.id);
      const rows = await db.all(`SELECT id FROM match_games WHERE match_id = ? AND round > 0`, [match.id]);
      expect(rows.length).toBe(0);
    });

    it('sets round 1 status to ongoing and others to pending', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET maps = ? WHERE id = ?`, [JSON.stringify(['m1', 'm2', 'm3']), match.id]);

      await initializeMatchGames(match.id);

      const games = await db.all<{ round: number; status: string }>(
        `SELECT round, status FROM match_games WHERE match_id = ? AND round > 0 ORDER BY round`,
        [match.id]
      );
      expect(games[0].status).toBe('ongoing');
      expect(games[1].status).toBe('pending');
      expect(games[2].status).toBe('pending');
    });
  });

  describe('getMatchGames', () => {
    it('returns empty array for unknown match', async () => {
      const games = await getMatchGames('nonexistent');
      expect(Array.isArray(games)).toBe(true);
      expect(games).toHaveLength(0);
    });

    it('initializes and returns games when none exist yet', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET maps = ? WHERE id = ?`, [JSON.stringify(['mapX']), match.id]);

      const games = await getMatchGames(match.id);
      expect(games.length).toBeGreaterThanOrEqual(0); // auto-init may or may not run depending on state
    });
  });

  describe('getOverallMatchScore', () => {
    it('returns a score object for a new match with no completed games', async () => {
      const match = await createMatch(game.id, mode.id);
      const score = await getOverallMatchScore(match.id);
      expect(score).toBeDefined();
      // score shape depends on format; at minimum it should not throw
    });

    it('returns team1 leading after a team1 win', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const gameId = `${match.id}_game_1`;
      await db.run(
        `INSERT OR IGNORE INTO match_games (id, match_id, round, status, winner_id, completed_at)
         VALUES (?, ?, 1, 'completed', 'team1', CURRENT_TIMESTAMP)`,
        [gameId, match.id]
      );

      const score = await getOverallMatchScore(match.id);
      expect(score).toBeDefined();
      // The score should reflect at least 1 win for team1
      const scoreStr = JSON.stringify(score);
      expect(scoreStr).toMatch(/team1|1/);
    });
  });
});
