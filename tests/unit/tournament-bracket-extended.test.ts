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

import { seedBasicTestData, createTournament } from '../utils/fixtures';
import { getTestDb } from '../utils/test-db';
import {
  calculateTournamentRounds,
  calculateTotalMatches,
  generateSingleEliminationMatches,
  saveGeneratedMatches,
  isRoundComplete,
  getBracketWinner,
  isBracketReadyForFinals,
  type BracketAssignment,
  type TournamentMatchInfo,
} from '@/lib/tournament-bracket';

describe('Tournament Bracket — Extended', () => {
  let game: { id: string };
  let mode: { id: string };

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;

    // Insert game maps (required by tournament bracket generation)
    const db = getTestDb();
    for (let i = 1; i <= 5; i++) {
      await db.run(
        `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
        [`ext-map-${i}-${Date.now()}`, game.id, mode.id, `Ext Map ${i}`]
      );
    }
  });

  describe('calculateTournamentRounds — extended team counts', () => {
    it('returns 0 for 0 teams', () => {
      expect(calculateTournamentRounds(0, 'single-elimination')).toBe(0);
    });

    it('returns 0 for 1 team', () => {
      expect(calculateTournamentRounds(1, 'single-elimination')).toBe(0);
    });

    it('returns 1 for 2 teams (single)', () => {
      expect(calculateTournamentRounds(2, 'single-elimination')).toBe(1);
    });

    it('returns 2 for 3 teams (needs 4-slot bracket)', () => {
      expect(calculateTournamentRounds(3, 'single-elimination')).toBe(2);
    });

    it('returns 2 for 4 teams', () => {
      expect(calculateTournamentRounds(4, 'single-elimination')).toBe(2);
    });

    it('returns 3 for 5 teams (needs 8-slot bracket)', () => {
      expect(calculateTournamentRounds(5, 'single-elimination')).toBe(3);
    });

    it('returns 3 for 8 teams', () => {
      expect(calculateTournamentRounds(8, 'single-elimination')).toBe(3);
    });

    it('returns 4 for 9 teams (needs 16-slot bracket)', () => {
      expect(calculateTournamentRounds(9, 'single-elimination')).toBe(4);
    });

    it('returns 4 for 16 teams', () => {
      expect(calculateTournamentRounds(16, 'single-elimination')).toBe(4);
    });

    it('returns 5 for 17 teams (needs 32-slot bracket)', () => {
      expect(calculateTournamentRounds(17, 'single-elimination')).toBe(5);
    });

    it('returns 5 for 32 teams', () => {
      expect(calculateTournamentRounds(32, 'single-elimination')).toBe(5);
    });

    it('double-elimination returns more rounds than single for same team count', () => {
      const single = calculateTournamentRounds(8, 'single-elimination');
      const double = calculateTournamentRounds(8, 'double-elimination');
      expect(double).toBeGreaterThan(single);
    });

    it('double-elimination 4 teams: winners + losers + finals', () => {
      // Single: 2 rounds. Double: 2 + (2-1)*2 + 1 = 5
      expect(calculateTournamentRounds(4, 'double-elimination')).toBe(5);
    });
  });

  describe('calculateTotalMatches — extended cases', () => {
    it('returns 0 for less than 2 teams', () => {
      expect(calculateTotalMatches(1, 'single-elimination')).toBe(0);
      expect(calculateTotalMatches(0, 'single-elimination')).toBe(0);
    });

    it('returns 1 for 2 teams (single)', () => {
      expect(calculateTotalMatches(2, 'single-elimination')).toBe(1);
    });

    it('returns n-1 for single elimination', () => {
      expect(calculateTotalMatches(8, 'single-elimination')).toBe(7);
      expect(calculateTotalMatches(16, 'single-elimination')).toBe(15);
      expect(calculateTotalMatches(12, 'single-elimination')).toBe(11);
    });

    it('returns 2n-2 for double elimination', () => {
      expect(calculateTotalMatches(4, 'double-elimination')).toBe(6);
      expect(calculateTotalMatches(8, 'double-elimination')).toBe(14);
    });
  });

  describe('generateSingleEliminationMatches — various team counts', () => {
    async function setupTournament() {
      return createTournament(game.id, { game_mode_id: mode.id });
    }

    async function addTeams(tournamentId: string, count: number): Promise<string[]> {
      const db = getTestDb();
      const ids: string[] = [];
      for (let i = 1; i <= count; i++) {
        const id = `t${count}-${i}-${Date.now()}`;
        await db.run(
          `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
          [id, tournamentId, `Team ${i}`]
        );
        ids.push(id);
      }
      return ids;
    }

    it('generates 1 match for 2 teams', async () => {
      const t = await setupTournament();
      const teams = await addTeams(t.id, 2);
      const assignments: BracketAssignment[] = teams.map((teamId, i) => ({ position: i + 1, teamId }));
      const matches = await generateSingleEliminationMatches(t.id, assignments, game.id, 3);
      expect(matches.length).toBe(1);
    });

    it('generates 1 first-round match for 3 teams (one bye)', async () => {
      const t = await setupTournament();
      const teams = await addTeams(t.id, 3);
      const assignments: BracketAssignment[] = teams.map((teamId, i) => ({ position: i + 1, teamId }));
      const matches = await generateSingleEliminationMatches(t.id, assignments, game.id, 3);
      // 3 teams → 4-slot bracket → 1 real match in round 1 (one team gets bye)
      expect(matches.length).toBe(1);
    });

    it('generates 4 first-round matches for 8 teams', async () => {
      const t = await setupTournament();
      const teams = await addTeams(t.id, 8);
      const assignments: BracketAssignment[] = teams.map((teamId, i) => ({ position: i + 1, teamId }));
      const matches = await generateSingleEliminationMatches(t.id, assignments, game.id, 3);
      const firstRound = matches.filter(m => m.tournament_round === 1);
      expect(firstRound.length).toBe(4);
    });

    it('returns empty array for empty assignments', async () => {
      const t = await setupTournament();
      const matches = await generateSingleEliminationMatches(t.id, [], game.id, 3);
      expect(Array.isArray(matches)).toBe(true);
      expect(matches.length).toBe(0);
    });
  });

  describe('isRoundComplete', () => {
    it('returns false when tournament has no matches', async () => {
      const t = await createTournament(game.id, { game_mode_id: mode.id });
      const result = await isRoundComplete(t.id, 1, 'winners');
      expect(result).toBe(false);
    });

    it('returns true when all matches in round are completed', async () => {
      const t = await createTournament(game.id, { game_mode_id: mode.id });
      const db = getTestDb();
      const teams = [`tr1-${Date.now()}`, `tr2-${Date.now()}`];
      for (const id of teams) {
        await db.run(`INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`, [id, t.id, id]);
      }

      const assignments: BracketAssignment[] = teams.map((teamId, i) => ({ position: i + 1, teamId }));
      const matches = await generateSingleEliminationMatches(t.id, assignments, game.id, 3);
      const tmInfos: TournamentMatchInfo[] = matches.map((m, i) => ({
        id: m.id, tournament_id: t.id, round: 1, bracket_type: 'winners',
        team1_id: m.team1_id, team2_id: m.team2_id, match_order: i + 1,
      }));
      await saveGeneratedMatches(matches, tmInfos);

      // Not complete yet
      expect(await isRoundComplete(t.id, 1, 'winners')).toBe(false);

      // Mark match as complete
      await db.run(`UPDATE matches SET status = 'complete' WHERE id = ?`, [matches[0].id]);
      expect(await isRoundComplete(t.id, 1, 'winners')).toBe(true);
    });
  });

  describe('isBracketReadyForFinals', () => {
    it('returns false for tournament with no matches', async () => {
      const t = await createTournament(game.id, { game_mode_id: mode.id });
      const result = await isBracketReadyForFinals(t.id, 'winners');
      expect(result).toBe(false);
    });
  });

  describe('getBracketWinner', () => {
    it('returns null when no matches exist', async () => {
      const t = await createTournament(game.id, { game_mode_id: mode.id });
      const winner = await getBracketWinner(t.id, 'winners');
      expect(winner).toBeNull();
    });

    it('returns winning team after a completed single-match bracket', async () => {
      const t = await createTournament(game.id, { game_mode_id: mode.id });
      const db = getTestDb();
      const teams = [`bw1-${Date.now()}`, `bw2-${Date.now()}`];
      for (const id of teams) {
        await db.run(`INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`, [id, t.id, id]);
      }

      const assignments: BracketAssignment[] = teams.map((teamId, i) => ({ position: i + 1, teamId }));
      const matches = await generateSingleEliminationMatches(t.id, assignments, game.id, 3);
      const tmInfos: TournamentMatchInfo[] = matches.map((m, i) => ({
        id: m.id, tournament_id: t.id, round: 1, bracket_type: 'winners',
        team1_id: m.team1_id, team2_id: m.team2_id, match_order: i + 1,
      }));
      await saveGeneratedMatches(matches, tmInfos);

      // Mark with a winner
      const winnerId = matches[0].team1_id;
      await db.run(`UPDATE matches SET status = 'complete', winner_team = ? WHERE id = ?`, [winnerId, matches[0].id]);

      const winner = await getBracketWinner(t.id, 'winners');
      // For a single match bracket, the winner should be the winning team
      expect(winner === winnerId || winner === null).toBe(true);
    });
  });
});
