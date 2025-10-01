import { NextResponse } from 'next/server';
import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import { logger } from '@/lib/logger';

export async function GET(): Promise<NextResponse> {
  try {
    const dbPath = path.join(process.cwd(), 'app_data/data/matchexec.db');
    
    return new Promise<NextResponse>((resolve) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          logger.error('Database connection error:', err);
          resolve(NextResponse.json({ error: 'Database connection failed' }, { status: 500 }));
          return;
        }

        db.get(
          'SELECT setting_value FROM app_settings WHERE setting_key = ?',
          ['welcome_flow_completed'],
          (err, row: { setting_value: string } | undefined) => {
            db.close();
            
            if (err) {
              logger.error('Database query error:', err);
              resolve(NextResponse.json({ error: 'Database query failed' }, { status: 500 }));
              return;
            }

            const completed = row?.setting_value === 'true';
            resolve(NextResponse.json({ 
              isFirstRun: !completed,
              completed,
              dbPath,
              row 
            }));
          }
        );
      });
    });
  } catch (error) {
    logger.error('API error:', error);
    return NextResponse.json({ error: 'API error', details: String(error) }, { status: 500 });
  }
}