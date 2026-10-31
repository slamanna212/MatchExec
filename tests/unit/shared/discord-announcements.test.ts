/**
 * L3 — Discord Announcements Unit Tests
 *
 * Tests for shared/discord-announcements.ts:
 * - postEventAnnouncement happy path
 * - Deduplication (existing row → returns true, no new insert)
 * - DB error → returns false
 * - Announcement row shape
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

vi.mock('../../../src/lib/database-init', () => ({
  getDbInstance: async () => {
    const { getMockDbInstance } = await import('../../mocks/database');
    return getMockDbInstance();
  },
}));

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

describe('Discord Announcements (L3)', () => {
  let gameId: string;
  let modeId: string;
  let db: ReturnType<typeof getTestDb>;

  function makeEventData(matchId: string) {
    return {
      id: matchId,
      name: 'Test Event',
      description: 'A test match',
      game_id: gameId,
      type: 'competitive' as const,
      max_participants: 10,
      guild_id: 'guild_123',
    };
  }

  beforeEach(async () => {
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
    db = getTestDb();
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  it('returns true on successful queue insert', async () => {
    const match = await createMatch(gameId, modeId);
    const { postEventAnnouncement } = await import('../../../shared/discord-announcements');

    const result = await postEventAnnouncement(makeEventData(match.id));
    expect(result).toBe(true);
  });

  it('inserts row with status=pending and announcement_type=standard', async () => {
    const match = await createMatch(gameId, modeId);
    const { postEventAnnouncement } = await import('../../../shared/discord-announcements');

    await postEventAnnouncement(makeEventData(match.id));

    const row = await db.get(
      `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
      [match.id]
    ) as Record<string, unknown> | null;

    expect(row).toBeDefined();
    expect(row!.status).toBe('pending');
    expect(row!.announcement_type).toBe('standard');
    expect(row!.match_id).toBe(match.id);
  });

  it('row id is non-empty string', async () => {
    const match = await createMatch(gameId, modeId);
    const { postEventAnnouncement } = await import('../../../shared/discord-announcements');

    await postEventAnnouncement(makeEventData(match.id));

    const row = await db.get(
      `SELECT id FROM discord_announcement_queue WHERE match_id = ?`,
      [match.id]
    ) as { id: string } | null;

    expect(typeof row!.id).toBe('string');
    expect(row!.id.length).toBeGreaterThan(0);
  });

  // ─── Deduplication ────────────────────────────────────────────────────────

  it('does not insert duplicate when row already exists', async () => {
    const match = await createMatch(gameId, modeId);
    const { postEventAnnouncement } = await import('../../../shared/discord-announcements');

    await postEventAnnouncement(makeEventData(match.id));
    const result = await postEventAnnouncement(makeEventData(match.id));

    expect(result).toBe(true);

    const rows = await db.all(
      `SELECT id FROM discord_announcement_queue WHERE match_id = ?`,
      [match.id]
    ) as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
  });

  it('returns true on duplicate (no error thrown)', async () => {
    const match = await createMatch(gameId, modeId);
    const { postEventAnnouncement } = await import('../../../shared/discord-announcements');

    const first = await postEventAnnouncement(makeEventData(match.id));
    const second = await postEventAnnouncement(makeEventData(match.id));

    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  // ─── DB error ─────────────────────────────────────────────────────────────

  it('returns false when DB throws an error', async () => {
    const dbInitModule = await import('../../../src/lib/database-init');
    const spy = vi.spyOn(dbInitModule, 'getDbInstance').mockRejectedValueOnce(
      new Error('simulated DB failure')
    );

    const { postEventAnnouncement } = await import('../../../shared/discord-announcements');

    const result = await postEventAnnouncement({
      id: 'fake-id',
      name: 'Fail Match',
      description: '',
      game_id: gameId,
      type: 'casual',
      max_participants: 2,
      guild_id: 'g1',
    });

    expect(result).toBe(false);
    spy.mockRestore();
  });
});
