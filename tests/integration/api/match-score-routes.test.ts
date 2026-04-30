import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

import { POST as postMapNotes, GET as getMapNotes } from '@/app/api/matches/[matchId]/map-notes/route';
import { GET as getOverallScore } from '@/app/api/matches/[matchId]/overall-score/route';
import { GET as getMatchGamesRoute } from '@/app/api/matches/[matchId]/games/route';
import { GET as getGamesWithResults } from '@/app/api/matches/[matchId]/games-with-results/route';
import { GET as getStats, POST as postStats } from '@/app/api/matches/[matchId]/stats/route';

describe('Match Score & Notes Routes', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
  });

  // ─── POST /api/matches/[matchId]/map-notes ───────────────────────────────────

  describe('POST /api/matches/[matchId]/map-notes', () => {
    it('returns 400 when mapId is missing', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/map-notes`, { note: 'hello' });
      const response = await postMapNotes(request, createRouteParams({ matchId: match.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when note exceeds 64 characters', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/map-notes`, {
        mapId: 'map-1',
        note: 'A'.repeat(65),
      });
      const response = await postMapNotes(request, createRouteParams({ matchId: match.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 404 when match not found', async () => {
      const request = createMockRequest('POST', '/api/matches/nonexistent/map-notes', {
        mapId: 'map-1',
        note: 'Test note',
      });
      const response = await postMapNotes(request, createRouteParams({ matchId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('creates a note-only entry when no match_game exists', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/map-notes`, {
        mapId: 'map-abc',
        note: 'First note',
      });
      const response = await postMapNotes(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.note).toBe('First note');
    });

    it('updates existing match_game when one exists for the map', async () => {
      const match = await createMatch(game.id, mode.id);
      const gameEntryId = `mg-${Date.now()}`;
      await db.run(
        `INSERT INTO match_games (id, match_id, round, participant1_id, participant2_id, map_id, status)
         VALUES (?, ?, 1, 'p1', 'p2', 'map-xyz', 'pending')`,
        [gameEntryId, match.id]
      );

      const request = createMockRequest('POST', `/api/matches/${match.id}/map-notes`, {
        mapId: 'map-xyz',
        note: 'Updated note',
      });
      const response = await postMapNotes(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const updated = await db.get('SELECT notes FROM match_games WHERE id = ?', [gameEntryId]);
      expect(updated.notes).toBe('Updated note');
    });

    it('accepts empty note string', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/map-notes`, {
        mapId: 'map-empty',
        note: '',
      });
      const response = await postMapNotes(request, createRouteParams({ matchId: match.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(200);
    });
  });

  // ─── GET /api/matches/[matchId]/map-notes ────────────────────────────────────

  describe('GET /api/matches/[matchId]/map-notes', () => {
    it('returns empty notes object when no notes stored', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('GET', `/api/matches/${match.id}/map-notes`);
      const response = await getMapNotes(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.notes).toEqual({});
    });

    it('returns stored notes keyed by map_id', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO match_games (id, match_id, round, participant1_id, participant2_id, map_id, notes, status)
         VALUES ('mg1', ?, 1, 'p1', 'p2', 'map-a', 'Note A', 'pending')`,
        [match.id]
      );

      const request = createMockRequest('GET', `/api/matches/${match.id}/map-notes`);
      const response = await getMapNotes(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.notes['map-a']).toBe('Note A');
    });

    it('excludes entries with empty notes', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO match_games (id, match_id, round, participant1_id, participant2_id, map_id, notes, status)
         VALUES ('mg2', ?, 1, 'p1', 'p2', 'map-b', '', 'pending')`,
        [match.id]
      );

      const request = createMockRequest('GET', `/api/matches/${match.id}/map-notes`);
      const response = await getMapNotes(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Object.keys(data.notes)).toHaveLength(0);
    });
  });

  // ─── GET /api/matches/[matchId]/overall-score ────────────────────────────────

  describe('GET /api/matches/[matchId]/overall-score', () => {
    it('returns score data for existing match', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('GET', `/api/matches/${match.id}/overall-score`);
      const response = await getOverallScore(request, createRouteParams({ matchId: match.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(200);
    });

    it('returns score object (may be default/empty for a new match)', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('GET', `/api/matches/${match.id}/overall-score`);
      const response = await getOverallScore(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      // The response should be an object (score data)
      expect(typeof data).toBe('object');
    });
  });

  // ─── GET /api/matches/[matchId]/games ────────────────────────────────────────

  describe('GET /api/matches/[matchId]/games', () => {
    it('returns games array for existing match', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('GET', `/api/matches/${match.id}/games`);
      const response = await getMatchGamesRoute(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.games)).toBe(true);
    });

    it('returns games including initialized ones', async () => {
      const match = await createMatch(game.id, mode.id);
      // Pre-insert a game entry
      await db.run(
        `INSERT INTO match_games (id, match_id, round, participant1_id, participant2_id, status)
         VALUES ('mg-test', ?, 1, 'p1', 'p2', 'pending')`,
        [match.id]
      );

      const request = createMockRequest('GET', `/api/matches/${match.id}/games`);
      const response = await getMatchGamesRoute(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.games.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── GET /api/matches/[matchId]/games-with-results ───────────────────────────

  describe('GET /api/matches/[matchId]/games-with-results', () => {
    it('returns games array for existing match', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('GET', `/api/matches/${match.id}/games-with-results`);
      const response = await getGamesWithResults(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data.games)).toBe(true);
    });

    it('returns games with result data', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO match_games (id, match_id, round, participant1_id, participant2_id, status)
         VALUES ('mg-res', ?, 1, 'p1', 'p2', 'completed')`,
        [match.id]
      );

      const request = createMockRequest('GET', `/api/matches/${match.id}/games-with-results`);
      const response = await getGamesWithResults(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.games).toBeDefined();
    });
  });

  // ─── GET /api/matches/[matchId]/stats ────────────────────────────────────────

  describe('GET /api/matches/[matchId]/stats', () => {
    it('returns empty array when no stats exist', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('GET', `/api/matches/${match.id}/stats`);
      const response = await getStats(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('returns stats when they exist', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO match_player_stats (id, match_id, participant_id, total_stats_json, maps_played)
         VALUES ('stat-1', ?, 'p1', '{"kills":10}', 1)`,
        [match.id]
      );

      const request = createMockRequest('GET', `/api/matches/${match.id}/stats`);
      const response = await getStats(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });
  });

  // ─── POST /api/matches/[matchId]/stats ───────────────────────────────────────

  describe('POST /api/matches/[matchId]/stats', () => {
    it('returns message when no approved stats', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/stats`, {});
      const response = await postStats(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.message).toContain('No approved stats');
    });

    it('aggregates approved scorecard stats into match_player_stats', async () => {
      const match = await createMatch(game.id, mode.id);

      // Insert a scorecard submission
      await db.run(
        `INSERT INTO scorecard_submissions (id, match_id, match_game_id, team_side, screenshot_url, review_status)
         VALUES ('sub-1', ?, 'mg-1', 'blue', '/uploads/test.png', 'approved')`,
        [match.id]
      );

      // Insert a participant
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, username)
         VALUES ('part-1', ?, 'u1', 'Player1')`,
        [match.id]
      );

      // Insert scorecard player stats
      await db.run(
        `INSERT INTO scorecard_player_stats (id, submission_id, match_id, match_game_id, participant_id, team_side, extracted_player_name, stats_json)
         VALUES ('sps-1', 'sub-1', ?, 'mg-1', 'part-1', 'blue', 'Player1', '{"kills":5,"deaths":2}')`,
        [match.id]
      );

      const request = createMockRequest('POST', `/api/matches/${match.id}/stats`, {});
      const response = await postStats(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.participantsAggregated).toBe(1);
    });
  });
});
