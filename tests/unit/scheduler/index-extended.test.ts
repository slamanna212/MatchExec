import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { eq } from 'drizzle-orm';
import { db as pgDb } from '../../../lib/db';
import { matches } from '../../../lib/db/schema';
import { discordReminderQueue } from '../../../lib/db/schema';
import { seedBasicTestData, createMatch, createDiscordSettings, createMatchGame } from '../../utils/pg-fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('node-cron', () => ({
  schedule: vi.fn(() => ({ stop: vi.fn() })),
  validate: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../processes/scheduler/jobs/update-avatars', () => ({
  AvatarUpdateJob: vi.fn().mockImplementation(() => ({
    updateAvatars: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../processes/scheduler/jobs/check-for-update', () => ({
  UpdateCheckJob: vi.fn().mockImplementation(() => ({
    checkForUpdate: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../src/lib/feed-helpers', () => ({
  logFeedEvent: vi.fn().mockResolvedValue(undefined),
}));

setupPgTestFile();

describe('MatchExecScheduler — extended', () => {
  let scheduler: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;
    vi.clearAllMocks();

    const { MatchExecScheduler } = await import('../../../processes/scheduler/index');
    scheduler = new MatchExecScheduler();
  });

  // ─── handleMatchCompletion — maps not scored ──────────────────────────────

  describe('handleMatchCompletion — unscored maps', () => {
    it('does not auto-complete a match with unscored game maps', async () => {
      const oldUpdatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const matchId = (await createMatch(game.id, mode.id, { name: 'Unscored Match', status: 'battle', created_at: oldUpdatedAt, updated_at: oldUpdatedAt })).id;

      // Add an unscored map game
      await createMatchGame(matchId, { id: 'mg-unscored', map_id: 'some-map', round: 1, status: 'pending' });

      await (scheduler as any).handleMatchCompletion();

      const [row] = await getPgTestDb().select().from(matches).where(eq(matches.id, matchId));
      expect(row.status).toBe('battle');
    });

    it('auto-completes a match in battle for 24+ hours when all maps are scored', async () => {
      const oldUpdatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const matchId = (await createMatch(game.id, mode.id, { name: 'All Scored Match', status: 'battle', created_at: oldUpdatedAt, updated_at: oldUpdatedAt })).id;

      // Add a scored map game
      await createMatchGame(matchId, { id: 'mg-scored', map_id: 'some-map', round: 1, status: 'completed' });

      await (scheduler as any).handleMatchCompletion();

      const [row] = await getPgTestDb().select().from(matches).where(eq(matches.id, matchId));
      expect(row.status).toBe('complete');
    });
  });

  // ─── queueMatchReminders ─────────────────────────────────────────────────

  describe('queueMatchReminders', () => {
    it('skips gracefully when no discord settings exist', async () => {
      await (scheduler as any).queueMatchReminders();

      const rows = await getPgTestDb().select().from(discordReminderQueue);
      expect(rows).toHaveLength(0);
    });

    it('queues a reminder for an upcoming match', async () => {
      await createDiscordSettings({ guild_id: 'guild-1', bot_token: 'token', match_reminder_minutes: 30 });

      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
      const match = await createMatch(game.id, mode.id, {
        status: 'created',
        start_date: futureDate,
      });

      await (scheduler as any).queueMatchReminders();

      const [row] = await getPgTestDb().select().from(discordReminderQueue).where(eq(discordReminderQueue.match_id, match.id));
      expect(row).toBeDefined();
      expect(row.status).toBe('pending');
    });

    it('does not re-queue a reminder already in the queue', async () => {
      await createDiscordSettings({ guild_id: 'guild-1', bot_token: 'token', match_reminder_minutes: 30 });

      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        status: 'created',
        start_date: futureDate,
      });

      // Pre-insert an existing reminder
      await pgDb.insert(discordReminderQueue).values({ id: 'existing-reminder', match_id: match.id, reminder_type: 'match_reminder', minutes_before: 30, reminder_time: new Date(), scheduled_for: new Date(), status: 'pending' });

      await (scheduler as any).queueMatchReminders();

      const rows = await pgDb.select().from(discordReminderQueue);
      // Should still be only the pre-existing one
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('existing-reminder');
    });
  });

  // ─── reloadSettings ──────────────────────────────────────────────────────

  describe('reloadSettings', () => {
    it('calls loadSchedulerSettings when reloadSettings is invoked', async () => {
      const spy = vi.spyOn(scheduler as any, 'loadSchedulerSettings').mockResolvedValue(undefined);

      await scheduler.reloadSettings();

      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
