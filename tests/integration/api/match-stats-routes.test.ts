import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as generateImages } from '@/app/api/matches/[matchId]/stats/generate-images/route';
import { GET as perMap } from '@/app/api/matches/[matchId]/stats/per-map/route';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

describe('Match Stats Routes', () => {
  let matchId: string;

  beforeEach(async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id);
    matchId = match.id;
  });

  describe('GET /api/matches/[matchId]/stats/per-map', () => {
    it('returns empty array when no scorecard stats exist', async () => {
      const req = {} as any;
      const res = await perMap(req, createRouteParams({ matchId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });

    it('returns approved stats for the match', async () => {
      const db = getTestDb();
      // Insert a submission and stat row
      const subId = `sub-${  matchId}`;
      await db.run(
        `INSERT INTO scorecard_submissions
           (id, match_id, match_game_id, team_side, screenshot_url, review_status)
         VALUES (?, ?, 'game1', 'blue', 'http://img.test', 'approved')`,
        [subId, matchId]
      );
      await db.run(
        `INSERT INTO scorecard_player_stats
           (id, submission_id, match_id, match_game_id, participant_id, extracted_player_name, stats_json)
         VALUES (?, ?, ?, 'game1', 'p1', 'PlayerOne', '{"kills":5}')`,
        [`stat-${  matchId}`, subId, matchId]
      );

      const req = {} as any;
      const res = await perMap(req, createRouteParams({ matchId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].participant_id).toBe('p1');
    });

    it('does not return stats for non-approved submissions', async () => {
      const db = getTestDb();
      const subId = `sub-pending-${  matchId}`;
      await db.run(
        `INSERT INTO scorecard_submissions
           (id, match_id, match_game_id, team_side, screenshot_url, review_status)
         VALUES (?, ?, 'game1', 'blue', 'http://img.test', 'pending')`,
        [subId, matchId]
      );
      await db.run(
        `INSERT INTO scorecard_player_stats
           (id, submission_id, match_id, match_game_id, participant_id, extracted_player_name, stats_json)
         VALUES (?, ?, ?, 'game1', 'p1', 'PlayerOne', '{"kills":5}')`,
        [`stat-pend-${  matchId}`, subId, matchId]
      );

      const req = {} as any;
      const res = await perMap(req, createRouteParams({ matchId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(0);
    });

    it('does not return stats for a different match', async () => {
      const { game, mode } = await seedBasicTestData();
      const otherMatch = await createMatch(game.id, mode.id);
      const db = getTestDb();

      const subId = `sub-other-${  otherMatch.id}`;
      await db.run(
        `INSERT INTO scorecard_submissions
           (id, match_id, match_game_id, team_side, screenshot_url, review_status)
         VALUES (?, ?, 'game1', 'blue', 'http://img.test', 'approved')`,
        [subId, otherMatch.id]
      );
      await db.run(
        `INSERT INTO scorecard_player_stats
           (id, submission_id, match_id, match_game_id, participant_id, extracted_player_name, stats_json)
         VALUES (?, ?, ?, 'game1', 'p1', 'PlayerOne', '{"kills":5}')`,
        [`stat-other-${  otherMatch.id}`, subId, otherMatch.id]
      );

      const req = {} as any;
      const res = await perMap(req, createRouteParams({ matchId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(0);
    });
  });

  describe('POST /api/matches/[matchId]/stats/generate-images', () => {
    it('inserts a pending row into stats_image_queue and returns queueId', async () => {
      const req = {} as any;
      const res = await generateImages(req, createRouteParams({ matchId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.queueId).toBeTruthy();

      const db = getTestDb();
      const row = await db.get<{ match_id: string; status: string }>(
        `SELECT match_id, status FROM stats_image_queue WHERE id = ?`,
        [body.queueId]
      );
      expect(row?.match_id).toBe(matchId);
      expect(row?.status).toBe('pending');
    });

    it('creates a unique queueId for each call', async () => {
      const req = {} as any;
      const [res1, res2] = await Promise.all([
        generateImages(req, createRouteParams({ matchId })),
        generateImages(req, createRouteParams({ matchId })),
      ]);
      const [b1, b2] = await Promise.all([res1.json(), res2.json()]);
      expect(b1.queueId).not.toBe(b2.queueId);
    });
  });
});
