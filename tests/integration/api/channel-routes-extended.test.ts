import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

import { PUT as putChannel, DELETE as deleteChannel } from '@/app/api/channels/[channelId]/route';

describe('Channel Routes (settings routes moved to tests/integration/server/settings.test.ts)', () => {
  let db: any;

  beforeEach(async () => {
    await seedBasicTestData();
    db = getTestDb();
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
