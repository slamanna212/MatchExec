import { NextResponse } from 'next/server';
import * as sqlite3 from 'sqlite3';
import * as path from 'path';

export async function GET() {
  try {
    const dbPath = path.join(process.cwd(), 'app_data/data/matchexec.db');
    
    return new Promise((resolve) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Database connection error:', err);
          resolve(NextResponse.json({ error: 'Database connection failed' }, { status: 500 }));
          return;
        }

        db.get(
          'SELECT setting_value FROM app_settings WHERE setting_key = ?',
          ['welcome_flow_completed'],
          (err, row: any) => {
            db.close();
            
            if (err) {
              console.error('Database query error:', err);
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
    console.error('API error:', error);
    return NextResponse.json({ error: 'API error', details: String(error) }, { status: 500 });
  }
}