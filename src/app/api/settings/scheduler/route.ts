import { NextRequest, NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/database';
import { SchedulerSettings } from '@/shared/types';

export async function GET() {
  try {
    const db = await initializeDatabase();
    
    const settings = await db.get<SchedulerSettings>(
      'SELECT * FROM scheduler_settings WHERE id = 1'
    );
    
    if (!settings) {
      return NextResponse.json({
        tournament_check_cron: '0 */5 * * * *',
        reminder_check_cron: '0 0 */4 * * *',
        cleanup_check_cron: '0 0 2 * * *',
        report_generation_cron: '0 0 0 * * 0',
        enabled: true
      });
    }
    
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching scheduler settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduler settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const db = await initializeDatabase();
    
    // Validate cron expressions (basic validation)
    const cronFields = [
      'tournament_check_cron',
      'reminder_check_cron', 
      'cleanup_check_cron',
      'report_generation_cron'
    ];
    
    for (const field of cronFields) {
      if (body[field]) {
        const cronParts = body[field].split(' ');
        if (cronParts.length !== 6) {
          return NextResponse.json(
            { error: `Invalid cron expression for ${field}. Expected 6 parts (second minute hour day month dayOfWeek)` },
            { status: 400 }
          );
        }
      }
    }
    
    await db.run(
      `UPDATE scheduler_settings 
       SET tournament_check_cron = ?, 
           reminder_check_cron = ?, 
           cleanup_check_cron = ?, 
           report_generation_cron = ?,
           enabled = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        body.tournament_check_cron,
        body.reminder_check_cron,
        body.cleanup_check_cron,
        body.report_generation_cron,
        body.enabled ? 1 : 0
      ]
    );
    
    const updatedSettings = await db.get<SchedulerSettings>(
      'SELECT * FROM scheduler_settings WHERE id = 1'
    );
    
    return NextResponse.json(updatedSettings);
  } catch (error) {
    console.error('Error updating scheduler settings:', error);
    return NextResponse.json(
      { error: 'Failed to update scheduler settings' },
      { status: 500 }
    );
  }
}