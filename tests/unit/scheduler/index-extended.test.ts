import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTestDb } from '../../utils/test-db';
import { settingsStore, resetSettingsStore } from '../../utils/settings-mock';
import { db as pgDb } from '../../../lib/db';
import { discordReminderQueue } from '../../../lib/db/schema';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

vi.mock('../../../src/lib/settings', async () => (await import('../../utils/settings-mock')).createSettingsModuleMock());

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
    resetSettingsStore();

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

  // ─── queueMatchReminders ─────────────────────────────────────────────────

  describe('queueMatchReminders', () => {
    it('skips gracefully when no discord settings exist', async () => {
      await (scheduler as any).queueMatchReminders();

      const rows = await db.all(`SELECT id FROM discord_reminder_queue`);
      expect(rows).toHaveLength(0);
    });

    it('queues a reminder for an upcoming match', async () => {
      settingsStore.discord = { guild_id: 'guild-1', bot_token: 'token', match_reminder_minutes: 30 };

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
      settingsStore.discord = { guild_id: 'guild-1', bot_token: 'token', match_reminder_minutes: 30 };

      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        status: 'created',
        start_date: futureDate.toISOString(),
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
