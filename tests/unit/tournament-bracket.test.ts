import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDb } from '../utils/test-db';
import { seedBasicTestData, createTournament } from '../utils/fixtures';

// Mock database to use test DB instead of production DB
vi.mock('@/lib/database-init', () => ({
  getDbInstance: async () => {
    const { getMockDbInstance } = await import('../mocks/database');
    return getMockDbInstance();
  }
}));

// Mock voice channel service (used by saveGeneratedMatches)
vi.mock('@/lib/voice-channel-service', () => ({
  VoiceChannelService: {
    setupMatchVoiceChannels: vi.fn().mockResolvedValue(undefined)
  }
}));
import {
  calculateTournamentRounds,
  calculateTotalMatches,
  generateSingleEliminationMatches,
  generateNextRoundMatches,
  generateDoubleEliminationMatches,
  generateLosersBracketMatches,
  generateGrandFinalsMatch,
  isRoundComplete,
  getCurrentRoundInfo,
  getBracketWinner,
  saveGeneratedMatches,
  type BracketAssignment,
  type TournamentMatchInfo
} from '@/lib/tournament-bracket';

describe('Tournament Bracket', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;

    // Create maps for the game mode (required by tournament bracket generation)
    const db = getTestDb();
    for (let i = 1; i <= 5; i++) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          [`test-map-${i}`, game.id, mode.id, `Test Map ${i}`],
          (err) => err ? reject(err) : resolve()
        );
      });
    }
  });

  describe('calculateTournamentRounds', () => {
    it('should calculate correct rounds for single elimination', () => {
      expect(calculateTournamentRounds(2, 'single-elimination')).toBe(1);  // 2 teams = 1 round (final)
      expect(calculateTournamentRounds(4, 'single-elimination')).toBe(2);  // 4 teams = 2 rounds (semis + final)
      expect(calculateTournamentRounds(8, 'single-elimination')).toBe(3);  // 8 teams = 3 rounds
      expect(calculateTournamentRounds(16, 'single-elimination')).toBe(4); // 16 teams = 4 rounds
    });

    it('should calculate correct rounds for non-power-of-2 teams', () => {
      expect(calculateTournamentRounds(3, 'single-elimination')).toBe(2);  // 3 teams rounds up to 4
      expect(calculateTournamentRounds(5, 'single-elimination')).toBe(3);  // 5 teams rounds up to 8
      expect(calculateTournamentRounds(6, 'single-elimination')).toBe(3);  // 6 teams rounds up to 8
      expect(calculateTournamentRounds(7, 'single-elimination')).toBe(3);  // 7 teams rounds up to 8
    });

    it('should calculate correct rounds for double elimination', () => {
      // Double elimination: winners bracket rounds + losers bracket rounds + grand final
      // 4 teams: 2 winners rounds + 2 losers rounds + 1 grand final = 5
      expect(calculateTournamentRounds(4, 'double-elimination')).toBe(5);
      // 8 teams: 3 winners rounds + 4 losers rounds + 1 grand final = 8
      expect(calculateTournamentRounds(8, 'double-elimination')).toBe(8);
    });

    it('should handle edge cases', () => {
      expect(calculateTournamentRounds(0, 'single-elimination')).toBe(0);
      expect(calculateTournamentRounds(1, 'single-elimination')).toBe(0);
      expect(calculateTournamentRounds(0, 'double-elimination')).toBe(0);
    });
  });

  describe('calculateTotalMatches', () => {
    it('should calculate correct match count for single elimination', () => {
      expect(calculateTotalMatches(2, 'single-elimination')).toBe(1);  // n-1 matches
      expect(calculateTotalMatches(4, 'single-elimination')).toBe(3);  // 4-1 = 3
      expect(calculateTotalMatches(8, 'single-elimination')).toBe(7);  // 8-1 = 7
      expect(calculateTotalMatches(16, 'single-elimination')).toBe(15);
    });

    it('should calculate correct match count for double elimination', () => {
      // Double elimination: roughly 2n - 2 matches
      expect(calculateTotalMatches(4, 'double-elimination')).toBe(6);  // 2*4 - 2
      expect(calculateTotalMatches(8, 'double-elimination')).toBe(14); // 2*8 - 2
    });

    it('should handle edge cases', () => {
      expect(calculateTotalMatches(0, 'single-elimination')).toBe(0);
      expect(calculateTotalMatches(1, 'single-elimination')).toBe(0);
    });
  });

  describe('generateSingleEliminationMatches', () => {
    it('should generate correct number of first round matches for 4 teams', async () => {
      const tournament = await createTournament(game.id, {
        format: 'single-elimination',
        game_mode_id: mode.id
      });

      const db = getTestDb();

      // Create 4 teams
      const teams: string[] = [];
      for (let i = 1; i <= 4; i++) {
        const teamId = `team-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      const matches = await generateSingleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3 // rounds per match
      );

      expect(matches).toHaveLength(2); // 4 teams = 2 first round matches
      expect(matches[0].tournament_round).toBe(1);
      expect(matches[0].tournament_bracket_type).toBe('winners');
    });

    it('should handle odd number of teams with bye', async () => {
      const tournament = await createTournament(game.id, {
        format: 'single-elimination',
        game_mode_id: mode.id
      });

      const db = getTestDb();

      // Create 3 teams
      const teams: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const teamId = `team-odd-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      const matches = await generateSingleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3
      );

      expect(matches).toHaveLength(1); // 3 teams = 1 match (one team gets bye)
    });

    it('should create matches with correct status and type', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });

      const db = getTestDb();

      const teams: string[] = [];
      for (let i = 1; i <= 2; i++) {
        const teamId = `team-status-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      const matches = await generateSingleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3
      );

      expect(matches[0].status).toBe('assign');
      expect(matches[0].match_type).toBe('tournament');
      expect(matches[0].team1_id).toBeDefined();
      expect(matches[0].team2_id).toBeDefined();
    });
  });

  describe('generateNextRoundMatches', () => {
    it('should generate next round from completed matches', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      const db = getTestDb();

      // Create 4 teams
      const teams: string[] = [];
      for (let i = 1; i <= 4; i++) {
        const teamId = `team-next-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      // Generate and save first round matches
      const firstRoundMatches = await generateSingleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3
      );

      const tournamentMatches: TournamentMatchInfo[] = firstRoundMatches.map((match, index) => ({
        id: match.id,
        tournament_id: tournament.id.toString(),
        round: 1,
        bracket_type: 'winners',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));

      await saveGeneratedMatches(firstRoundMatches, tournamentMatches);

      // Mark matches as complete with winners
      for (let i = 0; i < firstRoundMatches.length; i++) {
        await new Promise<void>((resolve, reject) => {
          db.run(
            `UPDATE matches SET status = 'complete', winner_team = ? WHERE id = ?`,
            [firstRoundMatches[i].team1_id, firstRoundMatches[i].id],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      // Generate next round
      const nextRoundMatches = await generateNextRoundMatches(
        tournament.id.toString(),
        1, // current round
        'winners',
        'single-elimination'
      );

      expect(nextRoundMatches).toHaveLength(1); // 2 winners = 1 match
      expect(nextRoundMatches[0].tournament_round).toBe(2);
    });

    it('should return empty array when only one match completed in bracket', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      const db = getTestDb();

      // Create 2 teams and one match
      const teams: string[] = [];
      for (let i = 1; i <= 2; i++) {
        const teamId = `team-final-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      const firstRoundMatches = await generateSingleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3
      );

      const tournamentMatches: TournamentMatchInfo[] = firstRoundMatches.map((match, index) => ({
        id: match.id,
        tournament_id: tournament.id.toString(),
        round: 1,
        bracket_type: 'winners',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));

      await saveGeneratedMatches(firstRoundMatches, tournamentMatches);

      // Mark match as complete
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE matches SET status = 'complete', winner_team = ? WHERE id = ?`,
          [teams[0], firstRoundMatches[0].id],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Try to generate next round (should be empty - tournament done)
      const nextRoundMatches = await generateNextRoundMatches(
        tournament.id.toString(),
        1,
        'winners',
        'single-elimination'
      );

      expect(nextRoundMatches).toEqual([]);
    });
  });

  describe('generateDoubleEliminationMatches', () => {
    it('should generate same first round as single elimination', async () => {
      const tournament = await createTournament(game.id, {
        format: 'double-elimination',
        game_mode_id: mode.id
      });

      const db = getTestDb();

      const teams: string[] = [];
      for (let i = 1; i <= 4; i++) {
        const teamId = `team-de-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      const matches = await generateDoubleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3
      );

      expect(matches).toHaveLength(2); // Same as single elimination first round
      expect(matches[0].tournament_bracket_type).toBe('winners');
    });
  });

  describe('generateLosersBracketMatches', () => {
    it('should generate losers bracket matches for eliminated teams', async () => {
      const tournament = await createTournament(game.id, {
        format: 'double-elimination',
        game_mode_id: mode.id
      });

      const db = getTestDb();

      // Create 4 teams
      const teams: string[] = [];
      for (let i = 1; i <= 4; i++) {
        const teamId = `team-lb-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      // Simulate 2 teams being eliminated from winners bracket round 1
      const eliminatedTeams = [teams[1], teams[3]]; // Teams 2 and 4 eliminated

      const losersBracketMatches = await generateLosersBracketMatches(
        tournament.id.toString(),
        1, // eliminated from round 1
        eliminatedTeams
      );

      expect(losersBracketMatches).toHaveLength(1); // 2 eliminated teams = 1 match
      expect(losersBracketMatches[0].tournament_bracket_type).toBe('losers');
    });

    it('should return empty array when no teams eliminated', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });

      const losersBracketMatches = await generateLosersBracketMatches(
        tournament.id.toString(),
        1,
        []
      );

      expect(losersBracketMatches).toEqual([]);
    });
  });

  describe('generateGrandFinalsMatch', () => {
    it('should create grand finals match with correct teams', async () => {
      const tournament = await createTournament(game.id, {
        format: 'double-elimination',
        game_mode_id: mode.id
      });

      const db = getTestDb();

      // Create 2 teams
      const wbWinnerId = 'team-wb-winner';
      const lbWinnerId = 'team-lb-winner';

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
          [wbWinnerId, tournament.id, 'Winners Bracket Winner'],
          (err) => err ? reject(err) : resolve()
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
          [lbWinnerId, tournament.id, 'Losers Bracket Winner'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const grandFinalsMatches = await generateGrandFinalsMatch(
        tournament.id.toString(),
        wbWinnerId,
        lbWinnerId
      );

      expect(grandFinalsMatches).toHaveLength(1);
      expect(grandFinalsMatches[0].tournament_bracket_type).toBe('final');
      expect(grandFinalsMatches[0].team1_id).toBe(wbWinnerId);
      expect(grandFinalsMatches[0].team2_id).toBe(lbWinnerId);
      expect(grandFinalsMatches[0].name).toContain('Grand Finals');
    });
  });

  describe('isRoundComplete', () => {
    it('should return true when all matches in round are complete', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      const db = getTestDb();

      // Create 2 teams and 1 match
      const teams: string[] = [];
      for (let i = 1; i <= 2; i++) {
        const teamId = `team-complete-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      const matches = await generateSingleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3
      );

      const tournamentMatches: TournamentMatchInfo[] = matches.map((match, index) => ({
        id: match.id,
        tournament_id: tournament.id.toString(),
        round: 1,
        bracket_type: 'winners',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));

      await saveGeneratedMatches(matches, tournamentMatches);

      // Initially incomplete
      let complete = await isRoundComplete(tournament.id.toString(), 1, 'winners');
      expect(complete).toBe(false);

      // Mark as complete
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE matches SET status = 'complete', winner_team = ? WHERE id = ?`,
          [teams[0], matches[0].id],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Now should be complete
      complete = await isRoundComplete(tournament.id.toString(), 1, 'winners');
      expect(complete).toBe(true);
    });

    it('should return false when matches are incomplete', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });

      const complete = await isRoundComplete(tournament.id.toString(), 1, 'winners');
      expect(complete).toBe(false);
    });
  });

  describe('getCurrentRoundInfo', () => {
    it('should return correct round information', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      const db = getTestDb();

      const teams: string[] = [];
      for (let i = 1; i <= 2; i++) {
        const teamId = `team-info-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      const matches = await generateSingleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3
      );

      const tournamentMatches: TournamentMatchInfo[] = matches.map((match, index) => ({
        id: match.id,
        tournament_id: tournament.id.toString(),
        round: 1,
        bracket_type: 'winners',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));

      await saveGeneratedMatches(matches, tournamentMatches);

      const info = await getCurrentRoundInfo(tournament.id.toString());

      expect(info.maxWinnersRound).toBe(1);
      expect(info.maxLosersRound).toBe(0);
      expect(info.winnersComplete).toBe(false);
    });
  });

  describe('6-team bye team bracket progression', () => {
    it('should correctly handle bye teams in a 6-team single elimination tournament', async () => {
      const tournament = await createTournament(game.id, {
        format: 'single-elimination',
        game_mode_id: mode.id
      });

      const db = getTestDb();

      // Create 6 teams
      const teams: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const teamId = `team-bye6-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      // Step 1: Generate Round 1 — expect 3 matches, 0 byes
      const round1Matches = await generateSingleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3
      );

      expect(round1Matches).toHaveLength(3);

      const round1TournamentMatches: TournamentMatchInfo[] = round1Matches.map((match, index) => ({
        id: match.id,
        tournament_id: tournament.id.toString(),
        round: 1,
        bracket_type: 'winners',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));

      await saveGeneratedMatches(round1Matches, round1TournamentMatches);

      // Verify no byes stored yet
      const byes0 = await db.all(
        `SELECT * FROM tournament_round_byes WHERE tournament_id = ?`,
        [tournament.id.toString()]
      );
      expect(byes0).toHaveLength(0);

      // Step 2: Mark all 3 Round 1 matches complete with winners
      for (const match of round1Matches) {
        await new Promise<void>((resolve, reject) => {
          db.run(
            `UPDATE matches SET status = 'complete', winner_team = ? WHERE id = ?`,
            [match.team1_id, match.id],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      // Step 3: Generate Round 2 — expect 1 match + 1 bye stored
      const round2Matches = await generateNextRoundMatches(
        tournament.id.toString(),
        1,
        'winners',
        'single-elimination'
      );

      expect(round2Matches).toHaveLength(1);
      expect(round2Matches[0].tournament_round).toBe(2);

      // Verify 1 bye was stored for round 2
      const byes2 = await db.all(
        `SELECT * FROM tournament_round_byes WHERE tournament_id = ? AND round = 2 AND bracket_type = 'winners'`,
        [tournament.id.toString()]
      ) as { team_id: string }[];
      expect(byes2).toHaveLength(1);

      const byeTeamId = byes2[0].team_id;

      // Save Round 2 matches
      const round2TournamentMatches: TournamentMatchInfo[] = round2Matches.map((match, index) => ({
        id: match.id,
        tournament_id: tournament.id.toString(),
        round: 2,
        bracket_type: 'winners',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));

      await saveGeneratedMatches(round2Matches, round2TournamentMatches);

      // Step 4: Mark Round 2 match complete
      const round2WinnerId = round2Matches[0].team1_id!;
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE matches SET status = 'complete', winner_team = ? WHERE id = ?`,
          [round2WinnerId, round2Matches[0].id],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Step 5: Generate Round 3 — expect 1 final match (bye team vs Round 2 winner)
      const round3Matches = await generateNextRoundMatches(
        tournament.id.toString(),
        2,
        'winners',
        'single-elimination'
      );

      expect(round3Matches).toHaveLength(1);
      expect(round3Matches[0].tournament_round).toBe(3);

      // Final match should feature the bye team and the round 2 winner
      const finalTeams = [round3Matches[0].team1_id, round3Matches[0].team2_id];
      expect(finalTeams).toContain(byeTeamId);
      expect(finalTeams).toContain(round2WinnerId);

      // Save Round 3 match
      const round3TournamentMatches: TournamentMatchInfo[] = round3Matches.map((match, index) => ({
        id: match.id,
        tournament_id: tournament.id.toString(),
        round: 3,
        bracket_type: 'winners',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));

      await saveGeneratedMatches(round3Matches, round3TournamentMatches);

      // Step 6: Complete final and verify tournament should end (generateNextRoundMatches returns [])
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE matches SET status = 'complete', winner_team = ? WHERE id = ?`,
          [round3Matches[0].team1_id, round3Matches[0].id],
          (err) => err ? reject(err) : resolve()
        );
      });

      const afterFinalMatches = await generateNextRoundMatches(
        tournament.id.toString(),
        3,
        'winners',
        'single-elimination'
      );

      expect(afterFinalMatches).toEqual([]);
    });

    it('should not affect 4-team (power-of-2) tournaments', async () => {
      const tournament = await createTournament(game.id, {
        format: 'single-elimination',
        game_mode_id: mode.id
      });

      const db = getTestDb();

      // Create 4 teams
      const teams: string[] = [];
      for (let i = 1; i <= 4; i++) {
        const teamId = `team-pow2-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      // Round 1: 2 matches
      const round1Matches = await generateSingleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3
      );

      expect(round1Matches).toHaveLength(2);

      const round1TournamentMatches: TournamentMatchInfo[] = round1Matches.map((match, index) => ({
        id: match.id,
        tournament_id: tournament.id.toString(),
        round: 1,
        bracket_type: 'winners',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));

      await saveGeneratedMatches(round1Matches, round1TournamentMatches);

      // Mark both complete
      for (const match of round1Matches) {
        await new Promise<void>((resolve, reject) => {
          db.run(
            `UPDATE matches SET status = 'complete', winner_team = ? WHERE id = ?`,
            [match.team1_id, match.id],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      // Round 2: 1 final match, 0 byes
      const round2Matches = await generateNextRoundMatches(
        tournament.id.toString(),
        1,
        'winners',
        'single-elimination'
      );

      expect(round2Matches).toHaveLength(1);
      expect(round2Matches[0].tournament_round).toBe(2);

      // No byes stored
      const byes = await db.all(
        `SELECT * FROM tournament_round_byes WHERE tournament_id = ?`,
        [tournament.id.toString()]
      );
      expect(byes).toHaveLength(0);

      // Save and complete the final
      const round2TournamentMatches: TournamentMatchInfo[] = round2Matches.map((match, index) => ({
        id: match.id,
        tournament_id: tournament.id.toString(),
        round: 2,
        bracket_type: 'winners',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));

      await saveGeneratedMatches(round2Matches, round2TournamentMatches);

      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE matches SET status = 'complete', winner_team = ? WHERE id = ?`,
          [round2Matches[0].team1_id, round2Matches[0].id],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Should return empty (tournament over)
      const afterFinal = await generateNextRoundMatches(
        tournament.id.toString(),
        2,
        'winners',
        'single-elimination'
      );

      expect(afterFinal).toEqual([]);
    });
  });

  describe('getBracketWinner', () => {
    it('should return winner of the bracket', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      const db = getTestDb();

      const teams: string[] = [];
      for (let i = 1; i <= 2; i++) {
        const teamId = `team-winner-${i}`;
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`,
            [teamId, tournament.id, `Team ${i}`],
            (err) => err ? reject(err) : resolve()
          );
        });
        teams.push(teamId);
      }

      const bracketAssignments: BracketAssignment[] = teams.map((teamId, index) => ({
        position: index + 1,
        teamId
      }));

      const matches = await generateSingleEliminationMatches(
        tournament.id.toString(),
        bracketAssignments,
        game.id,
        3
      );

      const tournamentMatches: TournamentMatchInfo[] = matches.map((match, index) => ({
        id: match.id,
        tournament_id: tournament.id.toString(),
        round: 1,
        bracket_type: 'winners',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));

      await saveGeneratedMatches(matches, tournamentMatches);

      // Mark match as complete with winner
      const winnerId = teams[0];
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE matches SET status = 'complete', winner_team = ? WHERE id = ?`,
          [winnerId, matches[0].id],
          (err) => err ? reject(err) : resolve()
        );
      });

      const bracketWinner = await getBracketWinner(tournament.id.toString(), 'winners');
      expect(bracketWinner).toBe(winnerId);
    });

    it('should return null when no winner yet', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });

      const winner = await getBracketWinner(tournament.id.toString(), 'winners');
      expect(winner).toBeNull();
    });
  });
});
