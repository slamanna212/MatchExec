import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

import { GET as getFeedRetention, PUT as putFeedRetention } from '@/app/api/settings/feed-retention/route';
import { GET as getLogLevel, PUT as putLogLevel } from '@/app/api/settings/log-level/route';
import { PUT as putChannel, DELETE as deleteChannel } from '@/app/api/channels/[channelId]/route';

describe('More Settings & Channel Routes', () => {
  let db: any;

  beforeEach(async () => {
    await seedBasicTestData();
    db = getTestDb();
  });

  // ─── GET /api/settings/feed-retention ────────────────────────────────────────

  describe('GET /api/settings/feed-retention', () => {
    it('returns default 180 days when not configured', async () => {
      const response = await getFeedRetention();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.feed_retention_days).toBe(180);
    });

    it('returns stored value when configured', async () => {
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('feed_retention_days', '90')`
      );

      const response = await getFeedRetention();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.feed_retention_days).toBe(90);
    });
  });

  // ─── PUT /api/settings/feed-retention ────────────────────────────────────────

  describe('PUT /api/settings/feed-retention', () => {
    it('returns 400 for non-numeric value', async () => {
      const request = createMockRequest('PUT', '/api/settings/feed-retention', { feed_retention_days: 'abc' });
      const response = await putFeedRetention(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 for value < 1', async () => {
      const request = createMockRequest('PUT', '/api/settings/feed-retention', { feed_retention_days: 0 });
      const response = await putFeedRetention(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 for value > 3650', async () => {
      const request = createMockRequest('PUT', '/api/settings/feed-retention', { feed_retention_days: 9999 });
      const response = await putFeedRetention(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('updates retention days successfully', async () => {
      // Ensure row exists first
      await db.run(
        `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('feed_retention_days', '180')`
      );

      const request = createMockRequest('PUT', '/api/settings/feed-retention', { feed_retention_days: 365 });
      const response = await putFeedRetention(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.feed_retention_days).toBe(365);
    });
  });

  // ─── GET /api/settings/log-level ─────────────────────────────────────────────

  describe('GET /api/settings/log-level', () => {
    it('returns default warning when not configured', async () => {
      const response = await getLogLevel();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.log_level).toBe('warning');
    });

    it('returns stored log level when configured', async () => {
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('log_level', 'debug')`
      );

      const response = await getLogLevel();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.log_level).toBe('debug');
    });
  });

  // ─── PUT /api/settings/log-level ─────────────────────────────────────────────

  describe('PUT /api/settings/log-level', () => {
    it('returns 400 for invalid log level', async () => {
      const request = createMockRequest('PUT', '/api/settings/log-level', { log_level: 'verbose' });
      const response = await putLogLevel(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 for missing log level', async () => {
      const request = createMockRequest('PUT', '/api/settings/log-level', {});
      const response = await putLogLevel(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('sets log level to debug', async () => {
      await db.run(
        `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('log_level', 'warning')`
      );

      const request = createMockRequest('PUT', '/api/settings/log-level', { log_level: 'debug' });
      const response = await putLogLevel(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.log_level).toBe('debug');
    });

    it('accepts all valid log levels', async () => {
      for (const level of ['debug', 'info', 'warning', 'error', 'critical']) {
        const request = createMockRequest('PUT', '/api/settings/log-level', { log_level: level });
        const response = await putLogLevel(request);
        const { status } = await parseResponse(response);
        expect(status).toBe(200);
      }
    });
  });

  // ─── PUT /api/channels/[channelId] ───────────────────────────────────────────

  describe('PUT /api/channels/[channelId]', () => {
    it('returns 404 for nonexistent channel', async () => {
      const request = createMockRequest('PUT', '/api/channels/nonexistent', { send_announcements: true });
      const response = await putChannel(request, createRouteParams({ channelId: 'nonexistent' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('returns 400 for voice channel (notifications only for text)', async () => {
      await db.run(`INSERT INTO discord_settings (id, guild_id, bot_token) VALUES (1, 'g1', 'tok')`);
      await db.run(
        `INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, type, channel_type)
         VALUES ('vc-1', 'g1', 'dc-vc', 'Voice', 1, 'voice')`
      );

      const request = createMockRequest('PUT', '/api/channels/vc-1', { send_announcements: true });
      const response = await putChannel(request, createRouteParams({ channelId: 'vc-1' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('updates notification settings for text channel', async () => {
      await db.run(`INSERT OR IGNORE INTO discord_settings (id, guild_id, bot_token) VALUES (1, 'g1', 'tok')`);
      await db.run(
        `INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, type, channel_type)
         VALUES ('ch-txt', 'g1', 'dc-txt', 'general', 0, 'text')`
      );

      const request = createMockRequest('PUT', '/api/channels/ch-txt', {
        send_announcements: true,
        send_reminders: false,
        send_match_start: true,
      });
      const response = await putChannel(request, createRouteParams({ channelId: 'ch-txt' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const row = await db.get(
        'SELECT send_announcements, send_match_start FROM discord_channels WHERE id = ?',
        ['ch-txt']
      );
      expect(row.send_announcements).toBe(1);
      expect(row.send_match_start).toBe(1);
    });
  });

  // ─── DELETE /api/channels/[channelId] ────────────────────────────────────────

  describe('DELETE /api/channels/[channelId]', () => {
    it('returns 404 for nonexistent channel', async () => {
      const request = createMockRequest('DELETE', '/api/channels/nope');
      const response = await deleteChannel(request, createRouteParams({ channelId: 'nope' }));
      const { status } = await parseResponse(response);
      expect(status).toBe(404);
    });

    it('deletes existing channel', async () => {
      await db.run(`INSERT OR IGNORE INTO discord_settings (id, guild_id, bot_token) VALUES (1, 'g1', 'tok')`);
      await db.run(
        `INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, type, channel_type)
         VALUES ('ch-del', 'g1', 'dc-del', 'deleteme', 0, 'text')`
      );

      const request = createMockRequest('DELETE', '/api/channels/ch-del');
      const response = await deleteChannel(request, createRouteParams({ channelId: 'ch-del' }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const row = await db.get('SELECT id FROM discord_channels WHERE id = ?', ['ch-del']);
      expect(row).toBeUndefined();
    });
  });
});
