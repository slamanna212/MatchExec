import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));
vi.mock('../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));
vi.mock('../../src/lib/database-init', () => ({
  getDbInstance: vi.fn(),
}));
vi.mock('../../src/lib/voice-channel-service', () => ({
  VoiceChannelService: {
    setupMatchVoiceChannels: vi.fn().mockResolvedValue(undefined),
  },
}));

import {
  calculateTournamentRounds,
  calculateTotalMatches,
  generateSingleEliminationMatches,
  type BracketAssignment,
} from '../../src/lib/tournament-bracket';
import { getDbInstance } from '../../src/lib/database-init';
import { getTestDb } from '../utils/test-db';
import { seedBasicTestData, createTournament } from '../utils/fixtures';

const mockGetDbInstance = getDbInstance as ReturnType<typeof vi.fn>;

describe('Tournament bracket edge cases (J2)', () => {
  let db: ReturnType<typeof getTestDb>;
  let gameId: string;
  let modeId: string;

  beforeEach(async () => {
    db = getTestDb();
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
    mockGetDbInstance.mockResolvedValue(db);

    // generateSingleEliminationMatches requires at least one map per mode
    for (let i = 1; i <= 3; i++) {
      await db.run(
        `INSERT OR IGNORE INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
        [`edge-map-${i}-${modeId}`, gameId, modeId, `Edge Map ${i}`]
      );
    }
  });

  // ─── calculateTournamentRounds — edge cases ───────────────────────────────

  describe('calculateTournamentRounds', () => {
    it('2-team bracket requires exactly 1 round', () => {
      expect(calculateTournamentRounds(2, 'single-elimination')).toBe(1);
    });

    it('3-team bracket requires 2 rounds (bye in round 1)', () => {
      // 3 teams → first power of 2 ≥ 3 is 4 → 2 rounds
      expect(calculateTournamentRounds(3, 'single-elimination')).toBe(2);
    });

    it('4-team bracket requires 2 rounds', () => {
      expect(calculateTournamentRounds(4, 'single-elimination')).toBe(2);
    });

    it('9-team bracket requires 4 rounds', () => {
      // 9 teams → first power of 2 ≥ 9 is 16 → 4 rounds
      expect(calculateTournamentRounds(9, 'single-elimination')).toBe(4);
    });

    it('1024-team bracket requires 10 rounds (smoke test)', () => {
      expect(calculateTournamentRounds(1024, 'single-elimination')).toBe(10);
    });

    it('double elimination requires roughly double the rounds', () => {
      const se = calculateTournamentRounds(8, 'single-elimination');
      const de = calculateTournamentRounds(8, 'double-elimination');
      expect(de).toBeGreaterThan(se);
    });
  });

  // ─── calculateTotalMatches — edge cases ───────────────────────────────────

  describe('calculateTotalMatches', () => {
    it('2-team bracket has exactly 1 match', () => {
      expect(calculateTotalMatches(2, 'single-elimination')).toBe(1);
    });

    it('N-team single elimination always has N-1 matches', () => {
      for (const n of [4, 8, 16, 32]) {
        expect(calculateTotalMatches(n, 'single-elimination')).toBe(n - 1);
      }
    });

    it('double elimination has more matches than single elimination', () => {
      expect(calculateTotalMatches(8, 'double-elimination')).toBeGreaterThan(
        calculateTotalMatches(8, 'single-elimination')
      );
    });

    it('1024-team tournament completes in reasonable time (smoke test)', () => {
      const start = Date.now();
      const count = calculateTotalMatches(1024, 'single-elimination');
      const elapsed = Date.now() - start;
      expect(count).toBe(1023);
      expect(elapsed).toBeLessThan(1000); // must complete within 1 second
    });
  });

  // ─── generateSingleEliminationMatches — bye placement ────────────────────
  //
  // The algorithm pairs teams sequentially: (pos1,pos2), (pos3,pos4), ...
  // An odd-positioned last team gets a bye and no match is generated for them.
  // N teams → floor(N/2) first-round matches.

  describe('generateSingleEliminationMatches', () => {
    async function seedTournamentWithTeams(teamCount: number) {
      const tournament = await createTournament(gameId, {
        game_mode_id: modeId,
        format: 'single-elimination',
      });

      const teamIds: string[] = [];
      for (let i = 0; i < teamCount; i++) {
        const teamId = `team-${tournament.id}-${i}`;
        await db.run(
          `INSERT INTO tournament_teams (id, tournament_id, team_name, created_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [teamId, tournament.id, `Team ${i}`]
        );
        teamIds.push(teamId);
      }

      return { tournament, teamIds };
    }

    it('2-team bracket generates exactly 1 match with both teams', async () => {
      const { tournament, teamIds } = await seedTournamentWithTeams(2);
      const assignments: BracketAssignment[] = teamIds.map((teamId, i) => ({
        position: i + 1,
        teamId,
      }));
      const matches = await generateSingleEliminationMatches(
        tournament.id,
        assignments,
        gameId,
        1
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].team1_id).toBeDefined();
      expect(matches[0].team2_id).toBeDefined();
      expect(matches[0].tournament_round).toBe(1);
    });

    it('3-team bracket generates 1 first-round match (third team gets bye)', async () => {
      // Algorithm pairs sequentially: positions (1,2) play; position 3 gets bye
      const { tournament, teamIds } = await seedTournamentWithTeams(3);
      const assignments: BracketAssignment[] = teamIds.map((teamId, i) => ({
        position: i + 1,
        teamId,
      }));
      const matches = await generateSingleEliminationMatches(
        tournament.id,
        assignments,
        gameId,
        1
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].tournament_round).toBe(1);
    });

    it('4-team bracket generates 2 first-round matches', async () => {
      const { tournament, teamIds } = await seedTournamentWithTeams(4);
      const assignments: BracketAssignment[] = teamIds.map((teamId, i) => ({
        position: i + 1,
        teamId,
      }));
      const matches = await generateSingleEliminationMatches(
        tournament.id,
        assignments,
        gameId,
        1
      );
      expect(matches).toHaveLength(2);
      for (const m of matches) {
        expect(m.tournament_round).toBe(1);
        expect(m.tournament_bracket_type).toBe('winners');
      }
    });

    it('9-team bracket generates 4 first-round matches (9th team gets bye)', async () => {
      // Sequential pairing: (1,2), (3,4), (5,6), (7,8) → 4 matches; position 9 → bye
      const { tournament, teamIds } = await seedTournamentWithTeams(9);
      const assignments: BracketAssignment[] = teamIds.map((teamId, i) => ({
        position: i + 1,
        teamId,
      }));
      const matches = await generateSingleEliminationMatches(
        tournament.id,
        assignments,
        gameId,
        1
      );
      expect(matches).toHaveLength(4);
    });

    it('1024-team bracket generates 512 first-round matches (no byes)', async () => {
      // Smoke test: no team left unpaired
      const start = Date.now();
      const { tournament, teamIds } = await seedTournamentWithTeams(1024);
      const assignments: BracketAssignment[] = teamIds.map((teamId, i) => ({
        position: i + 1,
        teamId,
      }));
      const matches = await generateSingleEliminationMatches(
        tournament.id,
        assignments,
        gameId,
        1
      );
      const elapsed = Date.now() - start;
      expect(matches).toHaveLength(512);
      expect(elapsed).toBeLessThan(30000); // must complete within 30 seconds
    });
  });
});
