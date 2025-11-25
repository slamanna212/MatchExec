import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getDbInstance } from '@/lib/database-init';

export async function GET(): Promise<NextResponse> {
  try {
    const db = await getDbInstance();

    const row = await db.get<{ setting_value: string; metadata?: string }>(
      'SELECT setting_value, metadata FROM app_settings WHERE setting_key = ?',
      ['welcome_flow_completed']
    );

    const completed = row?.setting_value === 'true';
    const metadata = row?.metadata
      ? JSON.parse(row.metadata)
      : { screens_completed: [], completion_date: null, setup_type: null };

    return NextResponse.json({
      isFirstRun: !completed,
      completed,
      metadata
    });
  } catch (error) {
    logger.error('Error checking welcome flow status:', error);
    return NextResponse.json({
      isFirstRun: true,
      completed: false,
      metadata: { screens_completed: [], completion_date: null, setup_type: null }
    });
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { setupType } = await request.json();
    const db = await getDbInstance();

    const metadata = {
      screens_completed: setupType === 'pro_mode' ? [1] : [1, 2, 3],
      completion_date: new Date().toISOString(),
      setup_type: setupType
    };

    const result = await db.run(
      'UPDATE app_settings SET setting_value = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
      ['true', JSON.stringify(metadata), 'welcome_flow_completed']
    );

    if (result.changes === 0) {
      logger.error('Failed to update welcome flow - row not found');
      return NextResponse.json({ error: 'Failed to update welcome flow - row not found' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error completing welcome flow:', error);
    return NextResponse.json({ error: 'Failed to complete welcome flow' }, { status: 500 });
  }
}
