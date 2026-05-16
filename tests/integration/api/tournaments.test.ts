import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { GET, POST } from '@/app/api/tournaments/route';
import { GET as getTournament, DELETE as deleteTournament } from '@/app/api/tournaments/[tournamentId]/route';
import { GET as getTeams, POST as createTeam, DELETE as deleteTeam } from '@/app/api/tournaments/[tournamentId]/teams/route';
import { POST as transitionTournament } from '@/app/api/tournaments/[tournamentId]/transition/route';
import { PUT as updateTournament } from '@/app/api/tournaments/[tournamentId]/route';

describe('Tournaments API', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  describe('GET /api/tournaments', () => {
    it('should return empty array when no tournaments exist', async () => {
      const request = createMockRequest('GET', '/api/tournaments');
      const response = await GET(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('should return all non-complete tournaments by default', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES
           ('t1', 'Tournament 1', ?, 'created', 'single-elimination', 1, 'casual'),
           ('t2', 'Tournament 2', ?, 'gather', 'single-elimination', 1, 'casual'),
           ('t3', 'Tournament 3', ?, 'complete', 'single-elimination', 1, 'casual')`,
          [game.id, game.id, game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/tournaments');
      const response = await GET(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveLength(2);
      expect(data.map((t: any) => t.status)).not.toContain('complete');
    });
  });

  describe('POST /api/tournaments', () => {
    it('should create tournament with valid data', async () => {
      const request = createMockRequest('POST', '/api/tournaments', {
        name: 'Test Tournament',
        gameId: game.id,
        gameModeId: mode.id,
        format: 'single-elimination',
        roundsPerMatch: 3,
      });

      const response = await POST(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.name).toBe('Test Tournament');
      expect(data.format).toBe('single-elimination');
    });

    it('should persist announcements, playerNotifications, and livestreamLink', async () => {
      const announcements = [{ id: 'a1', value: 1, unit: 'hours' }];
      const request = createMockRequest('POST', '/api/tournaments', {
        name: 'Announced Tournament',
        gameId: game.id,
        gameModeId: mode.id,
        format: 'single-elimination',
        roundsPerMatch: 3,
        announcements,
        playerNotifications: false,
        livestreamLink: 'https://twitch.tv/test',
      });

      const response = await POST(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(201);
      expect(data.livestream_link).toBe('https://twitch.tv/test');
      expect(data.player_notifications).toBe(0);
      expect(JSON.parse(data.announcements)).toEqual(announcements);
    });

    it('should reject missing required fields', async () => {
      const request = createMockRequest('POST', '/api/tournaments', {
        name: 'Test Tournament',
        // missing gameId, gameModeId, format, roundsPerMatch
      });

      const response = await POST(request);
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });

    it('should reject invalid format', async () => {
      const request = createMockRequest('POST', '/api/tournaments', {
        name: 'Test Tournament',
        gameId: game.id,
        gameModeId: mode.id,
        format: 'invalid-format',
        roundsPerMatch: 3,
      });

      const response = await POST(request);
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });

    it('should create tournament with cumulative-points format', async () => {
      const request = createMockRequest('POST', '/api/tournaments', {
        name: 'FFA Championship',
        gameId: game.id,
        gameModeId: mode.id,
        format: 'cumulative-points',
        roundsPerMatch: 1,
      });

      const response = await POST(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.format).toBe('cumulative-points');
    });
  });

  describe('GET /api/tournaments/[tournamentId]', () => {
    it('should return tournament details', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset, livestream_link, player_notifications)
           VALUES ('t1', 'Test Tournament', ?, 'created', 'single-elimination', 1, 'casual', 'https://twitch.tv/test', 0)`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/tournaments/t1');
      const response = await getTournament(request, createRouteParams({ tournamentId: 't1' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.id).toBe('t1');
      expect(data.name).toBe('Test Tournament');
      expect(data.livestream_link).toBe('https://twitch.tv/test');
      expect(data.player_notifications).toBe(0);
    });

    it('should return 404 for non-existent tournament', async () => {
      const request = createMockRequest('GET', '/api/tournaments/nonexistent');
      const response = await getTournament(request, createRouteParams({ tournamentId: 'nonexistent' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });

  describe('DELETE /api/tournaments/[tournamentId]', () => {
    it('should delete existing tournament', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t1', 'Test Tournament', ?, 'created', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('DELETE', '/api/tournaments/t1');
      const response = await deleteTournament(request, createRouteParams({ tournamentId: 't1' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(200);

      // Verify deletion
      const deleted = await new Promise<any>((resolve, reject) => {
        db.get('SELECT * FROM tournaments WHERE id = ?', ['t1'], (err, row) =>
          err ? reject(err) : resolve(row)
        );
      });

      expect(deleted).toBeUndefined();
    });

    it('should return 404 for non-existent tournament', async () => {
      const request = createMockRequest('DELETE', '/api/tournaments/nonexistent');
      const response = await deleteTournament(request, createRouteParams({ tournamentId: 'nonexistent' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });

  describe('Tournament Teams API', () => {
    it('should return empty teams array for new tournament', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t-teams', 'Team Tournament', ?, 'created', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('GET', '/api/tournaments/t-teams/teams');
      const response = await getTeams(request, createRouteParams({ tournamentId: 't-teams' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('should create a team for a tournament', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t-team-create', 'Team Tournament', ?, 'created', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('POST', '/api/tournaments/t-team-create/teams', {
        teamName: 'Alpha Team',
      });

      const response = await createTeam(request, createRouteParams({ tournamentId: 't-team-create' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.team_name).toBe('Alpha Team');
    });

    it('should delete a team from a tournament', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t-team-del', 'Team Tournament', ?, 'created', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES ('team-del-1', 't-team-del', 'Delete Me')`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('DELETE', '/api/tournaments/t-team-del/teams?teamId=team-del-1');
      const response = await deleteTeam(request, createRouteParams({ tournamentId: 't-team-del' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('success', true);

      // Verify deletion
      const deleted = await new Promise<any>((resolve, reject) => {
        db.get('SELECT * FROM tournament_teams WHERE id = ?', ['team-del-1'], (err, row) =>
          err ? reject(err) : resolve(row)
        );
      });
      expect(deleted).toBeUndefined();
    });
  });

  describe('PUT /api/tournaments/[tournamentId]', () => {
    it('should update editable fields', async () => {
      const db = getTestDb();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t-edit', 'Original Name', ?, 'created', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('PUT', '/api/tournaments/t-edit', {
        name: 'Updated Name',
        livestreamLink: 'https://twitch.tv/updated',
        playerNotifications: false,
      });
      const response = await updateTournament(request, createRouteParams({ tournamentId: 't-edit' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.name).toBe('Updated Name');
      expect(data.livestream_link).toBe('https://twitch.tv/updated');
      expect(data.player_notifications).toBe(0);
    });

    it('should persist announcements on update', async () => {
      const db = getTestDb();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t-edit-ann', 'Tournament', ?, 'created', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const announcements = [{ id: 'x1', value: 30, unit: 'minutes' }];
      const request = createMockRequest('PUT', '/api/tournaments/t-edit-ann', {
        name: 'Tournament',
        announcements,
      });
      const response = await updateTournament(request, createRouteParams({ tournamentId: 't-edit-ann' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(JSON.parse(data.announcements)).toEqual(announcements);
    });

    it('should return 404 for non-existent tournament', async () => {
      const request = createMockRequest('PUT', '/api/tournaments/nonexistent', { name: 'X' });
      const response = await updateTournament(request, createRouteParams({ tournamentId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('should return 400 when no valid fields provided', async () => {
      const db = getTestDb();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t-edit-empty', 'Tournament', ?, 'created', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });
      const request = createMockRequest('PUT', '/api/tournaments/t-edit-empty', {});
      const response = await updateTournament(request, createRouteParams({ tournamentId: 't-edit-empty' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });
  });

  describe('Tournament Transitions API', () => {
    it('should transition tournament from created to gather', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t-trans', 'Transition Tournament', ?, 'created', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('POST', '/api/tournaments/t-trans/transition', {
        newStatus: 'gather',
      });

      const response = await transitionTournament(request, createRouteParams({ tournamentId: 't-trans' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.status).toBe('gather');
    });

    it('should reject backward transitions', async () => {
      const db = getTestDb();

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO tournaments (id, name, game_id, status, format, rounds_per_match, ruleset)
           VALUES ('t-back', 'Backward Tournament', ?, 'gather', 'single-elimination', 1, 'casual')`,
          [game.id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('POST', '/api/tournaments/t-back/transition', {
        newStatus: 'created',
      });

      const response = await transitionTournament(request, createRouteParams({ tournamentId: 't-back' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });

    it('should return 404 for non-existent tournament transition', async () => {
      const request = createMockRequest('POST', '/api/tournaments/nonexistent/transition', {
        newStatus: 'gather',
      });

      const response = await transitionTournament(request, createRouteParams({ tournamentId: 'nonexistent' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });
});
