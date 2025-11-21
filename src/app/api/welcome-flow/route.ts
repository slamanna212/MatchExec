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
    logger.error(`[WELCOME-DEBUG] Starting welcome flow completion, setupType: ${setupType}`);

    const db = await getDbInstance();
    logger.error('[WELCOME-DEBUG] Got database instance');

    const metadata = {
      screens_completed: setupType === 'pro_mode' ? [1] : [1, 2, 3],
      completion_date: new Date().toISOString(),
      setup_type: setupType
    };

    logger.error(`[WELCOME-DEBUG] About to run UPDATE with metadata: ${JSON.stringify(metadata)}`);

    const result = await db.run(
      'UPDATE app_settings SET setting_value = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
      ['true', JSON.stringify(metadata), 'welcome_flow_completed']
    );

    logger.error(`[WELCOME-DEBUG] UPDATE completed. Result: ${JSON.stringify(result)}`);
    logger.error(`[WELCOME-DEBUG] Rows affected: ${result.changes}`);

    // Verify the write actually worked
    const verification = await db.get<{ setting_value: string }>(
      'SELECT setting_value FROM app_settings WHERE setting_key = ?',
      ['welcome_flow_completed']
    );

    logger.error(`[WELCOME-DEBUG] Verification read: ${JSON.stringify(verification)}`);

    if (result.changes === 0) {
      logger.error('[WELCOME-DEBUG] UPDATE affected 0 rows! Row may not exist.');
      return NextResponse.json({ error: 'Failed to update welcome flow - row not found' }, { status: 500 });
    }

    if (verification?.setting_value !== 'true') {
      logger.error(`[WELCOME-DEBUG] Verification failed! Expected 'true', got: ${verification?.setting_value}`);
      return NextResponse.json({ error: 'Failed to verify welcome flow update' }, { status: 500 });
    }

    logger.error('[WELCOME-DEBUG] Welcome flow successfully completed and verified');
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[WELCOME-DEBUG] Error completing welcome flow:', error);
    return NextResponse.json({ error: 'Failed to complete welcome flow' }, { status: 500 });
  }
}
