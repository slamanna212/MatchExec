import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiOk } from '@/lib/api-response';

const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  lastHeartbeat?: string;
  message?: string;
}

type DbInstance = Awaited<ReturnType<typeof getDbInstance>>;

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

async function getHeartbeat(db: DbInstance, key: string): Promise<string | undefined> {
  const row = await db.get<{ setting_value: string }>(
    'SELECT setting_value FROM app_settings WHERE setting_key = ?',
    [key]
  );
  return row?.setting_value;
}

export async function GET() {
  const services: Record<string, ServiceStatus> = {
    database: { status: 'down' },
    web: { status: 'up' },
    scheduler: { status: 'down' },
    discord_bot: { status: 'down' },
    stats_processor: { status: 'down' },
  };

  try {
    const db = await getDbInstance();

    // Check database connectivity
    await db.get('SELECT 1');
    services.database = { status: 'up' };

    // Check scheduler heartbeat
    const schedulerValue = await getHeartbeat(db, 'scheduler_last_heartbeat');
    services.scheduler = schedulerValue
      ? heartbeatStatus(schedulerValue)
      : { status: 'down', message: 'No heartbeat recorded yet' };

    // Check Discord bot heartbeat
    const botValue = await getHeartbeat(db, 'discord_bot_last_heartbeat');
    if (botValue) {
      services.discord_bot = heartbeatStatus(botValue);
    } else {
      const welcomeValue = await getHeartbeat(db, 'welcome_flow_completed');
      services.discord_bot = {
        status: 'down',
        message: welcomeValue !== 'true' ? 'Welcome flow not completed' : 'No heartbeat recorded yet',
      };
    }

    // Check stats processor heartbeat
    const statsValue = await getHeartbeat(db, 'stats_processor_last_heartbeat');
    services.stats_processor = statsValue
      ? heartbeatStatus(statsValue)
      : { status: 'down', message: 'No heartbeat recorded yet' };

    // Overall status
    const allUp = Object.values(services).every(s => s.status === 'up');
    const anyDown = Object.values(services).some(s => s.status === 'down');
    const overallStatus = allUp ? 'healthy' : anyDown ? 'unhealthy' : 'degraded';

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

    return apiOk(
      {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services,
      },
      statusCode
    );
  } catch (error) {
    logger.error('Readiness check failed:', error);
    return apiOk(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services,
        error: 'Database connection failed',
      },
      503
    );
  }
}
