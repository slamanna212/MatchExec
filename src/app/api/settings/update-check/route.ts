import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { UpdateCheckJob } from '../../../../../processes/scheduler/jobs/check-for-update';

const RATE_LIMIT_SECONDS = 60;

export async function GET() {
  try {
    const db = await getDbInstance();

    const rows = await db.all<{ setting_key: string; setting_value: string }>(
      `SELECT setting_key, setting_value FROM app_settings
       WHERE setting_key IN ('update_check_enabled', 'latest_version', 'update_check_last_run', 'update_available')`
    );

    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.setting_key] = row.setting_value;
    }

    return apiOk({
      update_check_enabled: map['update_check_enabled'] === 'true',
      update_available: map['update_available'] === 'true',
      latest_version: map['latest_version'] ?? '',
      update_check_last_run: map['update_check_last_run'] ?? '',
    });
  } catch (error) {
    logger.error('Error fetching update check settings:', error);
    return apiError('Failed to fetch update check settings');
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { update_check_enabled } = body;

    if (typeof update_check_enabled !== 'boolean') {
      return apiError('update_check_enabled must be a boolean', 400);
    }

    const db = await getDbInstance();
    await db.run(
      `UPDATE app_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE setting_key = 'update_check_enabled'`,
      [update_check_enabled ? 'true' : 'false']
    );

    return apiOk({ success: true, update_check_enabled });
  } catch (error) {
    logger.error('Error updating update check settings:', error);
    return apiError('Failed to update update check settings');
  }
}

export async function POST() {
  try {
    const db = await getDbInstance();

    const lastRunRow = await db.get<{ setting_value: string }>(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'update_check_last_run'`
    );
    if (lastRunRow?.setting_value) {
      const lastRun = new Date(lastRunRow.setting_value).getTime();
      const secondsSince = (Date.now() - lastRun) / 1000;
      if (secondsSince < RATE_LIMIT_SECONDS) {
        return apiError('Rate limited — wait before checking again', 429);
      }
    }

    const job = new UpdateCheckJob(db);
    await job.checkForUpdate();

    return apiOk({ success: true, checked_at: new Date().toISOString() });
  } catch (error) {
    logger.error('Error running update check:', error);
    return apiError('Failed to run update check');
  }
}
