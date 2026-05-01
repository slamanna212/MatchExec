import { NextResponse } from 'next/server';
import { getVersionInfo } from '@/lib/version-server';
import { logger } from '@/lib/logger';
import { getDbInstance } from '@/lib/database-init';

export async function GET() {
  try {
    const versionInfo = getVersionInfo();
    const db = await getDbInstance();

    const rows = await db.all<{ setting_key: string; setting_value: string }>(
      `SELECT setting_key, setting_value FROM app_settings
       WHERE setting_key IN ('update_available', 'latest_version')`
    );
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.setting_key] = row.setting_value;
    }

    return NextResponse.json({
      ...versionInfo,
      updateAvailable: map['update_available'] === 'true',
      latestVersion: map['latest_version'] ?? '',
    });
  } catch (error) {
    logger.error('Error getting version info:', error);
    return NextResponse.json(
      { version: 'unknown', branch: 'unknown', commitHash: 'unknown', isDev: false, updateAvailable: false, latestVersion: '' },
      { status: 500 }
    );
  }
}