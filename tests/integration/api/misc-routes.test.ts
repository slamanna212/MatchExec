import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createTournament } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

import { GET as getHealth } from '@/app/api/health/route';
import { GET as getVersion } from '@/app/api/version/route';
import { GET as getFeed } from '@/app/api/feed/route';
import { GET as getStatsSettings, PUT as putStatsSettings } from '@/app/api/settings/stats/route';
import { GET as getTournamentStandings } from '@/app/api/tournaments/[tournamentId]/standings/route';
import { GET as getTournamentParticipants } from '@/app/api/tournaments/[tournamentId]/participants/route';
import { POST as postBracketAssignments } from '@/app/api/tournaments/[tournamentId]/bracket-assignments/route';
import { GET as getTournamentMatches } from '@/app/api/tournaments/[tournamentId]/matches/route';

describe('Misc Routes', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
  });

  // ─── GET /api/health ─────────────────────────────────────────────────────────

  describe('GET /api/health', () => {
    it('returns 200 with healthy status', async () => {
      const response = await getHealth();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe('healthy');
      expect(body.services.database).toBe('up');
    });

    it('returns timestamp', async () => {
      const response = await getHealth();
      const body = await response.json();

      expect(body.timestamp).toBeDefined();
      expect(() => new Date(body.timestamp)).not.toThrow();
    });
  });

  // ─── GET /api/version ────────────────────────────────────────────────────────

  describe('GET /api/version', () => {
    it('returns 200 with version info', async () => {
      const response = await getVersion();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toHaveProperty('version');
    });
  });

  // ─── GET /api/feed ───────────────────────────────────────────────────────────

  describe('GET /api/feed', () => {
    it('returns empty events when no activity', async () => {
      const request = createMockRequest('GET', '/api/feed');
      const response = await getFeed(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(body.events)).toBe(true);
      expect(typeof body.total).toBe('number');
    });

    it('returns feed events with pagination info', async () => {
      // Insert a feed event
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title)
         VALUES ('ev1', 'match_created', 1, 'Match Created')`
      );

      const request = createMockRequest('GET', '/api/feed');
      const response = await getFeed(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.total).toBeGreaterThan(0);
      expect(body.limit).toBeDefined();
      expect(body.offset).toBeDefined();
    });

    it('filters by event_type', async () => {
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title)
         VALUES ('ev2', 'tournament_started', 1, 'Tournament Started')`
      );

      const request = createMockRequest('GET', '/api/feed?event_type=tournament_started');
      const response = await getFeed(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      const types = body.events.map((e: any) => e.event_type);
      expect(types.every((t: string) => t === 'tournament_started')).toBe(true);
    });

    it('respects limit query param', async () => {
      for (let i = 0; i < 5; i++) {
        await db.run(
          `INSERT INTO activity_feed (id, event_type, priority, title)
           VALUES (?, 'test_event', 1, ?)`,
          [`ev-limit-${i}`, `Event ${i}`]
        );
      }

      const request = createMockRequest('GET', '/api/feed?limit=2');
      const response = await getFeed(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.events.length).toBeLessThanOrEqual(2);
    });

    it('returns 304 with ETag cache hit on second identical request', async () => {
      // First request to get ETag
      const request1 = createMockRequest('GET', '/api/feed');
      const response1 = await getFeed(request1);
      const etag = response1.headers.get('ETag') ?? response1.headers.get('etag');

      if (etag) {
        // Second request with If-None-Match
        const request2 = new Request('http://localhost/api/feed', {
          headers: { 'if-none-match': etag }
        });
        const response2 = await getFeed(request2 as any);
        expect(response2.status).toBe(304);
      }
    });
  });

  // ─── GET /api/settings/stats ─────────────────────────────────────────────────

  describe('GET /api/settings/stats', () => {
    it('returns defaults when no stats_settings row exists', async () => {
      const response = await getStatsSettings();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.enabled).toBe(false);
      expect(Array.isArray(body.providers)).toBe(true);
    });

    it('returns settings when row exists', async () => {
      await db.run(
        `INSERT INTO stats_settings (id, enabled, both_sides_required, auto_advance_on_match)
         VALUES (1, 1, 1, 0)`
      );

      const response = await getStatsSettings();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.enabled).toBe(true);
      expect(body.both_sides_required).toBe(true);
    });

    it('parses legacy providers config', async () => {
      const legacyConfig = JSON.stringify([
        { id: 'anthropic', model: 'claude-3', enabled: true, sortOrder: 0 },
      ]);
      await db.run(
        `INSERT INTO stats_settings (id, enabled, ai_providers_config) VALUES (1, 1, ?)`,
        [legacyConfig]
      );

      const response = await getStatsSettings();
      const body = await response.json();

      expect(response.status).toBe(200);
      // providers should include the migrated entry
      expect(body.providers.length).toBeGreaterThan(0);
    });
  });

  // ─── PUT /api/settings/stats ─────────────────────────────────────────────────

  describe('PUT /api/settings/stats', () => {
    it('enables stats', async () => {
      const request = createMockRequest('PUT', '/api/settings/stats', { enabled: true });
      const response = await putStatsSettings(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('updates both_sides_required flag', async () => {
      const request = createMockRequest('PUT', '/api/settings/stats', { both_sides_required: true });
      const response = await putStatsSettings(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('updates providers config', async () => {
      const request = createMockRequest('PUT', '/api/settings/stats', {
        providers: [
          { instanceId: 'anthropic-claude', providerId: 'anthropic', model: 'claude-3', sortOrder: 0 },
        ],
      });
      const response = await putStatsSettings(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  // ─── GET /api/tournaments/[tournamentId]/standings ───────────────────────────

  describe('GET /api/tournaments/[tournamentId]/standings', () => {
    it('returns empty standings for tournament with no teams', async () => {
      const tournament = await createTournament(game.id, mode.id);
      const request = createMockRequest('GET', `/api/tournaments/${tournament.id}/standings`);
      const response = await getTournamentStandings(request, createRouteParams({ tournamentId: tournament.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data.standings)).toBe(true);
    });

    it('returns standings for tournament with teams', async () => {
      const tournament = await createTournament(game.id, mode.id);
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES ('t1', ?, 'Alpha')`,
        [tournament.id]
      );

      const request = createMockRequest('GET', `/api/tournaments/${tournament.id}/standings`);
      const response = await getTournamentStandings(request, createRouteParams({ tournamentId: tournament.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.standings.length).toBeGreaterThan(0);
      expect(data.standings[0].team_name).toBe('Alpha');
    });
  });

  // ─── GET /api/tournaments/[tournamentId]/participants ────────────────────────

  describe('GET /api/tournaments/[tournamentId]/participants', () => {
    it('returns empty participants for new tournament', async () => {
      const tournament = await createTournament(game.id, mode.id);
      const request = createMockRequest('GET', `/api/tournaments/${tournament.id}/participants`);
      const response = await getTournamentParticipants(request, createRouteParams({ tournamentId: tournament.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data.participants)).toBe(true);
      expect(data.participants).toHaveLength(0);
    });

    it('returns participants when they exist', async () => {
      const tournament = await createTournament(game.id, mode.id);
      await db.run(
        `INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username)
         VALUES ('tp1', ?, 'u1', 'discord-u1', 'Player1')`,
        [tournament.id]
      );

      const request = createMockRequest('GET', `/api/tournaments/${tournament.id}/participants`);
      const response = await getTournamentParticipants(request, createRouteParams({ tournamentId: tournament.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.participants.length).toBe(1);
      expect(data.participants[0].username).toBe('Player1');
    });

    it('parses signup_data JSON for participants', async () => {
      const tournament = await createTournament(game.id, mode.id);
      await db.run(
        `INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username, signup_data)
         VALUES ('tp2', ?, 'u2', 'discord-u2', 'Player2', '{"rank":"gold"}')`,
        [tournament.id]
      );

      const request = createMockRequest('GET', `/api/tournaments/${tournament.id}/participants`);
      const response = await getTournamentParticipants(request, createRouteParams({ tournamentId: tournament.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.participants[0].signup_data).toEqual({ rank: 'gold' });
    });
  });

  // ─── POST /api/tournaments/[tournamentId]/bracket-assignments ────────────────

  describe('POST /api/tournaments/[tournamentId]/bracket-assignments', () => {
    it('returns 400 when assignments missing', async () => {
      const tournament = await createTournament(game.id, mode.id);
      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/bracket-assignments`, {});
      const response = await postBracketAssignments(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when assignments is not an array', async () => {
      const tournament = await createTournament(game.id, mode.id);
      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/bracket-assignments`, {
        assignments: 'invalid',
      });
      const response = await postBracketAssignments(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 404 when tournament not in assign status', async () => {
      const tournament = await createTournament(game.id, mode.id);
      // Default status is 'created', not 'assign'
      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/bracket-assignments`, {
        assignments: [],
      });
      const response = await postBracketAssignments(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns success with empty assignments when tournament is in assign status', async () => {
      const tournament = await createTournament(game.id, mode.id);
      await db.run(`UPDATE tournaments SET status = 'assign' WHERE id = ?`, [tournament.id]);

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/bracket-assignments`, {
        assignments: [],
      });
      const response = await postBracketAssignments(request, createRouteParams({ tournamentId: tournament.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.message).toContain('saved');
    });

    it('returns 400 when team not found in tournament', async () => {
      const tournament = await createTournament(game.id, mode.id);
      await db.run(`UPDATE tournaments SET status = 'assign' WHERE id = ?`, [tournament.id]);

      const request = createMockRequest('POST', `/api/tournaments/${tournament.id}/bracket-assignments`, {
        assignments: [{ position: 1, teamId: 'nonexistent-team' }],
      });
      const response = await postBracketAssignments(request, createRouteParams({ tournamentId: tournament.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });
  });

  // ─── GET /api/tournaments/[tournamentId]/matches ─────────────────────────────

  describe('GET /api/tournaments/[tournamentId]/matches', () => {
    it('returns empty matches for new tournament', async () => {
      const tournament = await createTournament(game.id, mode.id);
      const request = createMockRequest('GET', `/api/tournaments/${tournament.id}/matches`);
      const response = await getTournamentMatches(request, createRouteParams({ tournamentId: tournament.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data.matches)).toBe(true);
      expect(data.count).toBe(0);
    });
  });
});
