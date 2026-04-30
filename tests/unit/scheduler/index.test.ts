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

vi.mock('../../../src/lib/feed-helpers', () => ({
  logFeedEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('MatchExecScheduler', () => {
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
    // Inject test DB directly to bypass start()
    (scheduler as any)._db = db;
  });

  // ─── checkMatchStartTimes ─────────────────────────────────────────────────

  describe('checkMatchStartTimes', () => {
    it('transitions matches from assign to battle when start_date has passed', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const match = await createMatch(game.id, mode.id, {
        status: 'assign',
        start_date: pastDate.toISOString(),
      });

      await (scheduler as any).checkMatchStartTimes();

      const updated = await db.get(`SELECT status FROM matches WHERE id = ?`, [match.id]);
      expect(updated.status).toBe('battle');
    });

    it('does not transition matches that start in the future', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const match = await createMatch(game.id, mode.id, {
        status: 'assign',
        start_date: futureDate.toISOString(),
      });

      await (scheduler as any).checkMatchStartTimes();

      const unchanged = await db.get(`SELECT status FROM matches WHERE id = ?`, [match.id]);
      expect(unchanged.status).toBe('assign');
    });

    it('does not transition matches already in battle status', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        status: 'battle',
        start_date: pastDate.toISOString(),
      });

      await (scheduler as any).checkMatchStartTimes();

      const unchanged = await db.get(`SELECT status FROM matches WHERE id = ?`, [match.id]);
      expect(unchanged.status).toBe('battle');
    });

    it('queues a start notification for each match that transitions to battle', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        status: 'assign',
        start_date: pastDate.toISOString(),
      });

      await (scheduler as any).checkMatchStartTimes();

      const notification = await db.get(
        `SELECT * FROM discord_match_start_queue WHERE match_id = ?`,
        [match.id]
      );
      expect(notification).toBeDefined();
      expect(notification.status).toBe('pending');
    });
  });

  // ─── handleMatchCompletion ────────────────────────────────────────────────

  describe('handleMatchCompletion', () => {
    it('auto-completes matches that have been in battle for over 24 hours', async () => {
      // Use direct INSERT with explicit updated_at instead of createMatch+UPDATE,
      // because a AFTER UPDATE trigger on matches always overwrites updated_at to CURRENT_TIMESTAMP.
      const oldUpdatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const startDate = new Date().toISOString();
      const matchId = `match_old_battle_${Date.now()}`;
      await db.run(
        `INSERT INTO matches (id, game_id, mode_id, name, start_date, start_time, status, match_format, rounds, player_notifications, created_at, updated_at)
         VALUES (?, ?, ?, 'Old Battle Match', ?, ?, 'battle', 'competitive', 3, 1, ?, ?)`,
        [matchId, game.id, mode.id, startDate, startDate, startDate, oldUpdatedAt]
      );

      await (scheduler as any).handleMatchCompletion();

      const updated = await db.get(`SELECT status FROM matches WHERE id = ?`, [matchId]);
      expect(updated.status).toBe('complete');
    });

    it('does not auto-complete matches that have been in battle for less than 24 hours', async () => {
      // createMatch uses INSERT with updated_at = CURRENT_TIMESTAMP (now) — no trigger fires on INSERT,
      // so the match is treated as recently updated and must NOT be auto-completed.
      const match = await createMatch(game.id, mode.id, { status: 'battle' });

      await (scheduler as any).handleMatchCompletion();

      const unchanged = await db.get(`SELECT status FROM matches WHERE id = ?`, [match.id]);
      expect(unchanged.status).toBe('battle');
    });
  });

  // ─── loadSchedulerSettings ───────────────────────────────────────────────

  describe('loadSchedulerSettings', () => {
    it('uses default cron schedules when no settings row exists in DB', async () => {
      const cronModule = await import('node-cron');
      const mockSchedule = cronModule.schedule as ReturnType<typeof vi.fn>;

      await (scheduler as any).loadSchedulerSettings();

      expect(mockSchedule).toHaveBeenCalled();
      const cronNames = mockSchedule.mock.calls.map((c: any[]) => c[0]);
      // The cron expression is the second argument; just assert schedule was called
      expect(cronNames.length).toBeGreaterThan(0);
    });

    it('reads cron settings from the database when available', async () => {
      await db.run(`
        INSERT INTO scheduler_settings (
          id, match_check_cron, channel_refresh_cron,
          created_at, updated_at
        ) VALUES (1, '*/30 * * * * *', '0 0 1 * * *',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const cronModule = await import('node-cron');
      const mockSchedule = cronModule.schedule as ReturnType<typeof vi.fn>;

      await (scheduler as any).loadSchedulerSettings();

      // Check that the DB-configured cron expressions were scheduled
      // cron.schedule(expression, callback, options) — expression is c[0]
      const expressions = mockSchedule.mock.calls.map((c: any[]) => c[0]);
      expect(expressions).toContain('*/30 * * * * *');
    });
  });

  // ─── checkDiscordBotHeartbeat ─────────────────────────────────────────────

  describe('checkDiscordBotHeartbeat', () => {
    it('returns early when no heartbeat record exists in DB', async () => {
      await (scheduler as any).checkDiscordBotHeartbeat();

      const row = await db.get(`SELECT * FROM discord_health_alert_queue LIMIT 1`);
      expect(row).toBeUndefined();
    });

    it('returns early when heartbeat is recent (< 10 minutes old)', async () => {
      const recentHeartbeat = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 min ago
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('discord_bot_last_heartbeat', ?)`,
        [recentHeartbeat]
      );

      await (scheduler as any).checkDiscordBotHeartbeat();

      const row = await db.get(`SELECT * FROM discord_health_alert_queue LIMIT 1`);
      expect(row).toBeUndefined();
    });

    it('queues a health alert and updates rate-limit when heartbeat is stale', async () => {
      const staleHeartbeat = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('discord_bot_last_heartbeat', ?)`,
        [staleHeartbeat]
      );

      await (scheduler as any).checkDiscordBotHeartbeat();

      const alertRow = await db.get(`SELECT * FROM discord_health_alert_queue LIMIT 1`);
      expect(alertRow).toBeDefined();
      expect(alertRow.id).toMatch(/^health_alert_\d+_[a-z0-9]+$/);
      expect(alertRow.severity).toBe('critical');
      expect(alertRow.status).toBe('pending');

      const rateLimitRow = await db.get(
        `SELECT * FROM health_alerts_sent WHERE alert_type = 'discord_bot_heartbeat_missing'`
      );
      expect(rateLimitRow).toBeDefined();
    });

    it('skips when within rate-limit window (< 1 hour since last alert)', async () => {
      const staleHeartbeat = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('discord_bot_last_heartbeat', ?)`,
        [staleHeartbeat]
      );
      const recentAlert = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
      await db.run(
        `INSERT INTO health_alerts_sent (alert_type, last_sent_at) VALUES ('discord_bot_heartbeat_missing', ?)`,
        [recentAlert]
      );

      await (scheduler as any).checkDiscordBotHeartbeat();

      const count = await db.get(`SELECT COUNT(*) as cnt FROM discord_health_alert_queue`);
      expect(count.cnt).toBe(0);
    });

    it('queues a new alert when rate-limit window has expired (> 1 hour since last alert)', async () => {
      const staleHeartbeat = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('discord_bot_last_heartbeat', ?)`,
        [staleHeartbeat]
      );
      const expiredAlert = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      await db.run(
        `INSERT INTO health_alerts_sent (alert_type, last_sent_at) VALUES ('discord_bot_heartbeat_missing', ?)`,
        [expiredAlert]
      );

      await (scheduler as any).checkDiscordBotHeartbeat();

      const alertRow = await db.get(`SELECT * FROM discord_health_alert_queue LIMIT 1`);
      expect(alertRow).toBeDefined();
      expect(alertRow.severity).toBe('critical');
    });
  });

  // ─── startCronJob ────────────────────────────────────────────────────────

  describe('startCronJob', () => {
    it('registers a cron job and adds it to the cronJobs array', async () => {
      const task = vi.fn().mockResolvedValue(undefined);
      const initialCount = (scheduler as any).cronJobs.length;

      (scheduler as any).startCronJob('Test Job', '*/5 * * * *', task);

      expect((scheduler as any).cronJobs.length).toBe(initialCount + 1);
    });

    it('does not add a job for an invalid cron expression', async () => {
      const cronModule = await import('node-cron');
      (cronModule.validate as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      const initialCount = (scheduler as any).cronJobs.length;
      (scheduler as any).startCronJob('Bad Job', 'not-a-cron', vi.fn());

      expect((scheduler as any).cronJobs.length).toBe(initialCount);
    });
  });
});
