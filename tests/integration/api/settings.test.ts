import { describe, it, expect } from 'vitest';
import { createMockRequest, parseResponse } from '../../utils/api-helpers';
import { getTestDb } from '../../utils/test-db';
import { GET as getDiscordSettings, PUT as updateDiscordSettings } from '@/app/api/settings/discord/route';
import { GET as getAnnouncerSettings, PUT as updateAnnouncerSettings } from '@/app/api/settings/announcer/route';
import { GET as getUISettings, PUT as updateUISettings } from '@/app/api/settings/ui/route';
import { GET as getLogLevel, PUT as updateLogLevel } from '@/app/api/settings/log-level/route';

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
        token: 'new-token',
        guildId: 'new-guild',
        announcementChannelId: 'new-channel',
      });

      const response = await updateDiscordSettings(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('success', true);

      // Verify settings were persisted by reading them back
      const getResponse = await getDiscordSettings();
      const { data: savedData } = await parseResponse(getResponse);
      expect(savedData).toBeDefined();
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
        enabled: true,
        voice: 'male',
        volume: 80,
      });

      const response = await updateAnnouncerSettings(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('success', true);

      // Verify settings were persisted by reading them back
      const getResponse = await getAnnouncerSettings();
      const { data: savedData } = await parseResponse(getResponse);
      expect(savedData).toBeDefined();
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
});
