import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seedBasicTestData, createMatch } from '../utils/fixtures';
import { getTestDb } from '../utils/test-db';
import {
  handleStatusTransition,
  handleGatherTransition,
  handleCompleteTransition,
  handleCancelledTransition,
} from '@/lib/transition-handlers';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: async () => {
    const { getMockDbInstance } = await import('../mocks/database');
    return getMockDbInstance();
  },
}));

vi.mock('@/lib/voice-channel-service', () => ({
  VoiceChannelService: {
    setupMatchVoiceChannels: vi.fn().mockResolvedValue(undefined),
    queueVoiceAnnouncement: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/map-code-service', () => ({
  MapCodeService: { processFirstMapCode: vi.fn().mockResolvedValue(true) },
}));

vi.mock('@/lib/voice-channel-manager', () => ({
  deleteMatchVoiceChannels: vi.fn().mockResolvedValue(undefined),
}));

describe('Transition Handlers — Extended', () => {
  let game: { id: string };
  let mode: { id: string };

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    vi.clearAllMocks();
  });

  describe('handleGatherTransition — feed event side-effect', () => {
    it('inserts a match_phase_changed feed event on gather', async () => {
      const match = await createMatch(game.id, mode.id);
      const db = getTestDb();

      await handleGatherTransition(match.id);

      const row = await db.get<{ event_type: string }>(
        `SELECT event_type FROM activity_feed WHERE match_id = ? AND event_type = 'match_phase_changed' ORDER BY created_at DESC LIMIT 1`,
        [match.id]
      );
      expect(row?.event_type).toBe('match_phase_changed');
    });

    it('does not throw for a nonexistent match', async () => {
      await expect(handleGatherTransition('nonexistent-match')).resolves.not.toThrow();
    });

    it('calling twice does not insert duplicate announcements', async () => {
      const match = await createMatch(game.id, mode.id);
      await handleGatherTransition(match.id);
      await handleGatherTransition(match.id);

      const db = getTestDb();
      const rows = await db.all(
        `SELECT id FROM discord_announcement_queue WHERE match_id = ? AND status IN ('pending', 'posted')`,
        [match.id]
      );
      expect(rows.length).toBeLessThanOrEqual(1);
    });
  });

  describe('handleCompleteTransition — side-effects', () => {
    it('inserts a discord_deletion_queue row', async () => {
      const match = await createMatch(game.id, mode.id);
      const db = getTestDb();

      await handleCompleteTransition(match.id);

      const row = await db.get<{ match_id: string }>(
        `SELECT match_id FROM discord_deletion_queue WHERE match_id = ?`,
        [match.id]
      );
      expect(row?.match_id).toBe(match.id);
    });

    it('does not throw for unknown match', async () => {
      await expect(handleCompleteTransition('ghost-match')).resolves.not.toThrow();
    });
  });

  describe('handleCancelledTransition — side-effects', () => {
    it('inserts a discord_deletion_queue row', async () => {
      const match = await createMatch(game.id, mode.id);
      const db = getTestDb();

      await handleCancelledTransition(match.id);

      const row = await db.get<{ match_id: string }>(
        `SELECT match_id FROM discord_deletion_queue WHERE match_id = ?`,
        [match.id]
      );
      expect(row?.match_id).toBe(match.id);
    });

    it('inserts a match_cancelled feed event', async () => {
      const match = await createMatch(game.id, mode.id);
      const db = getTestDb();

      await handleCancelledTransition(match.id);

      const row = await db.get<{ event_type: string }>(
        `SELECT event_type FROM activity_feed WHERE match_id = ? AND event_type = 'match_cancelled' ORDER BY created_at DESC LIMIT 1`,
        [match.id]
      );
      expect(row?.event_type).toBe('match_cancelled');
    });
  });

  describe('handleStatusTransition — routing and unknowns', () => {
    it('does not throw for an unknown status', async () => {
      const match = await createMatch(game.id, mode.id);
      await expect(handleStatusTransition(match.id, 'unknown-status')).resolves.not.toThrow();
    });

    it('does not throw for "created" status', async () => {
      const match = await createMatch(game.id, mode.id);
      await expect(handleStatusTransition(match.id, 'created')).resolves.not.toThrow();
    });

    it('routes "gather" status to gather handler', async () => {
      const match = await createMatch(game.id, mode.id);
      const db = getTestDb();

      await handleStatusTransition(match.id, 'gather');

      // Feed event logged by gather handler
      const row = await db.get<{ event_type: string }>(
        `SELECT event_type FROM activity_feed WHERE match_id = ? ORDER BY created_at DESC LIMIT 1`,
        [match.id]
      );
      expect(row?.event_type).toBe('match_phase_changed');
    });

    it('routes "cancelled" status to cancelled handler and logs feed event', async () => {
      const match = await createMatch(game.id, mode.id);
      const db = getTestDb();

      await handleStatusTransition(match.id, 'cancelled');

      const row = await db.get<{ event_type: string }>(
        `SELECT event_type FROM activity_feed WHERE match_id = ? AND event_type = 'match_cancelled' LIMIT 1`,
        [match.id]
      );
      expect(row?.event_type).toBe('match_cancelled');
    });

    it('is safe to call twice with same status', async () => {
      const match = await createMatch(game.id, mode.id);
      await expect(async () => {
        await handleStatusTransition(match.id, 'gather');
        await handleStatusTransition(match.id, 'gather');
      }).not.toThrow();
    });
  });
});
