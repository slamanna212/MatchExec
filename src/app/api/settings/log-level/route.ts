import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';

const VALID_LOG_LEVELS = ['debug', 'info', 'warning', 'error', 'critical'];

export async function GET() {
  try {
    const db = await getDbInstance();

    const result = await db.get(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?',
      ['log_level']
    ) as { setting_value: string } | undefined;

    const logLevel = result?.setting_value || 'warning';

    return NextResponse.json({ log_level: logLevel });
  } catch (error) {
    logger.error('Error fetching log level:', error);
    return NextResponse.json(
      { error: 'Failed to fetch log level' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { log_level } = body;

    // Validate log level
    if (!log_level || !VALID_LOG_LEVELS.includes(log_level)) {
      return NextResponse.json(
        { error: 'Invalid log level. Must be one of: debug, info, warning, error, critical' },
        { status: 400 }
      );
    }

    const db = await getDbInstance();

    // Update log level in database
    await db.run(
      'UPDATE app_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
      [log_level, 'log_level']
    );

    // Reload logger cache
    await logger.reload();

    return NextResponse.json({
      success: true,
      log_level
    });
  } catch (error) {
    logger.error('Error updating log level:', error);
    return NextResponse.json(
      { error: 'Failed to update log level' },
      { status: 500 }
    );
  }
}