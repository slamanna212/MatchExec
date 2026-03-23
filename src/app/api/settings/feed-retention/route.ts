import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';

const DEFAULT_RETENTION_DAYS = 180;

export async function GET() {
  try {
    const db = await getDbInstance();

    const result = await db.get(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?',
      ['feed_retention_days']
    ) as { setting_value: string } | undefined;

    const feed_retention_days = result?.setting_value
      ? parseInt(result.setting_value, 10)
      : DEFAULT_RETENTION_DAYS;

    return NextResponse.json({ feed_retention_days });
  } catch (error) {
    logger.error('Error fetching feed retention days:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feed retention days' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { feed_retention_days } = body;

    const parsed = parseInt(feed_retention_days, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 3650) {
      return NextResponse.json(
        { error: 'Invalid value. Must be an integer between 1 and 3650.' },
        { status: 400 }
      );
    }

    const db = await getDbInstance();

    await db.run(
      'UPDATE app_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
      [String(parsed), 'feed_retention_days']
    );

    return NextResponse.json({ success: true, feed_retention_days: parsed });
  } catch (error) {
    logger.error('Error updating feed retention days:', error);
    return NextResponse.json(
      { error: 'Failed to update feed retention days' },
      { status: 500 }
    );
  }
}
