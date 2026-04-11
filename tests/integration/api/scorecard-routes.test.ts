import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

import { GET as getSubmission, DELETE as deleteSubmission } from '@/app/api/matches/[matchId]/scorecard/[submissionId]/route';
import { PUT as reviewSubmission } from '@/app/api/matches/[matchId]/scorecard/[submissionId]/review/route';
import { PUT as assignSubmission } from '@/app/api/matches/[matchId]/scorecard/[submissionId]/assign/route';
import { POST as retrySubmission } from '@/app/api/matches/[matchId]/scorecard/[submissionId]/retry/route';
import { GET as getScorecard } from '@/app/api/matches/[matchId]/scorecard/route';
import { GET as getGameResult, POST as postGameResult } from '@/app/api/matches/[matchId]/games/[gameId]/result/route';
import { GET as getStats } from '@/app/api/stats/route';

async function insertSubmission(db: any, matchId: string, opts: {
  id?: string;
  matchGameId?: string;
  teamSide?: string;
  status?: string;
  aiStatus?: string;
} = {}) {
  const id = opts.id ?? `sub-${Date.now()}`;
  await db.run(
    `INSERT INTO scorecard_submissions (id, match_id, match_game_id, team_side, screenshot_url, review_status, ai_extraction_status)
     VALUES (?, ?, ?, ?, '/test.png', ?, ?)`,
    [id, matchId, opts.matchGameId ?? 'mg-1', opts.teamSide ?? 'blue',
     opts.status ?? 'pending', opts.aiStatus ?? 'pending']
  );
  return id;
}

describe('Scorecard Routes', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
  });

  // ─── GET /api/matches/[matchId]/scorecard ────────────────────────────────────

  describe('GET /api/matches/[matchId]/scorecard', () => {
    it('returns empty array when no submissions', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('GET', `/api/matches/${match.id}/scorecard`);
      const response = await getScorecard(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('returns submissions with playerStats', async () => {
      const match = await createMatch(game.id, mode.id);
      const subId = await insertSubmission(db, match.id);

      const request = createMockRequest('GET', `/api/matches/${match.id}/scorecard`);
      const response = await getScorecard(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.length).toBe(1);
      expect(data[0].id).toBe(subId);
      expect(Array.isArray(data[0].playerStats)).toBe(true);
    });

    it('filters by matchGameId query param', async () => {
      const match = await createMatch(game.id, mode.id);
      await insertSubmission(db, match.id, { id: 'sub-a', matchGameId: 'mg-1' });
      await insertSubmission(db, match.id, { id: 'sub-b', matchGameId: 'mg-2' });

      const request = createMockRequest('GET', `/api/matches/${match.id}/scorecard?matchGameId=mg-1`);
      const response = await getScorecard(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.every((s: any) => s.match_game_id === 'mg-1')).toBe(true);
    });
  });

  // ─── GET /api/matches/[matchId]/scorecard/[submissionId] ─────────────────────

  describe('GET /api/matches/[matchId]/scorecard/[submissionId]', () => {
    it('returns 404 for nonexistent submission', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = new Request('http://localhost/');
      const response = await getSubmission(request, createRouteParams({ matchId: match.id, submissionId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns submission with playerStats', async () => {
      const match = await createMatch(game.id, mode.id);
      const subId = await insertSubmission(db, match.id);

      const request = new Request('http://localhost/');
      const response = await getSubmission(request, createRouteParams({ matchId: match.id, submissionId: subId }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.id).toBe(subId);
      expect(Array.isArray(data.playerStats)).toBe(true);
    });
  });

  // ─── DELETE /api/matches/[matchId]/scorecard/[submissionId] ──────────────────

  describe('DELETE /api/matches/[matchId]/scorecard/[submissionId]', () => {
    it('returns 404 for nonexistent submission', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = new Request('http://localhost/');
      const response = await deleteSubmission(request, createRouteParams({ matchId: match.id, submissionId: 'nope' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('deletes the submission and returns success', async () => {
      const match = await createMatch(game.id, mode.id);
      const subId = await insertSubmission(db, match.id);

      const request = new Request('http://localhost/');
      const response = await deleteSubmission(request, createRouteParams({ matchId: match.id, submissionId: subId }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const row = await db.get('SELECT id FROM scorecard_submissions WHERE id = ?', [subId]);
      expect(row).toBeUndefined();
    });
  });

  // ─── PUT /api/matches/[matchId]/scorecard/[submissionId]/review ──────────────

  describe('PUT /api/matches/[matchId]/scorecard/[submissionId]/review', () => {
    it('returns 400 for invalid status', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('PUT', '/', { status: 'invalid' });
      const response = await reviewSubmission(request, createRouteParams({ matchId: match.id, submissionId: 'any' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 404 for nonexistent submission', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('PUT', '/', { status: 'approved' });
      const response = await reviewSubmission(request, createRouteParams({ matchId: match.id, submissionId: 'nope' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('approves a submission', async () => {
      const match = await createMatch(game.id, mode.id);
      const subId = await insertSubmission(db, match.id);

      const request = createMockRequest('PUT', '/', { status: 'approved' });
      const response = await reviewSubmission(request, createRouteParams({ matchId: match.id, submissionId: subId }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const row = await db.get('SELECT review_status FROM scorecard_submissions WHERE id = ?', [subId]);
      expect(row.review_status).toBe('approved');
    });

    it('rejects a submission', async () => {
      const match = await createMatch(game.id, mode.id);
      const subId = await insertSubmission(db, match.id);

      const request = createMockRequest('PUT', '/', { status: 'rejected' });
      const response = await reviewSubmission(request, createRouteParams({ matchId: match.id, submissionId: subId }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const row = await db.get('SELECT review_status FROM scorecard_submissions WHERE id = ?', [subId]);
      expect(row.review_status).toBe('rejected');
    });
  });

  // ─── PUT /api/matches/[matchId]/scorecard/[submissionId]/assign ──────────────

  describe('PUT /api/matches/[matchId]/scorecard/[submissionId]/assign', () => {
    it('returns 400 when assignments is missing', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('PUT', '/', {});
      const response = await assignSubmission(request, createRouteParams({ matchId: match.id, submissionId: 'any' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when assignments is empty array', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('PUT', '/', { assignments: [] });
      const response = await assignSubmission(request, createRouteParams({ matchId: match.id, submissionId: 'any' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 404 for nonexistent submission', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('PUT', '/', {
        assignments: [{ playerStatId: 'ps1', participantId: 'p1' }],
      });
      const response = await assignSubmission(request, createRouteParams({ matchId: match.id, submissionId: 'nope' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('assigns participants and returns success', async () => {
      const match = await createMatch(game.id, mode.id);
      const subId = await insertSubmission(db, match.id);

      // Insert a player stat
      await db.run(
        `INSERT INTO scorecard_player_stats (id, submission_id, match_id, match_game_id, team_side, extracted_player_name, stats_json)
         VALUES ('ps1', ?, ?, 'mg-1', 'blue', 'TestPlayer', '{}')`,
        [subId, match.id]
      );

      const request = createMockRequest('PUT', '/', {
        assignments: [{ playerStatId: 'ps1', participantId: 'p-abc' }],
      });
      const response = await assignSubmission(request, createRouteParams({ matchId: match.id, submissionId: subId }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const row = await db.get('SELECT participant_id FROM scorecard_player_stats WHERE id = ?', ['ps1']);
      expect(row.participant_id).toBe('p-abc');
    });
  });

  // ─── POST /api/matches/[matchId]/scorecard/[submissionId]/retry ──────────────

  describe('POST /api/matches/[matchId]/scorecard/[submissionId]/retry', () => {
    it('returns 404 for nonexistent submission', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = new Request('http://localhost/');
      const response = await retrySubmission(request as any, createRouteParams({ matchId: match.id, submissionId: 'nope' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns 400 when submission is not in failed state', async () => {
      const match = await createMatch(game.id, mode.id);
      const subId = await insertSubmission(db, match.id, { aiStatus: 'pending' });

      const request = new Request('http://localhost/');
      const response = await retrySubmission(request as any, createRouteParams({ matchId: match.id, submissionId: subId }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('retries a failed submission and resets status to pending', async () => {
      const match = await createMatch(game.id, mode.id);
      const subId = await insertSubmission(db, match.id, { aiStatus: 'failed' });

      const request = new Request('http://localhost/');
      const response = await retrySubmission(request as any, createRouteParams({ matchId: match.id, submissionId: subId }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const row = await db.get('SELECT ai_extraction_status FROM scorecard_submissions WHERE id = ?', [subId]);
      expect(row.ai_extraction_status).toBe('pending');
    });
  });
});

// ─── GET /api/stats ──────────────────────────────────────────────────────────

describe('GET /api/stats', () => {
  beforeEach(async () => {
    await seedBasicTestData();
  });

  it('returns totals with correct types', async () => {
    const response = await getStats();
    const { status, data } = await parseResponse(response);

    expect(status).toBe(200);
    expect(typeof data.totalMatches).toBe('number');
    expect(typeof data.totalTournaments).toBe('number');
    expect(typeof data.totalSignups).toBe('number');
  });

  it('reflects actual database counts', async () => {
    const game = (await seedBasicTestData()).game;
    const mode = (await seedBasicTestData()).mode;

    await createMatch(game.id, mode.id);

    const response = await getStats();
    const { status, data } = await parseResponse(response);

    expect(status).toBe(200);
    expect(data.totalMatches).toBeGreaterThan(0);
  });
});

// ─── GET/POST /api/matches/[matchId]/games/[gameId]/result ───────────────────

describe('Match Game Result Route', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
  });

  describe('GET /api/matches/[matchId]/games/[gameId]/result', () => {
    it('returns 404 when no result exists', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('GET', `/api/matches/${match.id}/games/nonexistent/result`);
      const response = await getGameResult(request, createRouteParams({ matchId: match.id, gameId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });
  });

  describe('POST /api/matches/[matchId]/games/[gameId]/result', () => {
    it('returns 400 for invalid winner', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/games/mg-1/result`, {
        winner: 'invalid',
        gameId: 'mg-1',
        matchId: match.id,
      });
      const response = await postGameResult(request, createRouteParams({ matchId: match.id, gameId: 'mg-1' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when gameId mismatch', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/games/mg-1/result`, {
        winner: 'team1',
        gameId: 'different-id',
        matchId: match.id,
      });
      const response = await postGameResult(request, createRouteParams({ matchId: match.id, gameId: 'mg-1' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when matchId mismatch', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/games/mg-1/result`, {
        winner: 'team1',
        gameId: 'mg-1',
        matchId: 'wrong-match',
      });
      const response = await postGameResult(request, createRouteParams({ matchId: match.id, gameId: 'mg-1' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('saves result when match_game exists', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO match_games (id, match_id, round, participant1_id, participant2_id, status)
         VALUES ('mg-save', ?, 1, 'p1', 'p2', 'ongoing')`,
        [match.id]
      );

      const request = createMockRequest('POST', `/api/matches/${match.id}/games/mg-save/result`, {
        winner: 'team1',
        gameId: 'mg-save',
        matchId: match.id,
      });
      const response = await postGameResult(request, createRouteParams({ matchId: match.id, gameId: 'mg-save' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('Blue Team');
    });
  });
});
