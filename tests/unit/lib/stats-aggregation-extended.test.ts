import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch, createMatchParticipant } from '../../utils/fixtures';
import type { Database } from '../../../lib/database/connection';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import { aggregateMatchStats } from '@/lib/stats-aggregation';

function asDb(db: ReturnType<typeof getTestDb>): Database {
  return db as unknown as Database;
}

describe('aggregateMatchStats — Extended', () => {
  let game: { id: string };
  let mode: { id: string };

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    vi.clearAllMocks();
  });

  async function insertSubmission(db: ReturnType<typeof getTestDb>, id: string, matchId: string, gameId: string, reviewStatus: string) {
    await db.run(
      `INSERT INTO scorecard_submissions (id, match_id, match_game_id, team_side, screenshot_url, review_status)
       VALUES (?, ?, ?, 'blue', 'http://example.com/img.png', ?)`,
      [id, matchId, gameId, reviewStatus]
    );
  }

  async function insertPlayerStats(
    db: ReturnType<typeof getTestDb>,
    id: string, submissionId: string, matchId: string, matchGameId: string,
    participantId: string, statsJson: string
  ) {
    await db.run(
      `INSERT INTO scorecard_player_stats
         (id, submission_id, match_id, match_game_id, participant_id, extracted_player_name, stats_json)
       VALUES (?, ?, ?, ?, ?, 'Player', ?)`,
      [id, submissionId, matchId, matchGameId, participantId, statsJson]
    );
  }

  describe('zero and empty stat values', () => {
    it('returns 0 for a match with no submissions at all', async () => {
      const match = await createMatch(game.id, mode.id);
      const db = getTestDb();
      const count = await aggregateMatchStats(asDb(db), match.id);
      expect(count).toBe(0);
    });

    it('accumulates zero-value stats correctly', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const p = await createMatchParticipant(match.id, 'disc-zero', 'ZeroPlayer');

      await insertSubmission(db, 'sub-z', match.id, 'g-z', 'approved');
      await insertPlayerStats(db, 'ps-z', 'sub-z', match.id, 'g-z', p.id,
        JSON.stringify({ kills: 0, assists: 0, deaths: 5 }));

      const count = await aggregateMatchStats(asDb(db), match.id);
      expect(count).toBe(1);

      const row = await db.get<{ total_stats_json: string }>(
        `SELECT total_stats_json FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
        [match.id, p.id]
      );
      const stats = JSON.parse(row!.total_stats_json);
      expect(stats.kills).toBe(0);
      expect(stats.assists).toBe(0);
      expect(stats.deaths).toBe(5);
    });

    it('stores empty object when stats_json is {}', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const p = await createMatchParticipant(match.id, 'disc-empty', 'EmptyPlayer');

      await insertSubmission(db, 'sub-emp', match.id, 'g-emp', 'approved');
      await insertPlayerStats(db, 'ps-emp', 'sub-emp', match.id, 'g-emp', p.id, '{}');

      const count = await aggregateMatchStats(asDb(db), match.id);
      expect(count).toBe(1);

      const row = await db.get<{ total_stats_json: string }>(
        `SELECT total_stats_json FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
        [match.id, p.id]
      );
      expect(JSON.parse(row!.total_stats_json)).toEqual({});
    });
  });

  describe('multi-map accumulation', () => {
    it('correctly sums the same stat key across 5 maps', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const p = await createMatchParticipant(match.id, 'disc-5map', 'FiveMapPlayer');

      for (let i = 1; i <= 5; i++) {
        await insertSubmission(db, `sub-5-${i}`, match.id, `g-5-${i}`, 'approved');
        await insertPlayerStats(db, `ps-5-${i}`, `sub-5-${i}`, match.id, `g-5-${i}`, p.id,
          JSON.stringify({ kills: 10, deaths: 2 }));
      }

      await aggregateMatchStats(asDb(db), match.id);

      const row = await db.get<{ total_stats_json: string; maps_played: number }>(
        `SELECT total_stats_json, maps_played FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
        [match.id, p.id]
      );
      const stats = JSON.parse(row!.total_stats_json);
      expect(stats.kills).toBe(50);
      expect(stats.deaths).toBe(10);
      expect(row!.maps_played).toBe(5);
    });

    it('tracks maps_played independently per participant', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const p1 = await createMatchParticipant(match.id, 'disc-mp1', 'P1');
      const p2 = await createMatchParticipant(match.id, 'disc-mp2', 'P2');

      // p1 plays 3 maps, p2 plays only 1
      for (let i = 1; i <= 3; i++) {
        await insertSubmission(db, `sub-mp-${i}`, match.id, `g-mp-${i}`, 'approved');
        await insertPlayerStats(db, `ps-mp1-${i}`, `sub-mp-${i}`, match.id, `g-mp-${i}`, p1.id,
          JSON.stringify({ score: 100 }));
      }
      await insertPlayerStats(db, 'ps-mp2-1', 'sub-mp-1', match.id, 'g-mp-1', p2.id,
        JSON.stringify({ score: 200 }));

      await aggregateMatchStats(asDb(db), match.id);

      const r1 = await db.get<{ maps_played: number }>(
        `SELECT maps_played FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
        [match.id, p1.id]
      );
      const r2 = await db.get<{ maps_played: number }>(
        `SELECT maps_played FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
        [match.id, p2.id]
      );
      expect(r1!.maps_played).toBe(3);
      expect(r2!.maps_played).toBe(1);
    });

    it('does not mix stats between two different matches', async () => {
      const db = getTestDb();
      const m1 = await createMatch(game.id, mode.id);
      const m2 = await createMatch(game.id, mode.id);
      const p1 = await createMatchParticipant(m1.id, 'disc-iso1', 'IsoP1');
      const p2 = await createMatchParticipant(m2.id, 'disc-iso2', 'IsoP2');

      await insertSubmission(db, 'sub-iso1', m1.id, 'g-iso1', 'approved');
      await insertPlayerStats(db, 'ps-iso1', 'sub-iso1', m1.id, 'g-iso1', p1.id,
        JSON.stringify({ kills: 7 }));

      await insertSubmission(db, 'sub-iso2', m2.id, 'g-iso2', 'approved');
      await insertPlayerStats(db, 'ps-iso2', 'sub-iso2', m2.id, 'g-iso2', p2.id,
        JSON.stringify({ kills: 13 }));

      await aggregateMatchStats(asDb(db), m1.id);
      await aggregateMatchStats(asDb(db), m2.id);

      const r1 = await db.get<{ total_stats_json: string }>(
        `SELECT total_stats_json FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
        [m1.id, p1.id]
      );
      const r2 = await db.get<{ total_stats_json: string }>(
        `SELECT total_stats_json FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
        [m2.id, p2.id]
      );
      expect(JSON.parse(r1!.total_stats_json).kills).toBe(7);
      expect(JSON.parse(r2!.total_stats_json).kills).toBe(13);
    });
  });

  describe('malformed and mixed JSON input', () => {
    it('handles one malformed row among valid rows for same participant', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const p = await createMatchParticipant(match.id, 'disc-malformed', 'MixedPlayer');

      await insertSubmission(db, 'sub-m1', match.id, 'g-m1', 'approved');
      await insertSubmission(db, 'sub-m2', match.id, 'g-m2', 'approved');

      await insertPlayerStats(db, 'ps-m1', 'sub-m1', match.id, 'g-m1', p.id,
        JSON.stringify({ kills: 9 }));
      // malformed JSON in second row
      await insertPlayerStats(db, 'ps-m2', 'sub-m2', match.id, 'g-m2', p.id,
        'not valid json at all');

      const count = await aggregateMatchStats(asDb(db), match.id);
      expect(count).toBe(1);

      const row = await db.get<{ total_stats_json: string }>(
        `SELECT total_stats_json FROM match_player_stats WHERE match_id = ?`,
        [match.id]
      );
      // Only valid row contributes; malformed is skipped
      expect(JSON.parse(row!.total_stats_json).kills).toBe(9);
    });

    it('returns 0 when all submissions are non-approved statuses', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      const p = await createMatchParticipant(match.id, 'disc-allbad', 'AllBadPlayer');

      for (const status of ['pending', 'rejected']) {
        await insertSubmission(db, `sub-bad-${status}`, match.id, `g-bad-${status}`, status);
        await insertPlayerStats(db, `ps-bad-${status}`, `sub-bad-${status}`, match.id, `g-bad-${status}`, p.id,
          JSON.stringify({ kills: 99 }));
      }

      const count = await aggregateMatchStats(asDb(db), match.id);
      expect(count).toBe(0);
    });
  });
});
