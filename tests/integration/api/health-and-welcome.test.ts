import { describe, it, expect, beforeEach } from 'vitest';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

import { GET as getHealthReady } from '@/app/api/health/ready/route';

describe('Health Ready & Welcome Flow Routes', () => {
  let db: any;

  beforeEach(async () => {
    await seedBasicTestData();
    db = getTestDb();
  });

  // ─── GET /api/health/ready ────────────────────────────────────────────────────

  describe('GET /api/health/ready', () => {
    it('returns status with all services', async () => {
      const response = await getHealthReady();
      const body = await response.json();

      // Status is 200 (healthy/degraded) or 503 (unhealthy)
      expect([200, 503]).toContain(response.status);
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('services');
      expect(body.services).toHaveProperty('database');
      expect(body.services).toHaveProperty('scheduler');
      expect(body.services).toHaveProperty('discord_bot');
    });

    it('marks database as up when connection works', async () => {
      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.database.status).toBe('up');
    });

    it('reports scheduler as down when no heartbeat', async () => {
      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.scheduler.status).toBe('down');
    });

    it('marks scheduler as up when recent heartbeat', async () => {
      const recentTime = new Date(Date.now() - 60000).toISOString(); // 1 min ago
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('scheduler_last_heartbeat', ?)`,
        [recentTime]
      );

      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.scheduler.status).toBe('up');
    });

    it('marks scheduler as degraded when old heartbeat', async () => {
      const oldTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('scheduler_last_heartbeat', ?)`,
        [oldTime]
      );

      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.scheduler.status).toBe('degraded');
      expect(body.services.scheduler.message).toContain('minutes');
    });

    it('marks discord_bot as up when recent heartbeat', async () => {
      const recentTime = new Date(Date.now() - 30000).toISOString();
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('discord_bot_last_heartbeat', ?)`,
        [recentTime]
      );

      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.discord_bot.status).toBe('up');
    });

    it('marks stats_processor as up when recent heartbeat', async () => {
      const recentTime = new Date(Date.now() - 30000).toISOString();
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('stats_processor_last_heartbeat', ?)`,
        [recentTime]
      );

      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.stats_processor.status).toBe('up');
    });

    it('returns healthy when all services are up', async () => {
      const recentTime = new Date(Date.now() - 30000).toISOString();
      for (const key of ['scheduler_last_heartbeat', 'discord_bot_last_heartbeat', 'stats_processor_last_heartbeat']) {
        await db.run(
          `INSERT OR REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
          [key, recentTime]
        );
      }

      const response = await getHealthReady();
      const body = await response.json();

      expect(body.status).toBe('healthy');
      expect(response.status).toBe(200);
    });
  });

});
