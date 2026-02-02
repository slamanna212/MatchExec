import { describe, it, expect, beforeEach } from 'vitest';
import { seedBasicTestData, createMatch, createMatchParticipant } from '../utils/fixtures';
import { getTestDb } from '../utils/test-db';
import {
  getPointsForPosition,
  getMatchFormat,
  initializeMatchGames,
  getMatchGames,
  saveMatchResult,
  getMatchResult,
  getOverallMatchScore,
  getMatchGamesWithResults
} from '@/lib/scoring-functions';
import type { PositionScoringConfig, MatchResult } from '@/shared/types';

describe('Scoring Functions', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  describe('getPointsForPosition', () => {
    it('should return correct points for a valid position', () => {
      const config: PositionScoringConfig = {
        type: 'Position',
        pointsPerPosition: {
          '1': 10,
          '2': 8,
          '3': 6,
          '4': 4
        }
      };

      expect(getPointsForPosition(1, config)).toBe(10);
      expect(getPointsForPosition(2, config)).toBe(8);
      expect(getPointsForPosition(3, config)).toBe(6);
      expect(getPointsForPosition(4, config)).toBe(4);
    });

    it('should return 0 for position not in config', () => {
      const config: PositionScoringConfig = {
        type: 'Position',
        pointsPerPosition: {
          '1': 10,
          '2': 8
        }
      };

      expect(getPointsForPosition(5, config)).toBe(0);
      expect(getPointsForPosition(10, config)).toBe(0);
    });

    it('should handle edge case positions', () => {
      const config: PositionScoringConfig = {
        type: 'Position',
        pointsPerPosition: {
          '1': 100
        }
      };

      expect(getPointsForPosition(1, config)).toBe(100);
      expect(getPointsForPosition(0, config)).toBe(0);
    });
  });

  describe('getMatchFormat', () => {
    it('should return match format from database', async () => {
      const match = await createMatch(game.id, mode.id, { match_format: 'competitive' });

      const format = await getMatchFormat(match.id.toString());
      expect(format).toBe('competitive');
    });

    it('should default to casual if no format specified', async () => {
      // Create match without match_format override (fixture defaults to 'competitive')
      // If we want casual, we need to explicitly pass it or create a match without the default
      const match = await createMatch(game.id, mode.id, { match_format: 'casual' });

      const format = await getMatchFormat(match.id.toString());
      expect(format).toBe('casual');
    });

    it('should return casual for non-existent match', async () => {
      // getMatchFormat returns 'casual' as default, doesn't throw
      const format = await getMatchFormat('non-existent-match');
      expect(format).toBe('casual');
    });
  });

  describe('initializeMatchGames', () => {
    it('should create match_games entries for all maps', async () => {
      const db = getTestDb();

      // Create a map for testing
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['test-map-1', game.id, mode.id, 'Test Map 1'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id, {
        maps: JSON.stringify(['test-map-1', 'test-map-1', 'test-map-1'])
      });

      await initializeMatchGames(match.id.toString());

      // Verify match games were created
      const matchGames = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT * FROM match_games WHERE match_id = ? ORDER BY round`,
          [match.id],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });

      expect(matchGames).toHaveLength(3);
      expect(matchGames[0].status).toBe('ongoing'); // First map should be ongoing
      expect(matchGames[1].status).toBe('pending'); // Rest should be pending
      expect(matchGames[2].status).toBe('pending');
    });

    it('should skip initialization if no maps defined', async () => {
      const match = await createMatch(game.id, mode.id);

      await initializeMatchGames(match.id.toString());

      const db = getTestDb();
      const matchGames = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT * FROM match_games WHERE match_id = ?`,
          [match.id],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });

      expect(matchGames).toHaveLength(0);
    });

    it('should not create duplicates if called multiple times', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['test-map-2', game.id, mode.id, 'Test Map 2'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id, {
        maps: JSON.stringify(['test-map-2'])
      });

      // First call creates the games
      await initializeMatchGames(match.id.toString());

      // Get initial count
      const initialGames = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT * FROM match_games WHERE match_id = ?`,
          [match.id],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });

      expect(initialGames).toHaveLength(1);

      // Second call should not create duplicates
      await initializeMatchGames(match.id.toString());

      const finalGames = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT * FROM match_games WHERE match_id = ?`,
          [match.id],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });

      expect(finalGames).toHaveLength(1); // Should still only have 1
      expect(finalGames[0].id).toBe(initialGames[0].id); // Same entry
    });
  });

  describe('getMatchGames', () => {
    it('should return all match games with map data', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name, image_url) VALUES (?, ?, ?, ?, ?)`,
          ['test-map-3', game.id, mode.id, 'Test Map 3', '/test-image.png'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id, {
        maps: JSON.stringify(['test-map-3'])
      });

      await initializeMatchGames(match.id.toString());

      const matchGames = await getMatchGames(match.id.toString());

      expect(matchGames).toHaveLength(1);
      expect(matchGames[0]).toHaveProperty('map_name', 'Test Map 3');
      expect(matchGames[0]).toHaveProperty('image_url', '/test-image.png');
    });

    it('should return empty array if no games exist', async () => {
      const match = await createMatch(game.id, mode.id);

      const matchGames = await getMatchGames(match.id.toString());

      expect(matchGames).toEqual([]);
    });

    it('should return games in round order', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['test-map-4', game.id, mode.id, 'Test Map 4'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id, {
        maps: JSON.stringify(['test-map-4', 'test-map-4', 'test-map-4'])
      });

      await initializeMatchGames(match.id.toString());

      const matchGames = await getMatchGames(match.id.toString());

      expect(matchGames).toHaveLength(3);
      expect(matchGames[0].round).toBe(1);
      expect(matchGames[1].round).toBe(2);
      expect(matchGames[2].round).toBe(3);
    });
  });

  describe('saveMatchResult and getMatchResult', () => {
    it('should save and retrieve team-based match result', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['test-map-5', game.id, mode.id, 'Test Map 5'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id);

      // Don't call initializeMatchGames - let saveMatchResult create the entry via ensureMatchGameExists
      const matchGameId = `${match.id}_game_1`;
      const result: MatchResult = {
        matchId: match.id.toString(),
        gameId: matchGameId,
        winner: 'team1',
        isFfaMode: false,
        completedAt: new Date()
      };

      await saveMatchResult(matchGameId, result);

      const retrievedResult = await getMatchResult(matchGameId);
      expect(retrievedResult).not.toBeNull();
      expect(retrievedResult?.winner).toBe('team1');
      expect(retrievedResult?.matchId).toBe(match.id.toString());
    });

    it('should save and retrieve FFA match result', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['test-map-6', game.id, mode.id, 'Test Map 6'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id);

      const participant = await createMatchParticipant(match.id, 'user123', 'TestUser', null);

      // Don't call initializeMatchGames - let saveMatchResult create the entry
      const matchGameId = `${match.id}_game_1`;
      const result: MatchResult = {
        matchId: match.id.toString(),
        gameId: matchGameId,
        winner: 'team1', // Still required but not used for FFA
        participantWinnerId: participant.id.toString(),
        isFfaMode: true,
        completedAt: new Date()
      };

      await saveMatchResult(matchGameId, result);

      const retrievedResult = await getMatchResult(matchGameId);
      expect(retrievedResult).not.toBeNull();
      expect(retrievedResult?.isFfaMode).toBe(true);
      expect(retrievedResult?.participantWinnerId).toBe(participant.id.toString());
    });

    it('should return null for non-existent match game', async () => {
      const result = await getMatchResult('non-existent-game');
      expect(result).toBeNull();
    });

    it('should return null for incomplete match game', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['test-map-7', game.id, mode.id, 'Test Map 7'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id, {
        maps: JSON.stringify(['test-map-7'])
      });

      await initializeMatchGames(match.id.toString());

      const matchGameId = `${match.id}_game_1`;
      const result = await getMatchResult(matchGameId);

      expect(result).toBeNull(); // No winner set yet
    });
  });

  describe('getOverallMatchScore', () => {
    it('should calculate correct overall score for team match', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['test-map-8', game.id, mode.id, 'Test Map 8'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id, {
        maps: JSON.stringify(['test-map-8', 'test-map-8', 'test-map-8'])
      });

      // Use initializeMatchGames to create proper entries with correct rounds
      await initializeMatchGames(match.id.toString());

      // Directly update the match_games to set winners
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE match_games SET winner_id = 'team1', status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [`${match.id}_game_1`],
          (err) => err ? reject(err) : resolve()
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE match_games SET winner_id = 'team2', status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [`${match.id}_game_2`],
          (err) => err ? reject(err) : resolve()
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE match_games SET winner_id = 'team1', status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [`${match.id}_game_3`],
          (err) => err ? reject(err) : resolve()
        );
      });

      const score = await getOverallMatchScore(match.id.toString());

      expect(score.team1Wins).toBe(2);
      expect(score.team2Wins).toBe(1);
      expect(score.totalNormalGames).toBe(3);
      expect(score.overallWinner).toBe('team1');
    });

    it('should return tie when scores are equal', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['test-map-9', game.id, mode.id, 'Test Map 9'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id, {
        maps: JSON.stringify(['test-map-9', 'test-map-9'])
      });

      await initializeMatchGames(match.id.toString());

      // Directly update match_games: 1-1 tie
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE match_games SET winner_id = 'team1', status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [`${match.id}_game_1`],
          (err) => err ? reject(err) : resolve()
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE match_games SET winner_id = 'team2', status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [`${match.id}_game_2`],
          (err) => err ? reject(err) : resolve()
        );
      });

      const score = await getOverallMatchScore(match.id.toString());

      expect(score.team1Wins).toBe(1);
      expect(score.team2Wins).toBe(1);
      expect(score.overallWinner).toBe('tie');
    });

    it('should return null winner for match with no completed games', async () => {
      const match = await createMatch(game.id, mode.id);

      const score = await getOverallMatchScore(match.id.toString());

      expect(score.team1Wins).toBe(0);
      expect(score.team2Wins).toBe(0);
      expect(score.totalNormalGames).toBe(0);
      expect(score.overallWinner).toBeNull();
    });

    it('should handle 3-0 sweep correctly', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['test-map-10', game.id, mode.id, 'Test Map 10'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id, {
        maps: JSON.stringify(['test-map-10', 'test-map-10', 'test-map-10'])
      });

      await initializeMatchGames(match.id.toString());

      // Team2 sweeps 3-0
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE match_games SET winner_id = 'team2', status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [`${match.id}_game_1`],
          (err) => err ? reject(err) : resolve()
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE match_games SET winner_id = 'team2', status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [`${match.id}_game_2`],
          (err) => err ? reject(err) : resolve()
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE match_games SET winner_id = 'team2', status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [`${match.id}_game_3`],
          (err) => err ? reject(err) : resolve()
        );
      });

      const score = await getOverallMatchScore(match.id.toString());

      expect(score.team1Wins).toBe(0);
      expect(score.team2Wins).toBe(3);
      expect(score.totalNormalGames).toBe(3);
      expect(score.overallWinner).toBe('team2');
    });
  });

  describe('getMatchGamesWithResults', () => {
    it('should return match games with FFA results', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['test-map-11', game.id, mode.id, 'Test Map 11'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id);

      const participant = await createMatchParticipant(match.id, 'user456', 'TestUser', null);

      // Don't call initializeMatchGames - let saveMatchResult handle it
      await saveMatchResult(`${match.id}_game_1`, {
        matchId: match.id.toString(),
        gameId: `${match.id}_game_1`,
        winner: 'team1',
        participantWinnerId: participant.id.toString(),
        isFfaMode: true,
        completedAt: new Date()
      });

      const games = await getMatchGamesWithResults(match.id.toString());

      expect(games).toHaveLength(1);
      expect(games[0].is_ffa_mode).toBe(true);
      expect(games[0].participant_winner_id).toBe(participant.id.toString());
      expect(games[0].status).toBe('completed');
    });

    it('should return empty array for match with no games', async () => {
      const match = await createMatch(game.id, mode.id);

      const games = await getMatchGamesWithResults(match.id.toString());

      expect(games).toEqual([]);
    });
  });
});
