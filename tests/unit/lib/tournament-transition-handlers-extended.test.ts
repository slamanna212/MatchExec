import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seedBasicTestData, createTournament } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: async () => {
    const { getTestDb: getDb } = await import('../../utils/test-db');
    return getDb();
  },
}));

import {
  handleGatherTransition,
  handleAssignTransition,
  handleBattleTransition,
  handleEndTransition,
} from '@/lib/tournament-transition-handlers';
import type { Database } from '@lib/database/connection';

function asDb(db: ReturnType<typeof getTestDb>): Database {
  return db as unknown as Database;
}

describe('Tournament Transition Handlers — Extended', () => {
  let tournamentId: string;

  beforeEach(async () => {
    const { game } = await seedBasicTestData();
    const tournament = await createTournament(game.id);
    tournamentId = tournament.id;
    vi.clearAllMocks();
  });

  describe('handleGatherTransition', () => {
    it('inserts a tournament_phase_changed feed event', async () => {
      const db = getTestDb();
      await handleGatherTransition(asDb(db), tournamentId);

      const row = await db.get<{ event_type: string }>(
        `SELECT event_type FROM activity_feed WHERE tournament_id = ? AND event_type = 'tournament_phase_changed' ORDER BY created_at DESC LIMIT 1`,
        [tournamentId]
      );
      expect(row?.event_type).toBe('tournament_phase_changed');
    });

    it('inserts a discord announcement queue row', async () => {
      const db = getTestDb();
      await handleGatherTransition(asDb(db), tournamentId);

      const row = await db.get<{ announcement_type: string }>(
        `SELECT announcement_type FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'tournament' LIMIT 1`,
        [tournamentId]
      );
      expect(row?.announcement_type).toBe('tournament');
    });

    it('does not create duplicate announcements when called twice', async () => {
      const db = getTestDb();
      await handleGatherTransition(asDb(db), tournamentId);
      await handleGatherTransition(asDb(db), tournamentId);

      const rows = await db.all(
        `SELECT id FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'tournament' AND status IN ('pending', 'posted')`,
        [tournamentId]
      );
      expect(rows.length).toBe(1);
    });

    it('does not throw for unknown tournament', async () => {
      const db = getTestDb();
      await expect(handleGatherTransition(asDb(db), 'nonexistent')).resolves.not.toThrow();
    });
  });

  describe('handleAssignTransition', () => {
    it('inserts a tournament_phase_changed feed event', async () => {
      const db = getTestDb();
      await handleAssignTransition(asDb(db), tournamentId);

      const row = await db.get<{ event_type: string }>(
        `SELECT event_type FROM activity_feed WHERE tournament_id = ? AND event_type = 'tournament_phase_changed' ORDER BY created_at DESC LIMIT 1`,
        [tournamentId]
      );
      expect(row?.event_type).toBe('tournament_phase_changed');
    });

    it('queues a Discord status update to assign', async () => {
      const db = getTestDb();
      await handleAssignTransition(asDb(db), tournamentId);

      const row = await db.get<{ new_status: string }>(
        `SELECT new_status FROM discord_status_update_queue WHERE match_id = ? ORDER BY rowid DESC LIMIT 1`,
        [tournamentId]
      );
      expect(row?.new_status).toBe('assign');
    });

    it('auto-creates solo teams for single-player game modes', async () => {
      const { game } = await seedBasicTestData();
      const db = getTestDb();

      // Create a mode with team_size=1
      const soloModeId = `solo-mode-${Date.now()}`;
      await db.run(
        `INSERT INTO game_modes (id, game_id, name, description, team_size, max_teams) VALUES (?, ?, 'Solo', '', 1, 8)`,
        [soloModeId, game.id]
      );

      const tournament = await createTournament(game.id, { game_mode_id: soloModeId });

      // Add participants
      const participantId = `p-${Date.now()}`;
      await db.run(
        `INSERT INTO tournament_participants (id, tournament_id, user_id, username, discord_user_id) VALUES (?, ?, 'u1', 'SoloPlayer', 'disc1')`,
        [participantId, tournament.id]
      );

      await handleAssignTransition(asDb(db), tournament.id);

      // Solo team should be created
      const team = await db.get<{ team_name: string }>(
        `SELECT team_name FROM tournament_teams WHERE tournament_id = ? LIMIT 1`,
        [tournament.id]
      );
      expect(team?.team_name).toBe('SoloPlayer');
    });
  });

  describe('handleBattleTransition', () => {
    it('inserts a tournament_started feed event', async () => {
      const db = getTestDb();
      await handleBattleTransition(asDb(db), tournamentId);

      const row = await db.get<{ event_type: string }>(
        `SELECT event_type FROM activity_feed WHERE tournament_id = ? AND event_type = 'tournament_started' ORDER BY created_at DESC LIMIT 1`,
        [tournamentId]
      );
      expect(row?.event_type).toBe('tournament_started');
    });

    it('does not throw when no first-round matches exist', async () => {
      const db = getTestDb();
      await expect(handleBattleTransition(asDb(db), tournamentId)).resolves.not.toThrow();
    });
  });

  describe('handleEndTransition', () => {
    it('inserts a tournament_completed feed event for complete status', async () => {
      const db = getTestDb();
      await handleEndTransition(asDb(db), tournamentId, 'complete');

      const row = await db.get<{ event_type: string }>(
        `SELECT event_type FROM activity_feed WHERE tournament_id = ? AND event_type = 'tournament_completed' ORDER BY created_at DESC LIMIT 1`,
        [tournamentId]
      );
      expect(row?.event_type).toBe('tournament_completed');
    });

    it('inserts a tournament_cancelled feed event for cancelled status', async () => {
      const db = getTestDb();
      await handleEndTransition(asDb(db), tournamentId, 'cancelled');

      const row = await db.get<{ event_type: string }>(
        `SELECT event_type FROM activity_feed WHERE tournament_id = ? AND event_type = 'tournament_cancelled' ORDER BY created_at DESC LIMIT 1`,
        [tournamentId]
      );
      expect(row?.event_type).toBe('tournament_cancelled');
    });

    it('does not throw when no Discord event is found', async () => {
      const db = getTestDb();
      await expect(handleEndTransition(asDb(db), tournamentId, 'complete')).resolves.not.toThrow();
    });

    it('does not throw for unknown tournament', async () => {
      const db = getTestDb();
      await expect(handleEndTransition(asDb(db), 'nonexistent', 'cancelled')).resolves.not.toThrow();
    });
  });
});
