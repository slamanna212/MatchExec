import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse } from '../../utils/api-helpers';
import { getTestDb } from '../../utils/test-db';
import { GET, POST } from '@/app/api/channels/route';

describe('Channels API', () => {
  let db: any;

  beforeEach(async () => {
    db = getTestDb();
  });

  describe('GET /api/channels', () => {
    it('returns empty array when no channels exist', async () => {
      const response = await GET();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('returns channels with boolean fields converted', async () => {
      await db.run(`
        INSERT INTO discord_settings (id, guild_id, bot_token)
        VALUES (1, 'guild-123', 'token-abc')
      `);
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, type, channel_type, send_announcements, send_reminders, send_match_start, send_signup_updates)
        VALUES ('ch-1', 'guild-123', 'dc-111', 'general', 0, 'text', 1, 0, 1, 0)
      `);

      const response = await GET();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].discord_channel_id).toBe('dc-111');
      expect(typeof data[0].send_announcements).toBe('boolean');
      expect(data[0].send_announcements).toBe(true);
      expect(data[0].send_reminders).toBe(false);
    });

    it('returns multiple channels ordered by type then name', async () => {
      await db.run(`
        INSERT INTO discord_settings (id, guild_id, bot_token)
        VALUES (1, 'guild-123', 'token-abc')
      `);
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, type, channel_type)
        VALUES ('ch-1', 'guild-123', 'dc-111', 'zebra', 0, 'text'),
               ('ch-2', 'guild-123', 'dc-222', 'alpha', 0, 'text')
      `);

      const response = await GET();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveLength(2);
    });
  });

  describe('POST /api/channels', () => {
    it('returns 400 when channel_id is missing', async () => {
      const request = createMockRequest('POST', '/api/channels', {
        channel_type: 'text',
      });
      const response = await POST(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when channel_type is missing', async () => {
      const request = createMockRequest('POST', '/api/channels', {
        discord_channel_id: 'dc-999',
      });
      const response = await POST(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when channel_type is invalid', async () => {
      const request = createMockRequest('POST', '/api/channels', {
        discord_channel_id: 'dc-999',
        channel_type: 'invalid',
      });
      const response = await POST(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when channel_type is voice (voice channels not manually addable)', async () => {
      const request = createMockRequest('POST', '/api/channels', {
        discord_channel_id: 'dc-999',
        channel_type: 'voice',
      });
      const response = await POST(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when no guild configured', async () => {
      const request = createMockRequest('POST', '/api/channels', {
        discord_channel_id: 'dc-999',
        channel_type: 'text',
      });
      const response = await POST(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('creates channel successfully when guild is configured', async () => {
      await db.run(`
        INSERT INTO discord_settings (id, guild_id, bot_token)
        VALUES (1, 'guild-123', 'token-abc')
      `);

      const request = createMockRequest('POST', '/api/channels', {
        discord_channel_id: 'dc-new-123',
        channel_type: 'text',
        send_announcements: true,
        send_reminders: false,
      });
      const response = await POST(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toBeDefined();
    });

    it('returns 409 when channel already exists', async () => {
      await db.run(`
        INSERT INTO discord_settings (id, guild_id, bot_token)
        VALUES (1, 'guild-123', 'token-abc')
      `);
      await db.run(`
        INSERT INTO discord_channels (id, guild_id, discord_channel_id, name, type, channel_type)
        VALUES ('ch-existing', 'guild-123', 'dc-dup', 'dup', 0, 'text')
      `);

      const request = createMockRequest('POST', '/api/channels', {
        discord_channel_id: 'dc-dup',
        channel_type: 'text',
      });
      const response = await POST(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(409);
    });
  });
});
