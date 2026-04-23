import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createMatch, createMatchParticipant } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

// Map Codes route
import { GET as getMapCodes, POST as postMapCodes } from '@/app/api/matches/[matchId]/map-codes/route';

// Assign Teams route
import { POST as assignTeams } from '@/app/api/matches/[matchId]/assign-teams/route';

// Reminders route
import { GET as getReminders } from '@/app/api/matches/[matchId]/reminders/route';

describe('Match Sub-Routes API', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
  });

  describe('GET /api/matches/[matchId]/map-codes', () => {
    it('returns 404 for non-existent match', async () => {
      const request = createMockRequest('GET', '/api/matches/nonexistent/map-codes');
      const response = await getMapCodes(request, createRouteParams({ matchId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns empty map codes when none set', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('GET', `/api/matches/${match.id}/map-codes`);
      const response = await getMapCodes(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.mapCodes).toEqual({});
    });

    it('returns stored map codes', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        'UPDATE matches SET map_codes = ? WHERE id = ?',
        [JSON.stringify({ 'map-1': 'ABC123' }), match.id]
      );

      const request = createMockRequest('GET', `/api/matches/${match.id}/map-codes`);
      const response = await getMapCodes(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.mapCodes['map-1']).toBe('ABC123');
    });
  });

  describe('POST /api/matches/[matchId]/map-codes', () => {
    it('returns 400 when mapCodes is missing', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/map-codes`, {});
      const response = await postMapCodes(request, createRouteParams({ matchId: match.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when code exceeds 24 characters', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/map-codes`, {
        mapCodes: { 'map-1': 'A'.repeat(25) },
      });
      const response = await postMapCodes(request, createRouteParams({ matchId: match.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 404 for non-existent match', async () => {
      const request = createMockRequest('POST', '/api/matches/nonexistent/map-codes', {
        mapCodes: { 'map-1': 'ABC123' },
      });
      const response = await postMapCodes(request, createRouteParams({ matchId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('saves map codes and returns them', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/map-codes`, {
        mapCodes: { 'map-1': 'XYZ789', 'map-2': 'DEF456' },
      });
      const response = await postMapCodes(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mapCodes['map-1']).toBe('XYZ789');
    });
  });

  describe('POST /api/matches/[matchId]/assign-teams', () => {
    it('returns 400 when teamAssignments is missing', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/assign-teams`, {});
      const response = await assignTeams(request, createRouteParams({ matchId: match.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when teamAssignments is not an array', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/assign-teams`, {
        teamAssignments: 'invalid',
      });
      const response = await assignTeams(request, createRouteParams({ matchId: match.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('assigns teams to participants successfully', async () => {
      const match = await createMatch(game.id, mode.id);
      const participant = await createMatchParticipant(match.id, 'user-1', 'Player1');

      const request = createMockRequest('POST', `/api/matches/${match.id}/assign-teams`, {
        teamAssignments: [
          { participantId: participant.id, team: 'blue', receives_map_codes: true },
        ],
        blueTeamVoiceChannel: 'vc-blue',
        redTeamVoiceChannel: 'vc-red',
      });
      const response = await assignTeams(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify the team assignment was saved
      const updated = await db.get(
        'SELECT team_assignment FROM match_participants WHERE id = ?',
        [participant.id]
      );
      expect(updated.team_assignment).toBe('blue');
    });

    it('returns error for invalid team value', async () => {
      const match = await createMatch(game.id, mode.id);
      const participant = await createMatchParticipant(match.id, 'user-2', 'Player2');

      const request = createMockRequest('POST', `/api/matches/${match.id}/assign-teams`, {
        teamAssignments: [
          { participantId: participant.id, team: 'invalid-team' },
        ],
      });
      const response = await assignTeams(request, createRouteParams({ matchId: match.id }));
      const { status } = await parseResponse(response);
      // Route throws and catches the error, returning 500
      expect(status).toBeGreaterThanOrEqual(400);
    });

    it('handles empty teamAssignments array', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('POST', `/api/matches/${match.id}/assign-teams`, {
        teamAssignments: [],
      });
      const response = await assignTeams(request, createRouteParams({ matchId: match.id }));
      const { status } = await parseResponse(response);
      expect(status).toBe(200);
    });
  });

  describe('GET /api/matches/[matchId]/reminders', () => {
    it('returns 404 for non-existent match', async () => {
      const request = createMockRequest('GET', '/api/matches/nonexistent/reminders');
      const response = await getReminders(request, createRouteParams({ matchId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns match info and reminders array', async () => {
      const match = await createMatch(game.id, mode.id);
      const request = createMockRequest('GET', `/api/matches/${match.id}/reminders`);
      const response = await getReminders(request, createRouteParams({ matchId: match.id }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.match.id).toBe(match.id);
      expect(Array.isArray(data.reminders)).toBe(true);
      expect(typeof data.reminderCount).toBe('number');
    });
  });
});
