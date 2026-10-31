import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '@lib/db';
import { logger } from '@/lib/logger';

export const health = new Hono().get('/', async (c) => {
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
});
