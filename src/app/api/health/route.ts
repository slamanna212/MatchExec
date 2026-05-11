import type { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiOk } from '@/lib/api-response';

export async function GET(): Promise<NextResponse> {
  try {
    // Check database connectivity
    const db = await getDbInstance();
    await db.get('SELECT 1');

    // Return basic health status
    return apiOk({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        web: 'up'
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    return apiOk(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Database connection failed'
      },
      503
    );
  }
}