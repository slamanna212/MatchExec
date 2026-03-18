import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';

const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  lastHeartbeat?: string;
  message?: string;
}

export async function GET() {
  const services: Record<string, ServiceStatus> = {
    database: { status: 'down' },
    web: { status: 'up' },
    scheduler: { status: 'down' },
    discord_bot: { status: 'down' },
  };

  try {
    const db = await getDbInstance();

    // Check database connectivity
    await db.get('SELECT 1');
    services.database = { status: 'up' };

    // Check scheduler heartbeat
    const schedulerHeartbeat = await db.get<{ setting_value: string }>(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?',
      ['scheduler_last_heartbeat']
    );

    if (schedulerHeartbeat?.setting_value) {
      const lastBeat = new Date(schedulerHeartbeat.setting_value);
      const elapsed = Date.now() - lastBeat.getTime();
      services.scheduler = {
        status: elapsed < HEARTBEAT_TIMEOUT_MS ? 'up' : 'degraded',
        lastHeartbeat: schedulerHeartbeat.setting_value,
        ...(elapsed >= HEARTBEAT_TIMEOUT_MS && {
          message: `No heartbeat for ${Math.floor(elapsed / 60000)} minutes`,
        }),
      };
    } else {
      services.scheduler = { status: 'down', message: 'No heartbeat recorded yet' };
    }

    // Check Discord bot heartbeat
    const botHeartbeat = await db.get<{ setting_value: string }>(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?',
      ['discord_bot_last_heartbeat']
    );

    if (botHeartbeat?.setting_value) {
      const lastBeat = new Date(botHeartbeat.setting_value);
      const elapsed = Date.now() - lastBeat.getTime();
      services.discord_bot = {
        status: elapsed < HEARTBEAT_TIMEOUT_MS ? 'up' : 'degraded',
        lastHeartbeat: botHeartbeat.setting_value,
        ...(elapsed >= HEARTBEAT_TIMEOUT_MS && {
          message: `No heartbeat for ${Math.floor(elapsed / 60000)} minutes`,
        }),
      };
    } else {
      // Bot may not be configured yet (no token) — check if welcome flow is done
      const welcomeResult = await db.get<{ setting_value: string }>(
        'SELECT setting_value FROM app_settings WHERE setting_key = ?',
        ['welcome_flow_completed']
      );
      if (welcomeResult?.setting_value !== 'true') {
        services.discord_bot = { status: 'down', message: 'Welcome flow not completed' };
      } else {
        services.discord_bot = { status: 'down', message: 'No heartbeat recorded yet' };
      }
    }

    // Overall status
    const allUp = Object.values(services).every(s => s.status === 'up');
    const anyDown = Object.values(services).some(s => s.status === 'down');
    const overallStatus = allUp ? 'healthy' : anyDown ? 'unhealthy' : 'degraded';

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

    return NextResponse.json(
      {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services,
      },
      { status: statusCode }
    );
  } catch (error) {
    logger.error('Readiness check failed:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services,
        error: 'Database connection failed',
      },
      { status: 503 }
    );
  }
}
