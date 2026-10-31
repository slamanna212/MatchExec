import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(async () => {
    const { getTestDb } = await import('../../utils/test-db');
    return getTestDb();
  }),
}));

import { logFeedEvent } from '@/lib/feed-helpers';
import { getTestDb } from '../../utils/test-db';

describe('logFeedEvent — Extended', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('NULL field handling', () => {
    it('stores NULL for description when omitted', async () => {
      const db = getTestDb();
      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'No Desc' });

      const row = await db.get<{ description: string | null }>(
        `SELECT description FROM activity_feed WHERE title = 'No Desc' ORDER BY rowid DESC LIMIT 1`
      );
      expect(row?.description).toBeNull();
    });

    it('stores NULL for match_id when omitted', async () => {
      const db = getTestDb();
      await logFeedEvent({ eventType: 'tournament_created', priority: 2, title: 'No Match' });

      const row = await db.get<{ match_id: string | null }>(
        `SELECT match_id FROM activity_feed WHERE title = 'No Match' ORDER BY rowid DESC LIMIT 1`
      );
      expect(row?.match_id).toBeNull();
    });

    it('stores NULL for tournament_id when omitted', async () => {
      const db = getTestDb();
      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'No Tournament' });

      const row = await db.get<{ tournament_id: string | null }>(
        `SELECT tournament_id FROM activity_feed WHERE title = 'No Tournament' ORDER BY rowid DESC LIMIT 1`
      );
      expect(row?.tournament_id).toBeNull();
    });

    it('stores NULL for metadata when omitted', async () => {
      const db = getTestDb();
      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'No Meta' });

      const row = await db.get<{ metadata: string | null }>(
        `SELECT metadata FROM activity_feed WHERE title = 'No Meta' ORDER BY rowid DESC LIMIT 1`
      );
      expect(row?.metadata).toBeNull();
    });
  });

  describe('metadata JSON round-trips', () => {
    it('round-trips nested object metadata', async () => {
      const db = getTestDb();
      const metadata = {
        match: { id: 'abc', status: 'complete' },
        scores: { blue: 3, red: 1 },
      };
      await logFeedEvent({
        eventType: 'match_completed',
        priority: 2,
        title: 'Nested Meta',
        metadata,
      });

      const row = await db.get<{ metadata: string }>(
        `SELECT metadata FROM activity_feed WHERE title = 'Nested Meta' ORDER BY rowid DESC LIMIT 1`
      );
      const parsed = JSON.parse(row!.metadata);
      expect(parsed.match.id).toBe('abc');
      expect(parsed.scores.blue).toBe(3);
    });

    it('round-trips array values in metadata', async () => {
      const db = getTestDb();
      const metadata = { participants: ['user-1', 'user-2', 'user-3'], tags: [] };
      await logFeedEvent({
        eventType: 'match_created',
        priority: 1,
        title: 'Array Meta',
        metadata,
      });

      const row = await db.get<{ metadata: string }>(
        `SELECT metadata FROM activity_feed WHERE title = 'Array Meta' ORDER BY rowid DESC LIMIT 1`
      );
      const parsed = JSON.parse(row!.metadata);
      expect(parsed.participants).toHaveLength(3);
      expect(parsed.participants[1]).toBe('user-2');
      expect(parsed.tags).toHaveLength(0);
    });

    it('round-trips metadata with special string characters', async () => {
      const db = getTestDb();
      const metadata = { message: 'Hello "world" & <test>' };
      await logFeedEvent({
        eventType: 'match_created',
        priority: 1,
        title: 'Special Chars Meta',
        metadata,
      });

      const row = await db.get<{ metadata: string }>(
        `SELECT metadata FROM activity_feed WHERE title = 'Special Chars Meta' ORDER BY rowid DESC LIMIT 1`
      );
      const parsed = JSON.parse(row!.metadata);
      expect(parsed.message).toBe('Hello "world" & <test>');
    });

    it('round-trips metadata with numeric and boolean values', async () => {
      const db = getTestDb();
      const metadata = { count: 42, ratio: 0.75, active: true, disabled: false };
      await logFeedEvent({
        eventType: 'match_completed',
        priority: 1,
        title: 'Mixed Types Meta',
        metadata,
      });

      const row = await db.get<{ metadata: string }>(
        `SELECT metadata FROM activity_feed WHERE title = 'Mixed Types Meta' ORDER BY rowid DESC LIMIT 1`
      );
      const parsed = JSON.parse(row!.metadata);
      expect(parsed.count).toBe(42);
      expect(parsed.ratio).toBe(0.75);
      expect(parsed.active).toBe(true);
      expect(parsed.disabled).toBe(false);
    });
  });

  describe('event associations', () => {
    it('stores both matchId and tournamentId when both provided', async () => {
      const db = getTestDb();
      await logFeedEvent({
        eventType: 'tournament_phase_changed',
        priority: 2,
        title: 'Both IDs',
        matchId: 'match-dual',
        tournamentId: 'tourney-dual',
      });

      const row = await db.get<{ match_id: string; tournament_id: string }>(
        `SELECT match_id, tournament_id FROM activity_feed WHERE title = 'Both IDs' ORDER BY rowid DESC LIMIT 1`
      );
      expect(row?.match_id).toBe('match-dual');
      expect(row?.tournament_id).toBe('tourney-dual');
    });

    it('multiple events for same match all stored and retrievable', async () => {
      const db = getTestDb();
      const matchId = 'multi-event-match';

      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'Created', matchId });
      await logFeedEvent({ eventType: 'match_phase_changed', priority: 1, title: 'Phase Change', matchId });
      await logFeedEvent({ eventType: 'match_completed', priority: 2, title: 'Completed', matchId });

      const rows = await db.all(
        `SELECT event_type FROM activity_feed WHERE match_id = ? ORDER BY rowid ASC`,
        [matchId]
      );
      expect(rows).toHaveLength(3);
      expect((rows[0] as { event_type: string }).event_type).toBe('match_created');
      expect((rows[2] as { event_type: string }).event_type).toBe('match_completed');
    });
  });

  describe('priority storage', () => {
    it('stores priority 1 (minimum)', async () => {
      const db = getTestDb();
      await logFeedEvent({ eventType: 'match_created', priority: 1, title: 'Priority One' });

      const row = await db.get<{ priority: number }>(
        `SELECT priority FROM activity_feed WHERE title = 'Priority One' ORDER BY rowid DESC LIMIT 1`
      );
      expect(row?.priority).toBe(1);
    });

    it('stores priority 4 (maximum)', async () => {
      const db = getTestDb();
      await logFeedEvent({ eventType: 'match_cancelled', priority: 4, title: 'Priority Four' });

      const row = await db.get<{ priority: number }>(
        `SELECT priority FROM activity_feed WHERE title = 'Priority Four' ORDER BY rowid DESC LIMIT 1`
      );
      expect(row?.priority).toBe(4);
    });
  });

  describe('non-throwing behavior', () => {
    it('never throws regardless of error conditions', async () => {
      // logFeedEvent swallows errors — it must never propagate them
      await expect(
        logFeedEvent({ eventType: 'match_created', priority: 1, title: 'Safe Call' })
      ).resolves.toBeUndefined();
    });

    it('all event types log without throwing', async () => {
      const eventTypes: Parameters<typeof logFeedEvent>[0]['eventType'][] = [
        'match_created',
        'match_phase_changed',
        'match_completed',
        'match_cancelled',
        'tournament_created',
        'tournament_phase_changed',
        'tournament_started',
        'tournament_completed',
        'tournament_cancelled',
        'update_available',
      ];

      for (const eventType of eventTypes) {
        await expect(
          logFeedEvent({ eventType, priority: 1, title: `Event ${eventType}` })
        ).resolves.toBeUndefined();
      }
    });
  });
});
