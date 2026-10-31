import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/scoring-functions', () => ({
  queueScoreNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/stats-aggregation', () => ({
  aggregateMatchStats: vi.fn().mockResolvedValue(0),
}));

import { GET as getSubmissions } from '@/app/api/matches/[matchId]/scorecard/route';
import {
  GET as getSubmission,
  DELETE as deleteSubmission,
} from '@/app/api/matches/[matchId]/scorecard/[submissionId]/route';
import { PUT as assignParticipants } from '@/app/api/matches/[matchId]/scorecard/[submissionId]/assign/route';
import { POST as retrySubmission } from '@/app/api/matches/[matchId]/scorecard/[submissionId]/retry/route';
import { PUT as reviewSubmission } from '@/app/api/matches/[matchId]/scorecard/[submissionId]/review/route';

function makeJsonRequest(body: unknown): Request {
  return new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request;
}

describe('Scorecard Submission Routes', () => {
  let matchId: string;
  let submissionId: string;

  beforeEach(async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id);
    matchId = match.id;

    const db = getTestDb();
    submissionId = `sub-${Date.now()}`;
    await db.run(
      `INSERT INTO scorecard_submissions (id, match_id, match_game_id, team_side, screenshot_url)
       VALUES (?, ?, 'game1', 'blue', '/uploads/scorecards/test.png')`,
      [submissionId, matchId]
    );
  });

  describe('GET /api/matches/[matchId]/scorecard', () => {
    it('returns empty array when no submissions exist for a different match', async () => {
      const { game, mode } = await seedBasicTestData();
      const otherMatch = await createMatch(game.id, mode.id);
      const req = { url: `http://localhost/api/matches/${otherMatch.id}/scorecard` } as any;
      const res = await getSubmissions(req, createRouteParams({ matchId: otherMatch.id }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });

    it('returns submissions for the match', async () => {
      const req = { url: `http://localhost/api/matches/${matchId}/scorecard` } as any;
      const res = await getSubmissions(req, createRouteParams({ matchId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].id).toBe(submissionId);
      expect(Array.isArray(body[0].playerStats)).toBe(true);
    });

    it('filters by matchGameId when provided', async () => {
      const db = getTestDb();
      const otherId = `sub-other-${Date.now()}`;
      await db.run(
        `INSERT INTO scorecard_submissions (id, match_id, match_game_id, team_side, screenshot_url)
         VALUES (?, ?, 'game2', 'red', '/uploads/scorecards/test2.png')`,
        [otherId, matchId]
      );

      const req = { url: `http://localhost/api/matches/${matchId}/scorecard?matchGameId=game1` } as any;
      const res = await getSubmissions(req, createRouteParams({ matchId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.every((s: { match_game_id: string }) => s.match_game_id === 'game1')).toBe(true);
    });
  });

  describe('GET /api/matches/[matchId]/scorecard/[submissionId]', () => {
    it('returns the submission with player stats', async () => {
      const res = await getSubmission({} as any, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(submissionId);
      expect(Array.isArray(body.playerStats)).toBe(true);
    });

    it('returns 404 for unknown submission', async () => {
      const res = await getSubmission({} as any, createRouteParams({ matchId, submissionId: 'nonexistent' }));
      expect(res.status).toBe(404);
    });

    it('returns 404 when submissionId belongs to a different match', async () => {
      const { game, mode } = await seedBasicTestData();
      const otherMatch = await createMatch(game.id, mode.id);
      const res = await getSubmission({} as any, createRouteParams({ matchId: otherMatch.id, submissionId }));
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/matches/[matchId]/scorecard/[submissionId]', () => {
    it('deletes the submission and returns success', async () => {
      const res = await deleteSubmission({} as any, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const db = getTestDb();
      const row = await db.get('SELECT id FROM scorecard_submissions WHERE id = ?', [submissionId]);
      expect(row).toBeUndefined();
    });

    it('returns 404 for unknown submission', async () => {
      const res = await deleteSubmission({} as any, createRouteParams({ matchId, submissionId: 'ghost' }));
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/matches/[matchId]/scorecard/[submissionId]/assign', () => {
    it('returns 400 when assignments array is missing', async () => {
      const req = makeJsonRequest({}) as any;
      const res = await assignParticipants(req, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/assignments/i);
    });

    it('returns 400 when assignments is empty', async () => {
      const req = makeJsonRequest({ assignments: [] }) as any;
      const res = await assignParticipants(req, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(400);
    });

    it('returns 404 when submission does not exist', async () => {
      const req = makeJsonRequest({ assignments: [{ playerStatId: 'p1', participantId: 'user1' }] }) as any;
      const res = await assignParticipants(req, createRouteParams({ matchId, submissionId: 'nope' }));
      expect(res.status).toBe(404);
    });

    it('assigns participants successfully', async () => {
      const db = getTestDb();
      const statId = `stat-${Date.now()}`;
      await db.run(
        `INSERT INTO scorecard_player_stats
           (id, submission_id, match_id, match_game_id, participant_id, extracted_player_name, stats_json)
         VALUES (?, ?, ?, 'game1', 'p1', 'PlayerOne', '{}')`,
        [statId, submissionId, matchId]
      );

      const req = makeJsonRequest({ assignments: [{ playerStatId: statId, participantId: 'p1' }] }) as any;
      const res = await assignParticipants(req, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('POST /api/matches/[matchId]/scorecard/[submissionId]/retry', () => {
    it('returns 404 for unknown submission', async () => {
      const res = await retrySubmission({} as any, createRouteParams({ matchId, submissionId: 'nope' }));
      expect(res.status).toBe(404);
    });

    it('returns 400 when submission is not in failed state', async () => {
      // Default ai_extraction_status is 'pending', not 'failed'
      const res = await retrySubmission({} as any, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/failed/i);
    });

    it('resets a failed submission to pending and returns success', async () => {
      const db = getTestDb();
      await db.run(
        `UPDATE scorecard_submissions SET ai_extraction_status = 'failed' WHERE id = ?`,
        [submissionId]
      );

      const res = await retrySubmission({} as any, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const row = await db.get<{ ai_extraction_status: string }>(
        'SELECT ai_extraction_status FROM scorecard_submissions WHERE id = ?',
        [submissionId]
      );
      expect(row?.ai_extraction_status).toBe('pending');
    });
  });

  describe('PUT /api/matches/[matchId]/scorecard/[submissionId]/review', () => {
    it('returns 400 for invalid status', async () => {
      const req = makeJsonRequest({ status: 'unknown' }) as any;
      const res = await reviewSubmission(req, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/approved|rejected/i);
    });

    it('returns 400 when status is missing', async () => {
      const req = makeJsonRequest({}) as any;
      const res = await reviewSubmission(req, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown submission', async () => {
      const req = makeJsonRequest({ status: 'approved' }) as any;
      const res = await reviewSubmission(req, createRouteParams({ matchId, submissionId: 'ghost' }));
      expect(res.status).toBe(404);
    });

    it('approves a submission', async () => {
      const req = makeJsonRequest({ status: 'approved' }) as any;
      const res = await reviewSubmission(req, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const db = getTestDb();
      const row = await db.get<{ review_status: string }>(
        'SELECT review_status FROM scorecard_submissions WHERE id = ?',
        [submissionId]
      );
      expect(row?.review_status).toBe('approved');
    });

    it('rejects a submission', async () => {
      const req = makeJsonRequest({ status: 'rejected' }) as any;
      const res = await reviewSubmission(req, createRouteParams({ matchId, submissionId }));
      expect(res.status).toBe(200);

      const db = getTestDb();
      const row = await db.get<{ review_status: string }>(
        'SELECT review_status FROM scorecard_submissions WHERE id = ?',
        [submissionId]
      );
      expect(row?.review_status).toBe('rejected');
    });
  });
});
