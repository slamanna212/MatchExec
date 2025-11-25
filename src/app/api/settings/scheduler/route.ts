import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import type { SchedulerSettings } from '@/shared/types';
import { logger } from '@/lib/logger';

/**
 * Validates a cron expression has exactly 6 parts
 */
function validateCronExpression(cronExpression: string, fieldName: string): { valid: boolean; error?: string } {
  const cronParts = cronExpression.split(' ');
  if (cronParts.length !== 6) {
    return {
      valid: false,
      error: `Invalid cron expression for ${fieldName}. Expected 6 parts (second minute hour day month dayOfWeek)`
    };
  }
  return { valid: true };
}

/**
 * Validates all cron fields in the request body
 */
function validateCronFields(body: Record<string, unknown>): { valid: boolean; error?: string } {
  const cronFields = ['match_check_cron', 'cleanup_check_cron', 'channel_refresh_cron'];

  for (const field of cronFields) {
    if (body[field] && typeof body[field] === 'string') {
      const validation = validateCronExpression(body[field] as string, field);
      if (!validation.valid) {
        return validation;
      }
    }
  }

  return { valid: true };
}

export async function GET() {
  try {
    const db = await getDbInstance();

    const settings = await db.get<SchedulerSettings>(
      'SELECT * FROM scheduler_settings WHERE id = 1'
    );

    if (!settings) {
      return NextResponse.json({
        match_check_cron: '0 */1 * * * *',
        cleanup_check_cron: '0 0 2 * * *',
        channel_refresh_cron: '0 0 0 * * *'
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    logger.error('Error fetching scheduler settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduler settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate cron expressions
    const validation = validateCronFields(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const db = await getDbInstance();

    await db.run(
      `UPDATE scheduler_settings
       SET match_check_cron = ?,
           cleanup_check_cron = ?,
           channel_refresh_cron = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        body.match_check_cron,
        body.cleanup_check_cron,
        body.channel_refresh_cron
      ]
    );

    const updatedSettings = await db.get<SchedulerSettings>(
      'SELECT * FROM scheduler_settings WHERE id = 1'
    );

    return NextResponse.json(updatedSettings);
  } catch (error) {
    logger.error('Error updating scheduler settings:', error);
    return NextResponse.json(
      { error: 'Failed to update scheduler settings' },
      { status: 500 }
    );
  }
}