import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createTournament } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import {
  GET as getTeams,
  POST as createTeam,
  PUT as assignTeams,
  DELETE as deleteTeam,
} from '@/app/api/tournaments/[tournamentId]/teams/route';

function makeJsonRequest(body: unknown, method = 'POST'): Request {
  return new Request('http://localhost', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request;
}

describe('Tournament Teams Routes — Extended', () => {
  let tournamentId: string;

  beforeEach(async () => {
    const { game } = await seedBasicTestData();
    const tournament = await createTournament(game.id);
    tournamentId = tournament.id;
  });

  describe('GET /api/tournaments/[tournamentId]/teams', () => {
    it('returns 404 for unknown tournament', async () => {
      const req = { url: 'http://localhost' } as any;
      const res = await getTeams(req, createRouteParams({ tournamentId: 'nonexistent' }));
      expect(res.status).toBe(404);
    });

    it('returns empty array when no teams exist', async () => {
      const req = { url: 'http://localhost' } as any;
      const res = await getTeams(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });

    it('returns teams with members array populated', async () => {
      const db = getTestDb();
      const teamId = `team-${Date.now()}`;
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Alpha')`,
        [teamId, tournamentId]
      );

      const req = { url: 'http://localhost' } as any;
      const res = await getTeams(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].team_name).toBe('Alpha');
      expect(Array.isArray(body[0].members)).toBe(true);
    });

    it('includes team members when present', async () => {
      const db = getTestDb();
      const teamId = `team-mbr-${Date.now()}`;
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Bravo')`,
        [teamId, tournamentId]
      );
      const memberId = `mbr-${Date.now()}`;
      await db.run(
        `INSERT INTO tournament_team_members (id, team_id, user_id, username, is_captain)
         VALUES (?, ?, 'user1', 'PlayerOne', 1)`,
        [memberId, teamId]
      );

      const req = { url: 'http://localhost' } as any;
      const res = await getTeams(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      const team = body.find((t: { id: string }) => t.id === teamId);
      expect(team).toBeDefined();
      expect(team.members).toHaveLength(1);
      expect(team.members[0].username).toBe('PlayerOne');
      expect(team.members[0].is_captain).toBe(true);
    });
  });

  describe('POST /api/tournaments/[tournamentId]/teams', () => {
    it('returns 404 for unknown tournament', async () => {
      const req = makeJsonRequest({ teamName: 'Test' }) as any;
      const res = await createTeam(req, createRouteParams({ tournamentId: 'nope' }));
      expect(res.status).toBe(404);
    });

    it('returns 400 when teamName is missing', async () => {
      const req = makeJsonRequest({}) as any;
      const res = await createTeam(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/team name/i);
    });

    it('returns 400 when teamName is empty string', async () => {
      const req = makeJsonRequest({ teamName: '   ' }) as any;
      const res = await createTeam(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when teamName exceeds 100 characters', async () => {
      const req = makeJsonRequest({ teamName: 'A'.repeat(101) }) as any;
      const res = await createTeam(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/100/);
    });

    it('returns 201 and creates a team', async () => {
      const req = makeJsonRequest({ teamName: 'Charlie Squad' }) as any;
      const res = await createTeam(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.team_name).toBe('Charlie Squad');
      expect(Array.isArray(body.members)).toBe(true);
    });

    it('returns 409 when team name already exists in tournament', async () => {
      const req1 = makeJsonRequest({ teamName: 'DuplicateTeam' }) as any;
      await createTeam(req1, createRouteParams({ tournamentId }));

      const req2 = makeJsonRequest({ teamName: 'DuplicateTeam' }) as any;
      const res = await createTeam(req2, createRouteParams({ tournamentId }));
      expect(res.status).toBe(409);
    });

    it('trims whitespace from teamName', async () => {
      const req = makeJsonRequest({ teamName: '  Delta Force  ' }) as any;
      const res = await createTeam(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.team_name).toBe('Delta Force');
    });
  });

  describe('PUT /api/tournaments/[tournamentId]/teams (bulk assign)', () => {
    it('returns 404 for unknown tournament', async () => {
      const req = makeJsonRequest({ teams: [] }, 'PUT') as any;
      const res = await assignTeams(req, createRouteParams({ tournamentId: 'nope' }));
      expect(res.status).toBe(404);
    });

    it('returns 400 when teams is not an array', async () => {
      const req = makeJsonRequest({ teams: 'bad' }, 'PUT') as any;
      const res = await assignTeams(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when teams field is missing', async () => {
      const req = makeJsonRequest({}, 'PUT') as any;
      const res = await assignTeams(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(400);
    });

    it('accepts empty teams array and returns success', async () => {
      const req = makeJsonRequest({ teams: [] }, 'PUT') as any;
      const res = await assignTeams(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('assigns members to teams and returns success', async () => {
      const db = getTestDb();
      const teamId = `team-assign-${Date.now()}`;
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Echo')`,
        [teamId, tournamentId]
      );

      const req = makeJsonRequest({
        teams: [{ teamId, members: [{ userId: 'u1', username: 'EchoPlayer', isCaptain: true }] }],
      }, 'PUT') as any;
      const res = await assignTeams(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const member = await db.get<{ username: string; is_captain: number }>(
        `SELECT username, is_captain FROM tournament_team_members WHERE team_id = ?`,
        [teamId]
      );
      expect(member?.username).toBe('EchoPlayer');
      expect(member?.is_captain).toBe(1);
    });
  });

  describe('DELETE /api/tournaments/[tournamentId]/teams', () => {
    it('returns 400 when teamId query param is missing', async () => {
      const req = { url: `http://localhost/api/tournaments/${tournamentId}/teams` } as any;
      const res = await deleteTeam(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(400);
    });

    it('returns 404 when team does not belong to tournament', async () => {
      const req = { url: `http://localhost/api/tournaments/${tournamentId}/teams?teamId=ghost` } as any;
      const res = await deleteTeam(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(404);
    });

    it('deletes an existing team successfully', async () => {
      const db = getTestDb();
      const teamId = `team-del-${Date.now()}`;
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'ToDelete')`,
        [teamId, tournamentId]
      );

      const req = { url: `http://localhost/api/tournaments/${tournamentId}/teams?teamId=${teamId}` } as any;
      const res = await deleteTeam(req, createRouteParams({ tournamentId }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const row = await db.get('SELECT id FROM tournament_teams WHERE id = ?', [teamId]);
      expect(row).toBeUndefined();
    });
  });
});
