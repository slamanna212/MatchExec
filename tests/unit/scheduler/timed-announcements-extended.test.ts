import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('../../../lib/database', () => ({
  waitForDatabaseReady: vi.fn(),
}));

vi.mock('node-cron', () => ({
  schedule: vi.fn(() => ({ stop: vi.fn() })),
  validate: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../processes/scheduler/jobs/update-avatars', () => ({
  AvatarUpdateJob: vi.fn().mockImplementation(() => ({
    updateAvatars: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

vi.mock('../../../processes/scheduler/jobs/check-for-update', () => ({
  UpdateCheckJob: vi.fn().mockImplementation(() => ({
    checkForUpdate: vi.fn(),
  })),
}));

vi.mock('../../../src/lib/feed-helpers', () => ({
  logFeedEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('MatchExecScheduler — timed announcements extended', () => {
  let scheduler: any;
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;
    vi.clearAllMocks();

    const { MatchExecScheduler } = await import('../../../processes/scheduler/index');
    scheduler = new MatchExecScheduler();
    (scheduler as any).db = db;
  });

  describe('parseAnnouncementsField', () => {
    it('returns two default announcements when the field is truthy boolean (1)', () => {
      const result = (scheduler as any).parseAnnouncementsField(1, 'TestMatch');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('returns two default announcements when the field is truthy boolean (true)', () => {
      const result = (scheduler as any).parseAnnouncementsField(true, 'TestMatch');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ unit: 'hours' });
      expect(result[1]).toMatchObject({ unit: 'minutes' });
    });

    it('returns null when the field is falsy boolean (0)', () => {
      const result = (scheduler as any).parseAnnouncementsField(0, 'TestMatch');
      expect(result).toBeNull();
    });

    it('returns null when the field is falsy boolean (false)', () => {
      const result = (scheduler as any).parseAnnouncementsField(false, 'TestMatch');
      expect(result).toBeNull();
    });

    it('returns null when the field is null/undefined', () => {
      expect((scheduler as any).parseAnnouncementsField(null, 'TestMatch')).toBeNull();
      expect((scheduler as any).parseAnnouncementsField(undefined, 'TestMatch')).toBeNull();
    });

    it('parses a valid JSON array string', () => {
      const json = JSON.stringify([{ id: 'a1', value: 30, unit: 'minutes' }]);
      const result = (scheduler as any).parseAnnouncementsField(json, 'TestMatch');
      expect(result).toEqual([{ id: 'a1', value: 30, unit: 'minutes' }]);
    });

    it('returns null for invalid JSON string', () => {
      const result = (scheduler as any).parseAnnouncementsField('{bad json', 'TestMatch');
      expect(result).toBeNull();
    });
  });

  describe('calculateAnnouncementOffset', () => {
    it('computes correct milliseconds for minutes', () => {
      const result = (scheduler as any).calculateAnnouncementOffset(30, 'minutes');
      expect(result).toBe(30 * 60 * 1000);
    });

    it('computes correct milliseconds for hours', () => {
      const result = (scheduler as any).calculateAnnouncementOffset(2, 'hours');
      expect(result).toBe(2 * 60 * 60 * 1000);
    });

    it('computes correct milliseconds for days', () => {
      const result = (scheduler as any).calculateAnnouncementOffset(1, 'days');
      expect(result).toBe(24 * 60 * 60 * 1000);
    });

    it('returns 0 for unknown unit', () => {
      const result = (scheduler as any).calculateAnnouncementOffset(5, 'weeks');
      expect(result).toBe(0);
    });
  });

  describe('processMatchAnnouncements — failed entry allows re-queue', () => {
    it('re-queues an announcement when the existing entry has failed status', async () => {
      const startDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate.toISOString(),
        status: 'created',
      });

      const announcementObj = { id: 'requeue-2h', value: 2, unit: 'hours' };

      // Pre-insert a FAILED entry — this should NOT block re-queuing
      await db.run(
        `INSERT INTO discord_announcement_queue (id, match_id, status, announcement_type, announcement_data)
         VALUES ('failed-entry', ?, 'failed', 'timed', ?)`,
        [match.id, JSON.stringify(announcementObj)]
      );

      await (scheduler as any).processMatchAnnouncements({
        id: match.id,
        name: match.name,
        start_date: startDate.toISOString(),
        announcements: JSON.stringify([announcementObj]),
      });

      const rows = await db.all(
        `SELECT id, status FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'timed'`,
        [match.id]
      );

      // Should have both the failed entry and the new pending entry
      expect(rows).toHaveLength(2);
      const statuses = rows.map((r: { status: string }) => r.status);
      expect(statuses).toContain('failed');
      expect(statuses).toContain('pending');
    });
  });

  describe('processMatchAnnouncements — multiple announcements', () => {
    it('queues multiple distinct announcements for the same match', async () => {
      const startDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate.toISOString(),
        status: 'created',
      });

      const announcements = [
        { id: 'ann-2h', value: 2, unit: 'hours' },
        { id: 'ann-1h', value: 1, unit: 'hours' },
      ];

      await (scheduler as any).processMatchAnnouncements({
        id: match.id,
        name: match.name,
        start_date: startDate.toISOString(),
        announcements: JSON.stringify(announcements),
      });

      const rows = await db.all(
        `SELECT id FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'timed'`,
        [match.id]
      );

      expect(rows).toHaveLength(2);
    });

    it('queues only the non-duplicate when one of two announcements already exists', async () => {
      const startDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate.toISOString(),
        status: 'created',
      });

      const ann2h = { id: 'ann-2h', value: 2, unit: 'hours' };
      const ann1h = { id: 'ann-1h', value: 1, unit: 'hours' };

      // Pre-insert the 2h announcement as already pending
      await db.run(
        `INSERT INTO discord_announcement_queue (id, match_id, status, announcement_type, announcement_data)
         VALUES ('existing-2h', ?, 'pending', 'timed', ?)`,
        [match.id, JSON.stringify(ann2h)]
      );

      await (scheduler as any).processMatchAnnouncements({
        id: match.id,
        name: match.name,
        start_date: startDate.toISOString(),
        announcements: JSON.stringify([ann2h, ann1h]),
      });

      const rows = await db.all(
        `SELECT announcement_data FROM discord_announcement_queue WHERE match_id = ? AND announcement_type = 'timed'`,
        [match.id]
      );

      expect(rows).toHaveLength(2);
      const dataValues = rows.map((r: { announcement_data: string }) => JSON.parse(r.announcement_data));
      expect(dataValues).toContainEqual(ann2h);
      expect(dataValues).toContainEqual(ann1h);
    });
  });

  describe('handleTimedAnnouncements — status filtering', () => {
    it('does not process matches with battle status', async () => {
      const startDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate.toISOString(),
        status: 'battle',
      });
      await db.run(
        `UPDATE matches SET announcements = ? WHERE id = ?`,
        [JSON.stringify([{ id: 'battle-ann', value: 2, unit: 'hours' }]), match.id]
      );

      await (scheduler as any).handleTimedAnnouncements();

      const rows = await db.all(
        `SELECT id FROM discord_announcement_queue WHERE announcement_type = 'timed'`
      );
      expect(rows).toHaveLength(0);
    });

    it('does not process matches with complete status', async () => {
      const startDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate.toISOString(),
        status: 'complete',
      });
      await db.run(
        `UPDATE matches SET announcements = ? WHERE id = ?`,
        [JSON.stringify([{ id: 'complete-ann', value: 2, unit: 'hours' }]), match.id]
      );

      await (scheduler as any).handleTimedAnnouncements();

      const rows = await db.all(
        `SELECT id FROM discord_announcement_queue WHERE announcement_type = 'timed'`
      );
      expect(rows).toHaveLength(0);
    });

    it('processes matches with created, gather, and assign statuses', async () => {
      const startDate = new Date(Date.now() + 3 * 60 * 60 * 1000);

      for (const status of ['created', 'gather', 'assign'] as const) {
        const m = await createMatch(game.id, mode.id, {
          start_date: startDate.toISOString(),
          status,
        });
        await db.run(
          `UPDATE matches SET announcements = ? WHERE id = ?`,
          [JSON.stringify([{ id: `ann-${status}`, value: 2, unit: 'hours' }]), m.id]
        );
      }

      await (scheduler as any).handleTimedAnnouncements();

      const rows = await db.all(
        `SELECT id FROM discord_announcement_queue WHERE announcement_type = 'timed'`
      );
      expect(rows).toHaveLength(3);
    });
  });
});
