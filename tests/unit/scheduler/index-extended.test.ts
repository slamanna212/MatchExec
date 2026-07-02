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

describe('MatchExecScheduler — extended', () => {
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
    (scheduler as any)._db = db;
  });

  // ─── handleMatchCompletion — maps not scored ──────────────────────────────

  describe('handleMatchCompletion — unscored maps', () => {
    it('does not auto-complete a match with unscored game maps', async () => {
      const oldUpdatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const startDate = new Date().toISOString();
      const matchId = `match_unscored_${Date.now()}`;
      await db.run(
        `INSERT INTO matches (id, game_id, mode_id, name, start_date, start_time, status, match_format, rounds, player_notifications, created_at, updated_at)
         VALUES (?, ?, ?, 'Unscored Match', ?, ?, 'battle', 'competitive', 3, 1, ?, ?)`,
        [matchId, game.id, mode.id, startDate, startDate, startDate, oldUpdatedAt]
      );

      // Add an unscored map game
      await db.run(
        `INSERT INTO match_games (id, match_id, map_id, round, status, created_at, updated_at)
         VALUES ('mg-unscored', ?, 'some-map', 1, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [matchId]
      );

      await (scheduler as any).handleMatchCompletion();

      const row = await db.get(`SELECT status FROM matches WHERE id = ?`, [matchId]);
      expect(row.status).toBe('battle');
    });

    it('auto-completes a match in battle for 24+ hours when all maps are scored', async () => {
      const oldUpdatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const startDate = new Date().toISOString();
      const matchId = `match_all_scored_${Date.now()}`;
      await db.run(
        `INSERT INTO matches (id, game_id, mode_id, name, start_date, start_time, status, match_format, rounds, player_notifications, created_at, updated_at)
         VALUES (?, ?, ?, 'All Scored Match', ?, ?, 'battle', 'competitive', 3, 1, ?, ?)`,
        [matchId, game.id, mode.id, startDate, startDate, startDate, oldUpdatedAt]
      );

      // Add a scored map game
      await db.run(
        `INSERT INTO match_games (id, match_id, map_id, round, status, created_at, updated_at)
         VALUES ('mg-scored', ?, 'some-map', 1, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [matchId]
      );

      await (scheduler as any).handleMatchCompletion();

      const row = await db.get(`SELECT status FROM matches WHERE id = ?`, [matchId]);
      expect(row.status).toBe('complete');
    });
  });

  // ─── cleanupFeedEvents ────────────────────────────────────────────────────

  describe('cleanupFeedEvents', () => {
    it('removes feed events older than the configured retention period', async () => {
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value, data_type)
         VALUES ('feed_retention_days', '7', 'number')`
      );

      // Insert an old event (8 days ago) and a recent one
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title, metadata, created_at)
         VALUES ('old-event', 'test_event', 1, 'Old Event', '{}', ?)`,
        [eightDaysAgo]
      );
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title, metadata, created_at)
         VALUES ('new-event', 'test_event', 1, 'New Event', '{}', CURRENT_TIMESTAMP)`
      );

      await (scheduler as any).cleanupFeedEvents();

      const oldRow = await db.get(`SELECT id FROM activity_feed WHERE id = 'old-event'`);
      const newRow = await db.get(`SELECT id FROM activity_feed WHERE id = 'new-event'`);

      expect(oldRow).toBeUndefined();
      expect(newRow).toBeDefined();
    });

    it('does not remove events when retention period is 0 or invalid', async () => {
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value, data_type)
         VALUES ('feed_retention_days', '0', 'number')`
      );

      const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title, metadata, created_at)
         VALUES ('retain-event', 'test_event', 1, 'Retained', '{}', ?)`,
        [oldDate]
      );

      await (scheduler as any).cleanupFeedEvents();

      const row = await db.get(`SELECT id FROM activity_feed WHERE id = 'retain-event'`);
      expect(row).toBeDefined();
    });

    it('defaults to 180-day retention when setting is absent', async () => {
      // Ensure no retention setting exists
      await db.run(`DELETE FROM app_settings WHERE setting_key = 'feed_retention_days'`);

      const recentEnough = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title, metadata, created_at)
         VALUES ('within-180-event', 'test_event', 1, 'Recent Enough', '{}', ?)`,
        [recentEnough]
      );

      await (scheduler as any).cleanupFeedEvents();

      const row = await db.get(`SELECT id FROM activity_feed WHERE id = 'within-180-event'`);
      expect(row).toBeDefined();
    });
  });

  // ─── cleanupStaleScoringNotifications ─────────────────────────────────────

  describe('cleanupStaleScoringNotifications', () => {
    it('removes match_scoring_required events older than 24 hours', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title, metadata, created_at)
         VALUES ('stale-scoring', 'match_scoring_required', 1, 'Stale Scoring', '{}', ?)`,
        [twoDaysAgo]
      );

      await (scheduler as any).cleanupStaleScoringNotifications();

      const row = await db.get(`SELECT id FROM activity_feed WHERE id = 'stale-scoring'`);
      expect(row).toBeUndefined();
    });

    it('removes scorecard_player_matching_required events older than 24 hours', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title, metadata, created_at)
         VALUES ('stale-matching', 'scorecard_player_matching_required', 1, 'Stale Matching', '{}', ?)`,
        [twoDaysAgo]
      );

      await (scheduler as any).cleanupStaleScoringNotifications();

      const row = await db.get(`SELECT id FROM activity_feed WHERE id = 'stale-matching'`);
      expect(row).toBeUndefined();
    });

    it('keeps scoring events newer than 24 hours', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title, metadata, created_at)
         VALUES ('fresh-scoring', 'match_scoring_required', 1, 'Fresh Scoring', '{}', ?)`,
        [oneHourAgo]
      );

      await (scheduler as any).cleanupStaleScoringNotifications();

      const row = await db.get(`SELECT id FROM activity_feed WHERE id = 'fresh-scoring'`);
      expect(row).toBeDefined();
    });
  });

  // ─── queueMatchReminders ─────────────────────────────────────────────────

  describe('queueMatchReminders', () => {
    it('skips gracefully when no discord settings exist', async () => {
      await (scheduler as any).queueMatchReminders();

      const rows = await db.all(`SELECT id FROM discord_reminder_queue`);
      expect(rows).toHaveLength(0);
    });

    it('queues a reminder for an upcoming match', async () => {
      await db.run(
        `INSERT INTO discord_settings (guild_id, bot_token, match_reminder_minutes)
         VALUES ('guild-1', 'token', 30)`
      );

      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
      const match = await createMatch(game.id, mode.id, {
        status: 'created',
        start_date: futureDate.toISOString(),
      });

      await (scheduler as any).queueMatchReminders();

      const row = await db.get(
        `SELECT id, match_id, status FROM discord_reminder_queue WHERE match_id = ?`,
        [match.id]
      );
      expect(row).toBeDefined();
      expect(row.status).toBe('pending');
    });

    it('does not re-queue a reminder already in the queue', async () => {
      await db.run(
        `INSERT INTO discord_settings (guild_id, bot_token, match_reminder_minutes)
         VALUES ('guild-1', 'token', 30)`
      );

      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        status: 'created',
        start_date: futureDate.toISOString(),
      });

      // Pre-insert an existing reminder
      await db.run(
        `INSERT INTO discord_reminder_queue (id, match_id, reminder_type, minutes_before, reminder_time, scheduled_for, status)
         VALUES ('existing-reminder', ?, 'match_reminder', 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'pending')`,
        [match.id]
      );

      await (scheduler as any).queueMatchReminders();

      const rows = await db.all(
        `SELECT id FROM discord_reminder_queue WHERE match_id = ?`,
        [match.id]
      );
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
