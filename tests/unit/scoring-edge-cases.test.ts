import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PositionScoringConfig } from '../../shared/types';

vi.mock('../../src/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));
vi.mock('../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));
vi.mock('../../src/lib/voice-channel-manager', () => ({ deleteMatchVoiceChannels: vi.fn() }));
vi.mock('../../src/lib/feed-helpers', () => ({ logFeedEvent: vi.fn() }));

import { getPointsForPosition, getOverallMatchScore } from '../../src/lib/scoring-functions';
import { getTestDb } from '../utils/test-db';
import { seedBasicTestData, createMatch } from '../utils/fixtures';

function makeConfig(pointsMap: Record<string, number>): PositionScoringConfig {
  return { type: 'Position', pointsPerPosition: pointsMap };
}

describe('Scoring edge cases (J1)', () => {
  let db: ReturnType<typeof getTestDb>;
  let gameId: string;
  let modeId: string;

  beforeEach(async () => {
    db = getTestDb();
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
  });

  // ─── getPointsForPosition — pure function edge cases ──────────────────────

  describe('getPointsForPosition', () => {
    it('returns correct points for 1st place', () => {
      const config = makeConfig({ '1': 10, '2': 5, '3': 2 });
      expect(getPointsForPosition(1, config)).toBe(10);
    });

    it('returns 0 for position not in config', () => {
      const config = makeConfig({ '1': 10 });
      expect(getPointsForPosition(99, config)).toBe(0);
    });

    it('returns 0 for position 0 when not in config', () => {
      const config = makeConfig({ '1': 10 });
      expect(getPointsForPosition(0, config)).toBe(0);
    });

    it('returns correct value for position 0 when explicitly configured', () => {
      const config = makeConfig({ '0': 100, '1': 50 });
      expect(getPointsForPosition(0, config)).toBe(100);
    });

    it('returns 0 for negative position', () => {
      const config = makeConfig({ '1': 10 });
      expect(getPointsForPosition(-1, config)).toBe(0);
    });

    it('handles empty config returning 0', () => {
      const config = makeConfig({});
      expect(getPointsForPosition(1, config)).toBe(0);
    });

    it('handles large position number', () => {
      const config = makeConfig({ '1': 10 });
      expect(getPointsForPosition(1000000, config)).toBe(0);
    });

    it('returns the configured value for large position in config', () => {
      const config = makeConfig({ '1000': 1 });
      expect(getPointsForPosition(1000, config)).toBe(1);
    });

    it('handles float position (truncated key lookup returns 0)', () => {
      const config = makeConfig({ '1': 10 });
      // 1.5 → key "1.5" → not in config → 0
      expect(getPointsForPosition(1.5, config)).toBe(0);
    });

    it('returns 0 points when all positions score 0', () => {
      const config = makeConfig({ '1': 0, '2': 0 });
      expect(getPointsForPosition(1, config)).toBe(0);
      expect(getPointsForPosition(2, config)).toBe(0);
    });
  });

  // ─── getOverallMatchScore — tie / zero scenarios ──────────────────────────

  describe('getOverallMatchScore', () => {
    it('returns tie when team1 and team2 wins are equal (e.g., 1-1)', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await db.run(
        `INSERT INTO match_games (id, match_id, round, winner_id, status, is_ffa_mode)
         VALUES ('g1', ?, 1, 'team1', 'completed', 0)`,
        [match.id]
      );
      await db.run(
        `INSERT INTO match_games (id, match_id, round, winner_id, status, is_ffa_mode)
         VALUES ('g2', ?, 2, 'team2', 'completed', 0)`,
        [match.id]
      );

      const score = await getOverallMatchScore(match.id);
      expect(score.team1Wins).toBe(1);
      expect(score.team2Wins).toBe(1);
      expect(score.overallWinner).toBe('tie');
    });

    it('returns null winner when no completed games exist (0-0)', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });

      const score = await getOverallMatchScore(match.id);
      expect(score.team1Wins).toBe(0);
      expect(score.team2Wins).toBe(0);
      expect(score.totalNormalGames).toBe(0);
      expect(score.overallWinner).toBeNull();
    });

    it('returns null winner for a match with only pending (not completed) games', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await db.run(
        `INSERT INTO match_games (id, match_id, round, winner_id, status, is_ffa_mode)
         VALUES ('g-pending', ?, 1, 'team1', 'pending', 0)`,
        [match.id]
      );

      const score = await getOverallMatchScore(match.id);
      expect(score.overallWinner).toBeNull();
    });

    it('all-zeros score (both teams scored 0 maps) returns null winner', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      // Completed games with no winner set (winner_id IS NULL)
      await db.run(
        `INSERT INTO match_games (id, match_id, round, winner_id, status, is_ffa_mode)
         VALUES ('g-nw', ?, 1, NULL, 'completed', 0)`,
        [match.id]
      );

      const score = await getOverallMatchScore(match.id);
      expect(score.overallWinner).toBeNull();
    });

    it('single map match: winner correctly identified', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await db.run(
        `INSERT INTO match_games (id, match_id, round, winner_id, status, is_ffa_mode)
         VALUES ('g-single', ?, 1, 'team2', 'completed', 0)`,
        [match.id]
      );

      const score = await getOverallMatchScore(match.id);
      expect(score.team2Wins).toBe(1);
      expect(score.overallWinner).toBe('team2');
    });

    it('FFA-mode games are excluded from normal match score calculation', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      // Only an FFA game — should not count toward normal score
      await db.run(
        `INSERT INTO match_games (id, match_id, round, winner_id, status, is_ffa_mode)
         VALUES ('g-ffa', ?, 1, 'team1', 'completed', 1)`,
        [match.id]
      );

      const score = await getOverallMatchScore(match.id);
      expect(score.totalNormalGames).toBe(0);
      expect(score.overallWinner).toBeNull();
    });

    it('3-0 sweep returns team1 as winner', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      for (let i = 1; i <= 3; i++) {
        await db.run(
          `INSERT INTO match_games (id, match_id, round, winner_id, status, is_ffa_mode)
           VALUES ('g-sweep-${i}', ?, ${i}, 'team1', 'completed', 0)`,
          [match.id]
        );
      }

      const score = await getOverallMatchScore(match.id);
      expect(score.team1Wins).toBe(3);
      expect(score.team2Wins).toBe(0);
      expect(score.overallWinner).toBe('team1');
    });
  });

  // ─── Table-driven position scoring ───────────────────────────────────────

  describe('getPointsForPosition — table-driven cases', () => {
    const config = makeConfig({ '1': 100, '2': 75, '3': 50, '4': 25 });

    const cases = [
      { pos: 1, expected: 100, desc: '1st place' },
      { pos: 2, expected: 75,  desc: '2nd place' },
      { pos: 3, expected: 50,  desc: '3rd place' },
      { pos: 4, expected: 25,  desc: '4th place' },
      { pos: 5, expected: 0,   desc: '5th place (not in config)' },
      { pos: 0, expected: 0,   desc: '0th place (not in config)' },
    ];

    it.each(cases)('$desc → $expected points', ({ pos, expected }) => {
      expect(getPointsForPosition(pos, config)).toBe(expected);
    });
  });
});
