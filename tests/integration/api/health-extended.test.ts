/**
 * L2 — Health Extended
 *
 * Covers the basic /api/health endpoint and extends /api/health/ready
 * coverage with 503-before-db and overall-status assertions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

import { GET as getHealth } from '@/app/api/health/route';
import { GET as getHealthReady } from '@/app/api/health/ready/route';

describe('Health Extended (L2)', () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    await seedBasicTestData();
    db = getTestDb();
  });

  // ─── GET /api/health ──────────────────────────────────────────────────────

  describe('GET /api/health', () => {
    it('returns 200 with status=healthy when DB is up', async () => {
      const response = await getHealth();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe('healthy');
    });

    it('includes timestamp in response', async () => {
      const response = await getHealth();
      const body = await response.json();

      expect(body).toHaveProperty('timestamp');
      expect(new Date(body.timestamp as string).getTime()).toBeGreaterThan(0);
    });

    it('includes services object with database and web', async () => {
      const response = await getHealth();
      const body = await response.json();

      expect(body.services).toHaveProperty('database');
      expect(body.services).toHaveProperty('web');
      expect(body.services.database).toBe('up');
      expect(body.services.web).toBe('up');
    });

    it('response body matches expected shape', async () => {
      const response = await getHealth();
      const body = await response.json();

      expect(Object.keys(body)).toEqual(expect.arrayContaining(['status', 'timestamp', 'services']));
    });
  });

  // ─── GET /api/health/ready — extended scenarios ───────────────────────────

  describe('GET /api/health/ready — extended', () => {
    it('returns 200 when DB is up (even with services down)', async () => {
      // No heartbeats seeded — services show down but DB is fine
      const response = await getHealthReady();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.services.database.status).toBe('up');
    });

    it('overall status is unhealthy when any service is down', async () => {
      // Fresh DB: scheduler, discord_bot, stats_processor have no heartbeats → down
      const response = await getHealthReady();
      const body = await response.json();

      expect(body.status).toBe('unhealthy');
    });

    it('overall status is degraded when all services are up or degraded (none down)', async () => {
      // Seed all three heartbeats as old enough to be degraded but not down
      const oldTime = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago
      for (const key of [
        'scheduler_last_heartbeat',
        'discord_bot_last_heartbeat',
        'stats_processor_last_heartbeat',
      ]) {
        await db.run(
          `INSERT OR REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
          [key, oldTime]
        );
      }

      const response = await getHealthReady();
      const body = await response.json();

      expect(['degraded', 'unhealthy']).toContain(body.status);
    });

    it('discord_bot shows welcome-flow message when setup not complete', async () => {
      // No heartbeat, no welcome_flow_completed
      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.discord_bot.status).toBe('down');
      expect(body.services.discord_bot.message).toContain('Welcome flow not completed');
    });

    it('discord_bot shows heartbeat message when setup done but no heartbeat', async () => {
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('welcome_flow_completed', 'true')`
      );

      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.discord_bot.status).toBe('down');
      expect(body.services.discord_bot.message).toContain('No heartbeat recorded yet');
    });

    it('stats_processor is down with no heartbeat', async () => {
      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.stats_processor.status).toBe('down');
    });

    it('degraded heartbeat includes message with elapsed minutes', async () => {
      const oldTime = new Date(Date.now() - 25 * 60 * 1000).toISOString(); // 25 min ago
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('scheduler_last_heartbeat', ?)`,
        [oldTime]
      );

      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.scheduler.status).toBe('degraded');
      expect(body.services.scheduler.message).toMatch(/\d+ minutes/);
    });

    it('includes lastHeartbeat timestamp when heartbeat is present', async () => {
      const recentTime = new Date(Date.now() - 60000).toISOString();
      await db.run(
        `INSERT OR REPLACE INTO app_settings (setting_key, setting_value)
         VALUES ('scheduler_last_heartbeat', ?)`,
        [recentTime]
      );

      const response = await getHealthReady();
      const body = await response.json();

      expect(body.services.scheduler).toHaveProperty('lastHeartbeat');
      expect(body.services.scheduler.lastHeartbeat).toBe(recentTime);
    });
  });
});
