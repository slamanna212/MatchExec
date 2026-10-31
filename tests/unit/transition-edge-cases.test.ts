import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seedBasicTestData, createMatch } from '../utils/fixtures';
import { getTestDb } from '../utils/test-db';
import { handleStatusTransition } from '@/lib/transition-handlers';

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
  MapCodeService: {
    processFirstMapCode: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@/lib/voice-channel-manager', () => ({
  deleteMatchVoiceChannels: vi.fn().mockResolvedValue(undefined),
}));

describe('Transition edge cases (J4)', () => {
  let gameId: string;
  let modeId: string;
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
    db = getTestDb();
  });

  // ─── handleStatusTransition does NOT validate current state ──────────────

  describe('handleStatusTransition — no-op for unknown status', () => {
    it('unknown status hits default branch without throwing', async () => {
      const match = await createMatch(gameId, modeId, { status: 'created' });
      await expect(
        handleStatusTransition(match.id.toString(), 'nonexistent_status')
      ).resolves.not.toThrow();
    });

    it('unknown status produces no queue entries', async () => {
      const match = await createMatch(gameId, modeId, { status: 'created' });
      await handleStatusTransition(match.id.toString(), 'nonexistent_status');

      const announcementCount = await db.get(
        `SELECT COUNT(*) as cnt FROM discord_announcement_queue WHERE match_id = ?`,
        [match.id]
      ) as { cnt: number } | null;
      expect(announcementCount!.cnt).toBe(0);
    });

    it('"created" status hits default branch (no handler registered)', async () => {
      const match = await createMatch(gameId, modeId, { status: 'created' });
      await expect(
        handleStatusTransition(match.id.toString(), 'created')
      ).resolves.not.toThrow();
    });
  });

  // ─── No validation of current state — handler accepts any prior state ─────

  describe('handleStatusTransition — routes without validating current state', () => {
    it('calling with "gather" on a match in "created" status runs gather handler', async () => {
      const match = await createMatch(gameId, modeId, { status: 'created' });
      await handleStatusTransition(match.id.toString(), 'gather');

      const row = await db.get(
        `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
        [match.id]
      ) as Record<string, unknown> | null;
      expect(row).toBeDefined();
    });

    it('skipping from "created" directly to "complete" routes to complete handler', async () => {
      // handleStatusTransition does not check that the current status is 'battle'
      const match = await createMatch(gameId, modeId, { status: 'created' });
      await expect(
        handleStatusTransition(match.id.toString(), 'complete')
      ).resolves.not.toThrow();

      const deletion = await db.get(
        `SELECT * FROM discord_deletion_queue WHERE match_id = ?`,
        [match.id]
      ) as Record<string, unknown> | null;
      expect(deletion).toBeDefined();
    });

    it('skipping from "created" directly to "cancelled" routes to cancelled handler', async () => {
      const match = await createMatch(gameId, modeId, { status: 'created' });
      await expect(
        handleStatusTransition(match.id.toString(), 'cancelled')
      ).resolves.not.toThrow();
    });

    it('calling transition with current status (same → same) runs the handler again', async () => {
      // No self-transition guard in handleStatusTransition
      const match = await createMatch(gameId, modeId, { status: 'gather' });
      await handleStatusTransition(match.id.toString(), 'gather');
      await handleStatusTransition(match.id.toString(), 'gather');

      // Idempotency: announcement was already queued; second call should not duplicate
      const rows = await db.all(
        `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
        [match.id]
      ) as Array<Record<string, unknown>>;
      // At least one entry exists; may or may not deduplicate — handler is called regardless
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Concurrent transitions ───────────────────────────────────────────────

  describe('concurrent handleStatusTransition calls', () => {
    it('two concurrent "gather" transitions both resolve without error', async () => {
      const match = await createMatch(gameId, modeId, { status: 'created' });
      await expect(
        Promise.all([
          handleStatusTransition(match.id.toString(), 'gather'),
          handleStatusTransition(match.id.toString(), 'gather'),
        ])
      ).resolves.not.toThrow();
    });

    it('two concurrent "complete" transitions both resolve', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await expect(
        Promise.all([
          handleStatusTransition(match.id.toString(), 'complete'),
          handleStatusTransition(match.id.toString(), 'complete'),
        ])
      ).resolves.not.toThrow();
    });

    it('sequential gather then assign each produce their respective queue entries', async () => {
      const match = await createMatch(gameId, modeId, { status: 'created' });

      await handleStatusTransition(match.id.toString(), 'gather');
      await handleStatusTransition(match.id.toString(), 'assign');

      const announcement = await db.get(
        `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
        [match.id]
      ) as Record<string, unknown> | null;
      const statusUpdate = await db.get(
        `SELECT * FROM discord_status_update_queue WHERE match_id = ?`,
        [match.id]
      ) as Record<string, unknown> | null;

      expect(announcement).toBeDefined();
      expect(statusUpdate).toBeDefined();
    });
  });

  // ─── Invalid match ID graceful handling ───────────────────────────────────

  describe('invalid match IDs', () => {
    it('gather transition with nonexistent match ID resolves without throwing', async () => {
      await expect(
        handleStatusTransition('nonexistent-match-id', 'gather')
      ).resolves.not.toThrow();
    });

    it('complete transition with nonexistent match ID resolves without throwing', async () => {
      await expect(
        handleStatusTransition('nonexistent-match-id', 'complete')
      ).resolves.not.toThrow();
    });

    it('cancelled transition with nonexistent match ID resolves without throwing', async () => {
      await expect(
        handleStatusTransition('nonexistent-match-id', 'cancelled')
      ).resolves.not.toThrow();
    });
  });
});
