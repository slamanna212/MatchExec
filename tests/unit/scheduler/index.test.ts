import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { eq, count } from 'drizzle-orm';
import { setAppSetting } from '../../../src/lib/settings';
import { updateSchedulerCrons } from '../../../src/lib/settings';
import { discordHealthAlertQueue, discordMatchStartQueue, healthAlertsSent, matches } from '../../../lib/db/schema';
import { seedBasicTestData, createMatch } from '../../utils/pg-fixtures';

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
  AvatarUpdateJob: vi.fn().mockImplementation(function() {
    return {
      updateAvatars: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('../../../processes/scheduler/jobs/check-for-update', () => ({
  UpdateCheckJob: vi.fn().mockImplementation(function() {
    return {
      checkForUpdate: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('../../../src/lib/feed-helpers', () => ({
  logFeedEvent: vi.fn().mockResolvedValue(undefined),
}));

setupPgTestFile();

describe('MatchExecScheduler', () => {
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

  // ─── checkMatchStartTimes ─────────────────────────────────────────────────

  describe('checkMatchStartTimes', () => {
    it('transitions matches from assign to battle when start_date has passed', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const match = await createMatch(game.id, mode.id, {
        status: 'assign',
        start_date: pastDate,
      });

      await (scheduler as any).checkMatchStartTimes();

      const updated = (await getPgTestDb().select().from(matches).where(eq(matches.id, match.id)))[0];
      expect(updated.status).toBe('battle');
    });

    it('does not transition matches that start in the future', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const match = await createMatch(game.id, mode.id, {
        status: 'assign',
        start_date: futureDate,
      });

      await (scheduler as any).checkMatchStartTimes();

      const unchanged = (await getPgTestDb().select().from(matches).where(eq(matches.id, match.id)))[0];
      expect(unchanged.status).toBe('assign');
    });

    it('does not transition matches already in battle status', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        status: 'battle',
        start_date: pastDate,
      });

      await (scheduler as any).checkMatchStartTimes();

      const unchanged = (await getPgTestDb().select().from(matches).where(eq(matches.id, match.id)))[0];
      expect(unchanged.status).toBe('battle');
    });

    it('queues a start notification for each match that transitions to battle', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000);
      const match = await createMatch(game.id, mode.id, {
        status: 'assign',
        start_date: pastDate,
      });

      await (scheduler as any).checkMatchStartTimes();

      const [notification] = await getPgTestDb().select().from(discordMatchStartQueue).where(eq(discordMatchStartQueue.match_id, match.id));
      expect(notification).toBeDefined();
      expect(notification.status).toBe('pending');
    });
  });

  // ─── handleMatchCompletion ────────────────────────────────────────────────

  describe('handleMatchCompletion', () => {
    it('auto-completes matches that have been in battle for over 24 hours', async () => {
      // Insert with an explicit old updated_at (a later UPDATE would bump it).
      const oldUpdatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const matchId = (await createMatch(game.id, mode.id, { status: 'battle', created_at: oldUpdatedAt, updated_at: oldUpdatedAt })).id;

      await (scheduler as any).handleMatchCompletion();

      const updated = (await getPgTestDb().select().from(matches).where(eq(matches.id, matchId)))[0];
      expect(updated.status).toBe('complete');
    });

    it('does not auto-complete matches that have been in battle for less than 24 hours', async () => {
      // createMatch inserts with updated_at = now, so the match is treated as recently updated and must NOT be auto-completed.
      const match = await createMatch(game.id, mode.id, { status: 'battle' });

      await (scheduler as any).handleMatchCompletion();

      const unchanged = (await getPgTestDb().select().from(matches).where(eq(matches.id, match.id)))[0];
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
      await updateSchedulerCrons({ match_check_cron: '*/30 * * * * *', channel_refresh_cron: '0 0 1 * * *' });

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

      const row = (await getPgTestDb().select().from(discordHealthAlertQueue).limit(1))[0];
      expect(row).toBeUndefined();
    });

    it('returns early when heartbeat is recent (< 10 minutes old)', async () => {
      const recentHeartbeat = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 min ago
      await setAppSetting('discord_bot_last_heartbeat', recentHeartbeat);

      await (scheduler as any).checkDiscordBotHeartbeat();

      const row = (await getPgTestDb().select().from(discordHealthAlertQueue).limit(1))[0];
      expect(row).toBeUndefined();
    });

    it('queues a health alert and updates rate-limit when heartbeat is stale', async () => {
      const staleHeartbeat = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago
      await setAppSetting('discord_bot_last_heartbeat', staleHeartbeat);

      await (scheduler as any).checkDiscordBotHeartbeat();

      const alertRow = (await getPgTestDb().select().from(discordHealthAlertQueue).limit(1))[0];
      expect(alertRow).toBeDefined();
      expect(alertRow.id).toMatch(/^health_alert_/);
      expect(alertRow.severity).toBe('critical');
      expect(alertRow.status).toBe('pending');

      const [rateLimitRow] = await getPgTestDb().select().from(healthAlertsSent).where(eq(healthAlertsSent.alert_type, 'discord_bot_heartbeat_missing'));
      expect(rateLimitRow).toBeDefined();
    });

    it('skips when within rate-limit window (< 1 hour since last alert)', async () => {
      const staleHeartbeat = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await setAppSetting('discord_bot_last_heartbeat', staleHeartbeat);
      const recentAlert = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
      await getPgTestDb().insert(healthAlertsSent).values({ alert_type: 'discord_bot_heartbeat_missing', last_sent_at: recentAlert });

      await (scheduler as any).checkDiscordBotHeartbeat();

      const [{ n }] = await getPgTestDb().select({ n: count() }).from(discordHealthAlertQueue);
      expect(n).toBe(0);
    });

    it('queues a new alert when rate-limit window has expired (> 1 hour since last alert)', async () => {
      const staleHeartbeat = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await setAppSetting('discord_bot_last_heartbeat', staleHeartbeat);
      const expiredAlert = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      await getPgTestDb().insert(healthAlertsSent).values({ alert_type: 'discord_bot_heartbeat_missing', last_sent_at: expiredAlert });

      await (scheduler as any).checkDiscordBotHeartbeat();

      const alertRow = (await getPgTestDb().select().from(discordHealthAlertQueue).limit(1))[0];
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

  // ─── loadSchedulerSettings — update check job ─────────────────────────────

  describe('loadSchedulerSettings — update check job', () => {
    it('instantiates UpdateCheckJob when loading scheduler settings', async () => {
      const { UpdateCheckJob } = await import('../../../processes/scheduler/jobs/check-for-update');
      const mockUpdateCheckJob = UpdateCheckJob as ReturnType<typeof vi.fn>;
      mockUpdateCheckJob.mockClear();

      await (scheduler as any).loadSchedulerSettings();

      expect(mockUpdateCheckJob).toHaveBeenCalled();
    });
  });
});
