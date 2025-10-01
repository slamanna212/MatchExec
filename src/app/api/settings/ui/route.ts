import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const db = await getDbInstance();
    
    const settings = await db.get(`
      SELECT * FROM ui_settings WHERE id = 1
    `);

    return NextResponse.json(settings || { auto_refresh_interval_seconds: 10 });
  } catch (error) {
    logger.error('Error fetching UI settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch UI settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await getDbInstance();
    const body = await request.json();
    const { auto_refresh_interval_seconds } = body;

    // Validate input
    if (!auto_refresh_interval_seconds || auto_refresh_interval_seconds < 5 || auto_refresh_interval_seconds > 300) {
      return NextResponse.json(
        { error: 'Auto refresh interval must be between 5 and 300 seconds' },
        { status: 400 }
      );
    }

    // Update or insert UI settings
    await db.run(`
      INSERT OR REPLACE INTO ui_settings (id, auto_refresh_interval_seconds, updated_at) 
      VALUES (1, ?, CURRENT_TIMESTAMP)
    `, [auto_refresh_interval_seconds]);

    return NextResponse.json({ message: 'UI settings updated successfully' });
  } catch (error) {
    logger.error('Error updating UI settings:', error);
    return NextResponse.json(
      { error: 'Failed to update UI settings' },
      { status: 500 }
    );
  }
}