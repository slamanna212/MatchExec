import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('../../../src/lib/feed-helpers', () => ({
  logFeedEvent: vi.fn().mockResolvedValue(undefined),
}));

import { HealthMonitor } from '../../../processes/discord-bot/modules/health-monitor';
import { getTestDb } from '../../utils/test-db';

describe('HealthMonitor', () => {
  let db: any;
  let mockAnnouncementHandler: any;
  let monitor: HealthMonitor;

  beforeEach(async () => {
    db = getTestDb();
    mockAnnouncementHandler = {
      postHealthAlert: vi.fn().mockResolvedValue(undefined),
    };
    monitor = new HealthMonitor(db as any, mockAnnouncementHandler as any);
  });

  afterEach(() => {
    monitor.stop();
    vi.clearAllMocks();
  });

  describe('start / stop', () => {
    it('starts without throwing', async () => {
      await expect(monitor.start()).resolves.not.toThrow();
      monitor.stop();
    });

    it('stop can be called multiple times safely', () => {
      monitor.stop();
      monitor.stop(); // Should not throw
    });
  });

  describe('reportHealthIssue', () => {
    it('posts health alert when no prior rate limit entry', async () => {
      await monitor.reportHealthIssue({
        type: 'test_alert',
        severity: 'critical',
        title: 'Test Alert',
        description: 'Test description',
      });

      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledOnce();
      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledWith({
        severity: 'critical',
        title: 'Test Alert',
        description: 'Test description',
      });
    });

    it('skips alert when rate-limited (sent within 1 hour)', async () => {
      // Insert a recent rate limit entry
      await db.run(`
        INSERT INTO health_alerts_sent (alert_type, last_sent_at)
        VALUES ('rate_limited_alert', CURRENT_TIMESTAMP)
      `);

      await monitor.reportHealthIssue({
        type: 'rate_limited_alert',
        severity: 'warning',
        title: 'Should Be Skipped',
        description: 'This should not be sent',
      });

      expect(mockAnnouncementHandler.postHealthAlert).not.toHaveBeenCalled();
    });

    it('sends alert when rate limit has expired (> 1 hour ago)', async () => {
      // Insert an old rate limit entry (2 hours ago) using ISO timestamp so JS can parse it
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      await db.run(
        `INSERT INTO health_alerts_sent (alert_type, last_sent_at) VALUES ('old_alert', ?)`,
        [twoHoursAgo]
      );

      await monitor.reportHealthIssue({
        type: 'old_alert',
        severity: 'critical',
        title: 'Old Alert',
        description: 'Should be sent because rate limit expired',
      });

      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledOnce();
    });

    it('updates rate limit entry after sending', async () => {
      await monitor.reportHealthIssue({
        type: 'test_rate_update',
        severity: 'warning',
        title: 'Test',
        description: 'Test',
      });

      const entry = await db.get(
        'SELECT * FROM health_alerts_sent WHERE alert_type = ?',
        ['test_rate_update']
      );
      expect(entry).toBeDefined();
      expect(entry.alert_type).toBe('test_rate_update');
    });
  });

  describe('reportDatabaseError', () => {
    it('calls reportHealthIssue with database_error type', async () => {
      await monitor.reportDatabaseError('Connection refused');

      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledOnce();
      const call = mockAnnouncementHandler.postHealthAlert.mock.calls[0][0];
      expect(call.severity).toBe('critical');
      expect(call.title).toBe('Database Error');
    });
  });

  describe('reportProcessCrash', () => {
    it('calls reportHealthIssue with process crash details', async () => {
      await monitor.reportProcessCrash('scheduler', 'Out of memory');

      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledOnce();
      const call = mockAnnouncementHandler.postHealthAlert.mock.calls[0][0];
      expect(call.severity).toBe('critical');
      expect(call.title).toContain('scheduler');
    });
  });

  describe('reportQueueOverflow', () => {
    it('calls reportHealthIssue with warning severity', async () => {
      await monitor.reportQueueOverflow(150, 100);

      expect(mockAnnouncementHandler.postHealthAlert).toHaveBeenCalledOnce();
      const call = mockAnnouncementHandler.postHealthAlert.mock.calls[0][0];
      expect(call.severity).toBe('warning');
      expect(call.description).toContain('150');
      expect(call.description).toContain('100');
    });
  });
});
