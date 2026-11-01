import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { seedBasicTestData, createMatch } from '../../utils/pg-fixtures';
import { db as pgDb } from '../../../lib/db';
import { and, eq } from 'drizzle-orm';
import { discordAnnouncementQueue } from '../../../lib/db/schema';

const queuedFor = (matchId?: string) => pgDb.select().from(discordAnnouncementQueue)
  .where(matchId ? and(eq(discordAnnouncementQueue.match_id, matchId), eq(discordAnnouncementQueue.announcement_type, 'timed')) : eq(discordAnnouncementQueue.announcement_type, 'timed'));

// Mock logger to prevent database access during import
vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));


// Mock node-cron so scheduled tasks don't actually start
vi.mock('node-cron', () => ({
  schedule: vi.fn(() => ({ stop: vi.fn() })),
}));

// Mock AvatarUpdateJob
vi.mock('../../../processes/scheduler/jobs/update-avatars', () => ({
  AvatarUpdateJob: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

setupPgTestFile();

describe('MatchExecScheduler — timed announcements', () => {
  let scheduler: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;

    // Import scheduler after mocks are set up
    const { MatchExecScheduler } = await import('../../../processes/scheduler/index');
    scheduler = new MatchExecScheduler();
  });

  describe('processMatchAnnouncements', () => {
    it('should queue announcements within the 2-hour look-ahead window', async () => {
      // Match starts in 3 hours; "2 hours before" announcement fires in 1 hour (within look-ahead)
      const startDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate,
        status: 'created',
      });

      // announcements must be a JSON string (as stored in DB)
      const announcements = JSON.stringify([{ id: 'test-2h', value: 2, unit: 'hours' }]);

      await (scheduler as any).processMatchAnnouncements({
        id: match.id,
        name: match.name,
        start_date: startDate.toISOString(),
        announcements,
      });

      const queued = (await queuedFor(match.id))[0];

      expect(queued).not.toBeUndefined();
      expect(queued.announcement_type).toBe('timed');
      expect(queued.scheduled_for).not.toBeNull();
    });

    it('should queue announcements within the 30-minute catch-up window', async () => {
      // Match starts in 10 minutes; "15-minute before" announcement fired 5 minutes ago
      const startDate = new Date(Date.now() + 10 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate,
        status: 'gather',
      });

      const announcements = JSON.stringify([{ id: 'test-15min', value: 15, unit: 'minutes' }]);

      await (scheduler as any).processMatchAnnouncements({
        id: match.id,
        name: match.name,
        start_date: startDate.toISOString(),
        announcements,
      });

      const queued = (await queuedFor(match.id))[0];

      expect(queued).not.toBeUndefined();
    });

    it('should not queue announcements outside both windows (too far in the future)', async () => {
      // Match starts in 10 hours; "3-hour before" announcement fires in 7 hours — beyond 2-hour look-ahead
      const startDate = new Date(Date.now() + 10 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate,
        status: 'created',
      });

      const announcements = JSON.stringify([{ id: 'test-3h', value: 3, unit: 'hours' }]);

      await (scheduler as any).processMatchAnnouncements({
        id: match.id,
        name: match.name,
        start_date: startDate.toISOString(),
        announcements,
      });

      const queued = (await queuedFor(match.id))[0];

      expect(queued).toBeUndefined();
    });

    it('should not queue announcements older than 30 minutes (too late to send)', async () => {
      // Match starts in 5 minutes; "1-hour before" announcement was 55 minutes ago — beyond catch-up window
      const startDate = new Date(Date.now() + 5 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate,
        status: 'gather',
      });

      const announcements = JSON.stringify([{ id: 'test-1h-late', value: 1, unit: 'hours' }]);

      await (scheduler as any).processMatchAnnouncements({
        id: match.id,
        name: match.name,
        start_date: startDate.toISOString(),
        announcements,
      });

      const queued = (await queuedFor(match.id))[0];

      expect(queued).toBeUndefined();
    });

    it('should not re-queue an already queued announcement (deduplication)', async () => {
      const startDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate,
        status: 'created',
      });

      const announcementObj = { id: 'test-2h-dedup', value: 2, unit: 'hours' };

      // Pre-insert an existing pending entry
      await pgDb.insert(discordAnnouncementQueue).values({ id: 'existing-entry', match_id: match.id, status: 'pending', announcement_type: 'timed', announcement_data: announcementObj });

      await (scheduler as any).processMatchAnnouncements({
        id: match.id,
        name: match.name,
        start_date: startDate.toISOString(),
        announcements: JSON.stringify([announcementObj]),
      });

      const rows = await queuedFor(match.id);

      // Should still be exactly one entry
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('existing-entry');
    });

    it('should handle invalid JSON in announcements field gracefully', async () => {
      const startDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate,
        status: 'created',
      });

      await expect(
        (scheduler as any).processMatchAnnouncements({
          id: match.id,
          name: match.name,
          start_date: startDate.toISOString(),
          announcements: 'not valid json {{{',
        })
      ).resolves.not.toThrow();

      const queued = (await queuedFor(match.id))[0];
      expect(queued).toBeUndefined();
    });
  });

  describe('queueTimedAnnouncement', () => {
    it('should store scheduled_for timestamp in the queue entry', async () => {
      const startDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        start_date: startDate,
      });

      const announcement = { id: 'test-1h', value: 1, unit: 'hours' };
      const scheduledFor = new Date(startDate.getTime() - 60 * 60 * 1000);

      await (scheduler as any).queueTimedAnnouncement(match.id, announcement, scheduledFor);

      const [row] = await pgDb.select().from(discordAnnouncementQueue);

      expect(row).not.toBeUndefined();
      expect(row!.match_id).toBe(match.id);
      expect(row!.scheduled_for?.toISOString()).toBe(scheduledFor.toISOString());
    });
  });
});
