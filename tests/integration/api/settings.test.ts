import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse } from '../../utils/api-helpers';
import { getTestDb } from '../../utils/test-db';
import { GET as getDiscordSettings, PUT as updateDiscordSettings } from '@/app/api/settings/discord/route';
import { GET as getAnnouncerSettings, PUT as updateAnnouncerSettings } from '@/app/api/settings/announcer/route';
import { GET as getUISettings, PUT as updateUISettings } from '@/app/api/settings/ui/route';
import { GET as getLogLevel, PUT as updateLogLevel } from '@/app/api/settings/log-level/route';
import { GET as getStatsSettings, PUT as updateStatsSettings } from '@/app/api/settings/stats/route';

describe('Settings API', () => {
  describe('Discord Settings', () => {
    it('should return current discord settings', async () => {
      const response = await getDiscordSettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toBeDefined();
    });

    it('should update discord settings', async () => {
      const request = createMockRequest('PUT', '/api/settings/discord', {
        bot_token: 'new-token',
        guild_id: 'new-guild',
        announcement_role_id: 'new-role',
      });

      const response = await updateDiscordSettings(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('success', true);

      // Verify settings were persisted by reading them back
      const getResponse = await getDiscordSettings();
      const { data: savedData } = await parseResponse(getResponse);
      expect(savedData).toBeDefined();
      expect(savedData.guild_id).toBe('new-guild');
      expect(savedData.bot_token).toBe('••••••••'); // Token is masked in GET response
      expect(savedData.announcement_role_id).toBe('new-role');
    });
  });

  describe('Announcer Settings', () => {
    it('should return announcer settings', async () => {
      const response = await getAnnouncerSettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toBeDefined();
    });

    it('should update announcer settings', async () => {
      const request = createMockRequest('PUT', '/api/settings/announcer', {
        announcer_voice: 'male',
        voice_announcements_enabled: true,
      });

      const response = await updateAnnouncerSettings(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('success', true);

      // Verify settings were persisted by reading them back
      const getResponse = await getAnnouncerSettings();
      const { data: savedData } = await parseResponse(getResponse);
      expect(savedData).toBeDefined();
      expect(savedData.announcer_voice).toBe('male');
      expect(savedData.voice_announcements_enabled).toBe(true);
    });
  });

  describe('UI Settings', () => {
    it('should return UI settings', async () => {
      const response = await getUISettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toBeDefined();
    });

    it('should update UI settings', async () => {
      const request = createMockRequest('PUT', '/api/settings/ui', {
        auto_refresh_interval_seconds: 30,
      });

      const response = await updateUISettings(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('message');

      // Verify settings were persisted by reading them back
      const getResponse = await getUISettings();
      const { data: savedData } = await parseResponse(getResponse);
      expect(savedData).toBeDefined();
      expect(savedData.auto_refresh_interval_seconds).toBe(30);
    });
  });

  describe('Log Level Settings', () => {
    it('should return current log level', async () => {
      const response = await getLogLevel();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.log_level).toBeDefined();
      expect(['debug', 'info', 'warning', 'error', 'critical']).toContain(data.log_level);
    });

    it('should update log level', async () => {
      const db = getTestDb();

      // Ensure log_level row exists first
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO app_settings (setting_key, setting_value, data_type)
           VALUES ('log_level', 'warning', 'string')`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      const request = createMockRequest('PUT', '/api/settings/log-level', {
        log_level: 'debug',
      });

      const response = await updateLogLevel(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.log_level).toBe('debug');

      // Verify in database
      const setting = await new Promise<any>((resolve, reject) => {
        db.get(
          "SELECT * FROM app_settings WHERE setting_key = 'log_level'",
          (err, row) => (err ? reject(err) : resolve(row))
        );
      });

      expect(setting.setting_value).toBe('debug');
    });

    it('should reject invalid log level', async () => {
      const request = createMockRequest('PUT', '/api/settings/log-level', {
        log_level: 'invalid-level',
      });

      const response = await updateLogLevel(request);
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });
  });

  describe('Stats Settings', () => {
    beforeEach(async () => {
      const db = getTestDb();
      await db.run('INSERT OR IGNORE INTO stats_settings (id) VALUES (1)');
    });

    it('should return stats_report_dm_enabled in GET response', async () => {
      const response = await getStatsSettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('stats_report_dm_enabled');
      expect(typeof data.stats_report_dm_enabled).toBe('boolean');
    });

    it('should persist stats_report_dm_enabled via PUT', async () => {
      const request = createMockRequest('PUT', '/api/settings/stats', {
        stats_report_dm_enabled: true,
      });

      const response = await updateStatsSettings(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('success', true);

      const getResponse = await getStatsSettings();
      const { data: savedData } = await parseResponse(getResponse);
      expect(savedData.stats_report_dm_enabled).toBe(true);
    });

    it('should persist stats_report_dm_enabled=false via PUT', async () => {
      const request = createMockRequest('PUT', '/api/settings/stats', {
        stats_report_dm_enabled: false,
      });

      const putResponse = await updateStatsSettings(request);
      const { status } = await parseResponse(putResponse);
      expect(status).toBe(200);

      const getResponse = await getStatsSettings();
      const { data } = await parseResponse(getResponse);
      expect(data.stats_report_dm_enabled).toBe(false);
    });
  });
});
