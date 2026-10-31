import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { GET } from '@/app/api/matches/[matchId]/games/[gameId]/suggested-positions/route';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

describe('GET /api/matches/[matchId]/games/[gameId]/suggested-positions', () => {
  let matchId: string;
  const gameId = 'mg-sugg-1';

  async function addSubmission(id: string, review: string, suggestion: string | null, createdAt: string) {
    await getTestDb().run(
      `INSERT INTO scorecard_submissions
         (id, match_id, match_game_id, team_side, screenshot_url, review_status, suggested_positions, created_at)
       VALUES (?, ?, ?, 'blue', 'x.png', ?, ?, ?)`,
      [id, matchId, gameId, review, suggestion, createdAt]
    );
  }

  beforeEach(async () => {
    const { game, mode } = await seedBasicTestData();
    matchId = (await createMatch(game.id, mode.id)).id;
    await getTestDb().run(
      `INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'pending')`,
      [gameId, matchId]
    );
  });

  it('returns 404 when the game does not belong to the match', async () => {
    const res = await GET({} as any, createRouteParams({ matchId, gameId: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('returns null when there are no approved suggestions', async () => {
    await addSubmission('s1', 'pending', '{"p1":1}', '2026-01-01 10:00:00');
    const res = await GET({} as any, createRouteParams({ matchId, gameId }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: null });
  });

  it('uses the latest approved/auto_approved submission', async () => {
    await addSubmission('s1', 'approved', '{"p1":2,"p2":1}', '2026-01-01 10:00:00');
    await addSubmission('s2', 'auto_approved', '{"p1":1,"p2":2}', '2026-01-01 11:00:00');
    await addSubmission('s3', 'rejected', '{"p1":3}', '2026-01-01 12:00:00');
    const res = await GET({} as any, createRouteParams({ matchId, gameId }));
    expect(await res.json()).toEqual({ suggestions: { p1: 1, p2: 2 } });
  });

  it('ignores malformed stored suggestions', async () => {
    await addSubmission('s1', 'approved', '{"p1":"first","p2":-1}', '2026-01-01 10:00:00');
    const res = await GET({} as any, createRouteParams({ matchId, gameId }));
    expect(await res.json()).toEqual({ suggestions: null });
  });
});
