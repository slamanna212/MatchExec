import { describe, it, expect, beforeEach } from 'vitest';
import { parseResponse } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

import { GET as getAllSettings } from '@/app/api/settings/route';
import { GET as getDbStatus } from '@/app/api/db-status/route';

describe('General Settings & Status Routes', () => {
  let db: any;

  beforeEach(async () => {
    await seedBasicTestData();
    db = getTestDb();
  });

  // ─── GET /api/settings ───────────────────────────────────────────────────────

  describe('GET /api/settings', () => {
    it('returns all settings sections', async () => {
      const response = await getAllSettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('discord');
      expect(data).toHaveProperty('announcer');
      expect(data).toHaveProperty('ui');
      expect(data).toHaveProperty('scheduler');
      expect(data).toHaveProperty('voices');
    });

    it('returns defaults when no settings configured', async () => {
      const response = await getAllSettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      // Discord defaults
      expect(data.discord.bot_token).toBe('');
      expect(data.discord.event_duration_minutes).toBe(45);
    });

    it('masks bot_token in response', async () => {
      await db.run(
        `INSERT OR REPLACE INTO discord_settings (id, guild_id, bot_token)
         VALUES (1, 'g1', 'super-secret-token')`
      );

      const response = await getAllSettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.discord.bot_token).toBe('••••••••');
      expect(data.discord.bot_token).not.toContain('super-secret');
    });

    it('returns stored discord settings with defaults filled', async () => {
      await db.run(
        `INSERT OR REPLACE INTO discord_settings (id, guild_id, bot_token, mention_everyone)
         VALUES (1, 'guild-abc', 'token-xyz', 1)`
      );

      const response = await getAllSettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.discord.guild_id).toBe('guild-abc');
      expect(data.discord.mention_everyone).toBe(true);
    });

    it('returns voices array', async () => {
      const response = await getAllSettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(Array.isArray(data.voices)).toBe(true);
    });

    it('returns scheduler settings with defaults', async () => {
      const response = await getAllSettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.scheduler.match_check_cron).toBeDefined();
    });
  });

  // ─── GET /api/db-status ──────────────────────────────────────────────────────

  describe('GET /api/db-status', () => {
    it('returns db status object', async () => {
      const response = await getDbStatus();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('ready');
      expect(data).toHaveProperty('progress');
    });
  });
});
