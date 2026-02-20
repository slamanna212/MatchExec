import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seedBasicTestData, createMatch } from '../utils/fixtures';
import { getTestDb } from '../utils/test-db';
import {
  handleStatusTransition,
  handleGatherTransition,
  handleAssignTransition,
  handleBattleTransition,
  handleCompleteTransition,
  handleCancelledTransition
} from '@/lib/transition-handlers';

// Mock database to use test DB instead of production DB
vi.mock('@/lib/database-init', () => ({
  getDbInstance: async () => {
    const { getMockDbInstance } = await import('../mocks/database');
    return getMockDbInstance();
  }
}));

// Mock the voice channel service
vi.mock('@/lib/voice-channel-service', () => ({
  VoiceChannelService: {
    setupMatchVoiceChannels: vi.fn().mockResolvedValue(undefined),
    queueVoiceAnnouncement: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock the map code service
vi.mock('@/lib/map-code-service', () => ({
  MapCodeService: {
    processFirstMapCode: vi.fn().mockResolvedValue(true)
  }
}));

// Mock voice channel manager
vi.mock('@/lib/voice-channel-manager', () => ({
  deleteMatchVoiceChannels: vi.fn().mockResolvedValue(undefined)
}));

describe('Transition Handlers', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    vi.clearAllMocks();
  });

  describe('handleGatherTransition', () => {
    it('should queue Discord announcement when match enters gather', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'created' });

      await handleGatherTransition(match.id.toString());

      const db = getTestDb();
      const announcement = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'standard'`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(announcement).toBeDefined();
      expect(announcement.status).toBe('pending');
    });

    it('should not create duplicate announcements', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'created' });

      // Call twice
      await handleGatherTransition(match.id.toString());
      await handleGatherTransition(match.id.toString());

      const db = getTestDb();
      const announcements = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'standard'`,
          [match.id],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });

      expect(announcements).toHaveLength(1); // Should only have 1
    });

    it('should handle errors gracefully without throwing', async () => {
      // Use an invalid match ID
      await expect(handleGatherTransition('invalid-match-id')).resolves.not.toThrow();
    });
  });

  describe('handleAssignTransition', () => {
    it('should queue Discord status update when match enters assign', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'gather' });

      await handleAssignTransition(match.id.toString());

      const db = getTestDb();
      const statusUpdate = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_status_update_queue WHERE match_id = ? AND new_status = 'assign'`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(statusUpdate).toBeDefined();
      expect(statusUpdate.status).toBe('pending');
    });

    it('should call voice channel setup', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'gather' });
      const { VoiceChannelService } = await import('@/lib/voice-channel-service');

      await handleAssignTransition(match.id.toString());

      expect(VoiceChannelService.setupMatchVoiceChannels).toHaveBeenCalledWith(match.id.toString());
    });

    it('should handle voice channel errors without failing', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'gather' });
      const { VoiceChannelService } = await import('@/lib/voice-channel-service');

      // Make voice channel setup fail
      vi.mocked(VoiceChannelService.setupMatchVoiceChannels).mockRejectedValueOnce(new Error('Voice setup failed'));

      // Should not throw
      await expect(handleAssignTransition(match.id.toString())).resolves.not.toThrow();
    });
  });

  describe('handleBattleTransition', () => {
    it('should queue welcome voice announcement when match enters battle', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'assign' });
      const { VoiceChannelService } = await import('@/lib/voice-channel-service');

      await handleBattleTransition(match.id.toString());

      expect(VoiceChannelService.queueVoiceAnnouncement).toHaveBeenCalledWith(
        match.id.toString(),
        'welcome'
      );
    });

    it('should queue Discord match start announcement', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'assign' });

      await handleBattleTransition(match.id.toString());

      const db = getTestDb();
      const announcement = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'match_start'`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(announcement).toBeDefined();
      expect(announcement.status).toBe('pending');
    });

    it('should initialize match games for all maps', async () => {
      const db = getTestDb();

      // Create a map
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`,
          ['battle-map-1', game.id, mode.id, 'Battle Map 1'],
          (err) => err ? reject(err) : resolve()
        );
      });

      const match = await createMatch(game.id, mode.id, {
        status: 'assign',
        maps: JSON.stringify(['battle-map-1', 'battle-map-1'])
      });

      await handleBattleTransition(match.id.toString());

      const matchGames = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT * FROM match_games WHERE match_id = ?`,
          [match.id],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });

      expect(matchGames.length).toBeGreaterThan(0);
      expect(matchGames[0].status).toBe('ongoing'); // First map should be ongoing
    });

    it('should process first map code', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'assign' });
      const { MapCodeService } = await import('@/lib/map-code-service');

      await handleBattleTransition(match.id.toString());

      expect(MapCodeService.processFirstMapCode).toHaveBeenCalledWith(match.id.toString());
    });

    it('should handle errors without throwing', async () => {
      const { VoiceChannelService } = await import('@/lib/voice-channel-service');
      vi.mocked(VoiceChannelService.queueVoiceAnnouncement).mockRejectedValueOnce(new Error('Failed'));

      await expect(handleBattleTransition('some-match-id')).resolves.not.toThrow();
    });
  });

  describe('handleCompleteTransition', () => {
    it('should queue Discord deletion when match is completed', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'battle' });

      await handleCompleteTransition(match.id.toString());

      const db = getTestDb();
      const deletion = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(deletion).toBeDefined();
      expect(deletion.status).toBe('pending');
    });

    it('should call delete voice channels', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'battle' });
      const { deleteMatchVoiceChannels } = await import('@/lib/voice-channel-manager');

      await handleCompleteTransition(match.id.toString());

      expect(deleteMatchVoiceChannels).toHaveBeenCalledWith(match.id.toString());
    });

    it('should handle errors gracefully', async () => {
      const { deleteMatchVoiceChannels } = await import('@/lib/voice-channel-manager');
      vi.mocked(deleteMatchVoiceChannels).mockRejectedValueOnce(new Error('Delete failed'));

      await expect(handleCompleteTransition('some-match-id')).resolves.not.toThrow();
    });
  });

  describe('handleCancelledTransition', () => {
    it('should queue Discord deletion when match is cancelled', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'gather' });

      await handleCancelledTransition(match.id.toString());

      const db = getTestDb();
      const deletion = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(deletion).toBeDefined();
      expect(deletion.status).toBe('pending');
    });

    it('should call delete voice channels', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'gather' });
      const { deleteMatchVoiceChannels } = await import('@/lib/voice-channel-manager');

      await handleCancelledTransition(match.id.toString());

      expect(deleteMatchVoiceChannels).toHaveBeenCalledWith(match.id.toString());
    });

    it('should handle cleanup errors gracefully', async () => {
      await expect(handleCancelledTransition('invalid-match-id')).resolves.not.toThrow();
    });
  });

  describe('handleStatusTransition', () => {
    it('should route to gather handler for gather status', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'created' });

      await handleStatusTransition(match.id.toString(), 'gather');

      const db = getTestDb();
      const announcement = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(announcement).toBeDefined();
    });

    it('should route to assign handler for assign status', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'gather' });

      await handleStatusTransition(match.id.toString(), 'assign');

      const db = getTestDb();
      const statusUpdate = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_status_update_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(statusUpdate).toBeDefined();
    });

    it('should route to battle handler for battle status', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'assign' });

      await handleStatusTransition(match.id.toString(), 'battle');

      const db = getTestDb();
      const announcement = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'match_start'`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(announcement).toBeDefined();
    });

    it('should route to complete handler for complete status', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'battle' });

      await handleStatusTransition(match.id.toString(), 'complete');

      const db = getTestDb();
      const deletion = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(deletion).toBeDefined();
    });

    it('should route to cancelled handler for cancelled status', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'gather' });

      await handleStatusTransition(match.id.toString(), 'cancelled');

      const db = getTestDb();
      const deletion = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(deletion).toBeDefined();
    });

    it('should handle unknown status without error', async () => {
      const match = await createMatch(game.id, mode.id);

      await expect(handleStatusTransition(match.id.toString(), 'unknown-status')).resolves.not.toThrow();
    });

    it('should handle created status without special handling', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'created' });

      await handleStatusTransition(match.id.toString(), 'created');

      // Should not queue anything
      const db = getTestDb();
      const announcement = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(announcement).toBeUndefined();
    });
  });

  describe('State Transition Validation', () => {
    // Note: handleStatusTransition is a side-effect router, not a validator.
    // It does NOT reject invalid transitions (e.g., created -> battle).
    // Transition validation is enforced by the API route layer, not here.
    // These tests verify correct handler routing and side effects.

    it('should allow valid forward transitions and produce expected side effects', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id, { status: 'created' });

      // created → gather: should queue announcement
      await handleStatusTransition(match.id.toString(), 'gather');
      const announcement = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'standard'`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });
      expect(announcement).toBeDefined();
      expect(announcement.status).toBe('pending');

      // gather → assign: should queue status update
      await handleStatusTransition(match.id.toString(), 'assign');
      const statusUpdate = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_status_update_queue WHERE match_id = ? AND new_status = 'assign'`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });
      expect(statusUpdate).toBeDefined();
      expect(statusUpdate.status).toBe('pending');

      // assign → battle: should queue match_start announcement
      await handleStatusTransition(match.id.toString(), 'battle');
      const battleAnnouncement = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'match_start'`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });
      expect(battleAnnouncement).toBeDefined();

      // battle → complete: should queue deletion
      await handleStatusTransition(match.id.toString(), 'complete');
      const deletion = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });
      expect(deletion).toBeDefined();
      expect(deletion.status).toBe('pending');
    });

    it('should allow battle → cancelled transition', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id, { status: 'battle' });

      await handleStatusTransition(match.id.toString(), 'cancelled');

      const deletion = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });
      expect(deletion).toBeDefined();
      expect(deletion.status).toBe('pending');
    });

    it('should not produce side effects for unknown statuses', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id, { status: 'created' });

      await handleStatusTransition(match.id.toString(), 'nonexistent-status');

      // Verify no queues were populated
      const announcements = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
          [match.id],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });
      expect(announcements).toHaveLength(0);

      const deletions = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
          [match.id],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });
      expect(deletions).toHaveLength(0);
    });
  });
});
