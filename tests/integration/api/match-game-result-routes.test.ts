import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

// saveMatchResult triggers complex side-effects including Discord queuing; mock it
vi.mock('@/lib/scoring-functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/scoring-functions')>();
  return {
    ...actual,
    saveMatchResult: vi.fn().mockResolvedValue(undefined),
    queueScoreNotification: vi.fn().mockResolvedValue(undefined),
    queueBattleStartDMs: vi.fn().mockResolvedValue(undefined),
    queueVoiceAnnouncementForScore: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  GET as getResult,
  POST as postResult,
} from '@/app/api/matches/[matchId]/games/[gameId]/result/route';
import { GET as getOverallScore } from '@/app/api/matches/[matchId]/overall-score/route';
import { GET as getGames } from '@/app/api/matches/[matchId]/games/route';

function makeJsonRequest(body: unknown): Request {
  return new Request('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request;
}

describe('Match Game Result Routes', () => {
  let matchId: string;
  let gameId: string;

  beforeEach(async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id);
    matchId = match.id;

    const db = getTestDb();
    gameId = `game-${Date.now()}`;
    await db.run(
      `INSERT INTO match_games (id, match_id, round) VALUES (?, ?, 1)`,
      [gameId, matchId]
    );
  });

  describe('GET /api/matches/[matchId]/games', () => {
    it('returns success with games array', async () => {
      const req = { url: `http://localhost/api/matches/${matchId}/games` } as any;
      const res = await getGames(req, createRouteParams({ matchId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.games)).toBe(true);
    });
  });

  describe('GET /api/matches/[matchId]/games/[gameId]/result', () => {
    it('returns 404 when no result exists for the game', async () => {
      const req = { url: `http://localhost` } as any;
      const res = await getResult(req, createRouteParams({ matchId, gameId }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/no result/i);
    });

    it('returns 404 for a completely unknown gameId', async () => {
      const req = { url: `http://localhost` } as any;
      const res = await getResult(req, createRouteParams({ matchId, gameId: 'nonexistent' }));
      expect(res.status).toBe(404);
    });

    it('returns the result after a winner is set', async () => {
      const db = getTestDb();
      await db.run(
        `UPDATE match_games SET winner_id = 'team1', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [gameId]
      );

      const req = { url: `http://localhost` } as any;
      const res = await getResult(req, createRouteParams({ matchId, gameId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.winner).toBe('team1');
    });
  });

  describe('POST /api/matches/[matchId]/games/[gameId]/result', () => {
    it('returns 400 when winner is missing', async () => {
      const req = makeJsonRequest({ gameId, matchId }) as any;
      const res = await postResult(req, createRouteParams({ matchId, gameId }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid winner/i);
    });

    it('returns 400 when winner has an invalid value', async () => {
      const req = makeJsonRequest({ gameId, matchId, winner: 'blue' }) as any;
      const res = await postResult(req, createRouteParams({ matchId, gameId }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when gameId in body does not match route param', async () => {
      const req = makeJsonRequest({ gameId: 'other-game', matchId, winner: 'team1' }) as any;
      const res = await postResult(req, createRouteParams({ matchId, gameId }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/mismatch/i);
    });

    it('returns 400 when matchId in body does not match route param', async () => {
      const req = makeJsonRequest({ gameId, matchId: 'wrong-match', winner: 'team1' }) as any;
      const res = await postResult(req, createRouteParams({ matchId, gameId }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/mismatch/i);
    });

    it('saves the result and returns success for team1', async () => {
      const req = makeJsonRequest({ gameId, matchId, winner: 'team1' }) as any;
      const res = await postResult(req, createRouteParams({ matchId, gameId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toMatch(/blue/i);
    });

    it('saves the result and returns success for team2', async () => {
      const req = makeJsonRequest({ gameId, matchId, winner: 'team2' }) as any;
      const res = await postResult(req, createRouteParams({ matchId, gameId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toMatch(/red/i);
    });
  });

  describe('GET /api/matches/[matchId]/overall-score', () => {
    it('returns an overall score object', async () => {
      const req = { url: `http://localhost/api/matches/${matchId}/overall-score` } as any;
      const res = await getOverallScore(req, createRouteParams({ matchId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeDefined();
    });
  });
});
