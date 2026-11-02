import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '@lib/db';
import { getAppSetting } from '@/lib/settings';
import { logger } from '@/lib/logger';
import { isDegraded } from '../middleware/degraded';

const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  lastHeartbeat?: string;
  message?: string;
}

function heartbeatStatus(value: string): ServiceStatus {
  const elapsed = Date.now() - new Date(value).getTime();
  return {
    status: elapsed < HEARTBEAT_TIMEOUT_MS ? 'up' : 'degraded',
    lastHeartbeat: value,
    ...(elapsed >= HEARTBEAT_TIMEOUT_MS && {
      message: `No heartbeat for ${Math.floor(elapsed / 60000)} minutes`,
    }),
  };
}

const NO_HEARTBEAT: ServiceStatus = { status: 'down', message: 'No heartbeat recorded yet' };

export const health = new Hono()
  .get('/', async (c) => {
    if (isDegraded()) {
      return c.json({ status: 'degraded', timestamp: new Date().toISOString(), error: 'Database migration failed; see the web UI for details' }, 503);
    }
    try {
      await db.execute(sql`select 1`);
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: { database: 'up', web: 'up' },
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      return c.json({ status: 'unhealthy', timestamp: new Date().toISOString(), error: 'Database connection failed' }, 503);
    }
  })
  // Readiness: only database connectivity gates the status code; background services being unconfigured or
  // still starting must not block the pod from serving traffic.
  .get('/ready', async (c) => {
    const services: Record<string, ServiceStatus> = {
      database: { status: 'down' },
      web: { status: 'up' },
      scheduler: { status: 'down' },
      discord_bot: { status: 'down' },
      stats_processor: { status: 'down' },
    };

    try {
      await db.execute(sql`select 1`);
      services.database = { status: 'up' };

      const [scheduler, bot, statsProcessor] = await Promise.all([
        getAppSetting('scheduler_last_heartbeat'),
        getAppSetting('discord_bot_last_heartbeat'),
        getAppSetting('stats_processor_last_heartbeat'),
      ]);

      services.scheduler = scheduler ? heartbeatStatus(scheduler) : NO_HEARTBEAT;
      if (bot) {
        services.discord_bot = heartbeatStatus(bot);
      } else {
        const welcome = await getAppSetting('welcome_flow_completed');
        services.discord_bot = {
          status: 'down',
          message: welcome !== 'true' ? 'Welcome flow not completed' : 'No heartbeat recorded yet',
        };
      }
      services.stats_processor = statsProcessor ? heartbeatStatus(statsProcessor) : NO_HEARTBEAT;

      const all = Object.values(services);
      const overallStatus = all.every((s) => s.status === 'up') ? 'healthy' : all.some((s) => s.status === 'down') ? 'unhealthy' : 'degraded';
      return c.json(
        { status: overallStatus, timestamp: new Date().toISOString(), services },
        services.database.status === 'down' ? 503 : 200,
      );
    } catch (error) {
      logger.error('Readiness check failed:', error);
      return c.json(
        { status: 'unhealthy', timestamp: new Date().toISOString(), services, error: 'Database connection failed' },
        503,
      );
    }
  });
