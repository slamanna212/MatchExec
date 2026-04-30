import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('@/lib/feed-helpers', () => ({
  logFeedEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/scoring-functions', () => ({
  initializeMatchGames: vi.fn().mockResolvedValue(undefined),
}));

import {
  handleGatherTransition,
  handleAssignTransition,
  handleBattleTransition,
  handleEndTransition,
} from '@/lib/tournament-transition-handlers';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createTournament, createMatch } from '../../utils/fixtures';

describe('tournament-transition-handlers', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
  });

  describe('handleGatherTransition', () => {
    it('queues a Discord tournament announcement', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });

      await handleGatherTransition(db as any, tournament.id);

      const announcements = await db.all(
        `SELECT * FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'tournament'`,
        [tournament.id]
      );
      expect(announcements).toHaveLength(1);
      expect(announcements[0].status).toBe('pending');
    });

    it('does not create duplicate announcements on second call', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });

      await handleGatherTransition(db as any, tournament.id);
      await handleGatherTransition(db as any, tournament.id);

      const announcements = await db.all(
        `SELECT * FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'tournament'`,
        [tournament.id]
      );
      expect(announcements).toHaveLength(1);
    });
  });

  describe('handleAssignTransition', () => {
    it('queues a Discord status update for assign', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });

      await handleAssignTransition(db as any, tournament.id);

      const updates = await db.all(
        `SELECT * FROM discord_status_update_queue WHERE match_id = ? AND new_status = 'assign'`,
        [tournament.id]
      );
      expect(updates).toHaveLength(1);
    });

    it('auto-creates solo teams when game mode has team_size=1 and no teams exist', async () => {
      // Create a game mode with team_size = 1
      const soloModeId = `mode_solo_${Date.now()}`;
      await db.run(`
        INSERT INTO game_modes (id, game_id, name, description, team_size, max_teams)
        VALUES (?, ?, 'Solo Mode', 'Solo', 1, 16)
      `, [soloModeId, game.id]);

      const tournament = await createTournament(game.id, { game_mode_id: soloModeId });

      // Add participants
      await db.run(`
        INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username)
        VALUES ('p1', ?, 'u1', 'd1', 'Player1'), ('p2', ?, 'u2', 'd2', 'Player2')
      `, [tournament.id, tournament.id]);

      await handleAssignTransition(db as any, tournament.id);

      const teams = await db.all(
        `SELECT * FROM tournament_teams WHERE tournament_id = ?`,
        [tournament.id]
      );
      expect(teams).toHaveLength(2);
      const teamNames = teams.map((t: any) => t.team_name);
      expect(teamNames).toContain('Player1');
      expect(teamNames).toContain('Player2');
    });

    it('does not auto-create teams when teams already exist', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      await db.run(`
        INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES ('team1', ?, 'Existing Team')
      `, [tournament.id]);

      await handleAssignTransition(db as any, tournament.id);

      const teams = await db.all(
        `SELECT * FROM tournament_teams WHERE tournament_id = ?`,
        [tournament.id]
      );
      expect(teams).toHaveLength(1);
    });
  });

  describe('handleBattleTransition', () => {
    it('transitions first round matches from assign to battle', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      const match = await createMatch(game.id, mode.id, { status: 'assign' });

      // Link match to tournament as round 1
      await db.run(`
        INSERT INTO tournament_matches (match_id, tournament_id, round, bracket_type, match_order)
        VALUES (?, ?, 1, 'winners', 1)
      `, [match.id, tournament.id]);

      await handleBattleTransition(db as any, tournament.id);

      const updatedMatch = await db.get(`SELECT status FROM matches WHERE id = ?`, [match.id]);
      expect(updatedMatch.status).toBe('battle');
    });

    it('queues match start announcements for first round matches', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      const match = await createMatch(game.id, mode.id, { status: 'assign' });

      await db.run(`
        INSERT INTO tournament_matches (match_id, tournament_id, round, bracket_type, match_order)
        VALUES (?, ?, 1, 'winners', 1)
      `, [match.id, tournament.id]);

      await handleBattleTransition(db as any, tournament.id);

      const announcements = await db.all(
        `SELECT * FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'match_start'`,
        [match.id]
      );
      expect(announcements.length).toBeGreaterThanOrEqual(1);
    });

    it('does not transition matches not in round 1', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });
      const match = await createMatch(game.id, mode.id, { status: 'assign' });

      await db.run(`
        INSERT INTO tournament_matches (match_id, tournament_id, round, bracket_type, match_order)
        VALUES (?, ?, 2, 'winners', 1)
      `, [match.id, tournament.id]);

      await handleBattleTransition(db as any, tournament.id);

      const updatedMatch = await db.get(`SELECT status FROM matches WHERE id = ?`, [match.id]);
      expect(updatedMatch.status).toBe('assign');
    });
  });

  describe('handleEndTransition', () => {
    it('queues discord event deletion when event exists', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });

      // Insert a discord message record with an event id
      await db.run(`
        INSERT INTO discord_match_messages (id, match_id, discord_event_id, message_id, channel_id, message_type)
        VALUES ('msg1', ?, 'evt123', 'msg123', 'ch123', 'tournament')
      `, [tournament.id]);

      await handleEndTransition(db as any, tournament.id, 'complete');

      const deletions = await db.all(
        `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
        [tournament.id]
      );
      expect(deletions).toHaveLength(1);
    });

    it('does not queue event deletion when no discord event exists', async () => {
      const tournament = await createTournament(game.id, { game_mode_id: mode.id });

      await handleEndTransition(db as any, tournament.id, 'cancelled');

      const deletions = await db.all(
        `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
        [tournament.id]
      );
      expect(deletions).toHaveLength(0);
    });

    it('handles both complete and cancelled status variants', async () => {
      const tournament1 = await createTournament(game.id, { game_mode_id: mode.id });
      const tournament2 = await createTournament(game.id, { game_mode_id: mode.id });

      // Should not throw for either status
      await expect(handleEndTransition(db as any, tournament1.id, 'complete')).resolves.toBeUndefined();
      await expect(handleEndTransition(db as any, tournament2.id, 'cancelled')).resolves.toBeUndefined();
    });
  });
});
