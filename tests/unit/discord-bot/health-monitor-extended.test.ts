import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTestDb } from '../../utils/test-db';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('../../../src/lib/feed-helpers', () => ({
  logFeedEvent: vi.fn().mockResolvedValue(undefined),
}));

import { HealthMonitor } from '../../../processes/discord-bot/modules/health-monitor';

describe('HealthMonitor — Extended', () => {
   
  let db: any;
   
  let mockAnnouncementHandler: any;
  let monitor: HealthMonitor;

  beforeEach(async () => {
    db = getTestDb();
    mockAnnouncementHandler = {
      postHealthAlert: vi.fn().mockResolvedValue(undefined),
    };
    monitor = new HealthMonitor(db, mockAnnouncementHandler);
  });

  afterEach(() => {
    monitor.stop();
    vi.clearAllMocks();
  });

  describe('checkSchedulerHeartbeat (private) — via bracket notation', () => {
    it('does not alert when no heartbeat record exists', async () => {
       
      await (monitor as any).checkSchedulerHeartbeat();
      expect(mockAnnouncementHandler.postHealthAlert).not.toHaveBeenCalled();
    });

    it('alerts when scheduler heartbeat is older than 10 minutes', async () => {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('scheduler_last_heartbeat', ?)`,
        [fifteenMinutesAgo]
      );

       
      await (monitor as any).checkSchedulerHeartbeat();

      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledOnce();
      const call = mockAnnouncementHandler.postHealthAlert.mock.calls[0][0];
      expect(call.title).toContain('Heartbeat');
      expect(call.severity).toBe('critical');
    });

    it('does not alert when scheduler heartbeat is recent (2 minutes ago)', async () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES ('scheduler_last_heartbeat', ?)`,
        [twoMinutesAgo]
      );

       
      await (monitor as any).checkSchedulerHeartbeat();

      expect(mockAnnouncementHandler.postHealthAlert).not.toHaveBeenCalled();
    });
  });

  describe('checkStatsProcessorHeartbeat (private) — via bracket notation', () => {
    it('does not alert when no heartbeat record exists', async () => {
       
      await (monitor as any).checkStatsProcessorHeartbeat();
      expect(mockAnnouncementHandler.postHealthAlert).not.toHaveBeenCalled();
    });

    it('alerts when stats processor heartbeat is older than 10 minutes', async () => {
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES ('stats_processor_last_heartbeat', ?)`,
        [twentyMinutesAgo]
      );

       
      await (monitor as any).checkStatsProcessorHeartbeat();

      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledOnce();
      const call = mockAnnouncementHandler.postHealthAlert.mock.calls[0][0];
      expect(call.severity).toBe('critical');
    });

    it('does not alert when stats processor heartbeat is recent', async () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES ('stats_processor_last_heartbeat', ?)`,
        [oneMinuteAgo]
      );

       
      await (monitor as any).checkStatsProcessorHeartbeat();

      expect(mockAnnouncementHandler.postHealthAlert).not.toHaveBeenCalled();
    });
  });

  describe('reportHealthIssue — rate limiting edge cases', () => {
    it('second call within 1 hour is rate-limited', async () => {
      await monitor.reportHealthIssue({
        type: 'rl-double-call',
        severity: 'warning',
        title: 'First Call',
        description: 'Should be sent',
      });
      await monitor.reportHealthIssue({
        type: 'rl-double-call',
        severity: 'warning',
        title: 'Second Call',
        description: 'Should be rate-limited',
      });

      // Only the first call should go through
      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledOnce();
    });

    it('different alert types are rate-limited independently', async () => {
      await monitor.reportHealthIssue({ type: 'type-A', severity: 'critical', title: 'A', description: 'A' });
      await monitor.reportHealthIssue({ type: 'type-B', severity: 'warning', title: 'B', description: 'B' });

      // Both different types should be sent
      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledTimes(2);
    });
  });

  describe('reportDatabaseError — extended', () => {
    it('includes error message in description', async () => {
      await monitor.reportDatabaseError('SQLITE_BUSY: database is locked');

      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledOnce();
      const call = mockAnnouncementHandler.postHealthAlert.mock.calls[0][0];
      expect(call.description).toContain('SQLITE_BUSY');
    });
  });

  describe('reportProcessCrash — extended', () => {
    it('includes process name and reason in the alert', async () => {
      await monitor.reportProcessCrash('discord-bot', 'OOM kill');

      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledOnce();
      const call = mockAnnouncementHandler.postHealthAlert.mock.calls[0][0];
      expect(call.title).toContain('discord-bot');
      expect(call.description).toContain('OOM kill');
    });
  });

  describe('start / stop — extended', () => {
    it('calling stop before start does not throw', () => {
      expect(() => monitor.stop()).not.toThrow();
    });

    it('can be started and stopped without error', async () => {
      await monitor.start();
      expect(() => monitor.stop()).not.toThrow();
    });
  });
});
