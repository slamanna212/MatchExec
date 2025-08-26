import { NextResponse } from 'next/server';
import * as sqlite3 from 'sqlite3';
import * as path from 'path';

export async function PUT(request: Request) {
  try {
    const { screen } = await request.json();
    const dbPath = path.join(process.cwd(), 'app_data/data/matchexec.db');
    
    const metadata = {
      total_screens: 3,
      last_accessed: new Date().toISOString()
    };

    return new Promise((resolve) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Database connection error:', err);
          resolve(NextResponse.json({ error: 'Failed to update screen' }, { status: 500 }));
          return;
        }

        db.run(
          'UPDATE app_settings SET setting_value = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
          [screen.toString(), JSON.stringify(metadata), 'welcome_flow_current_screen'],
          (err) => {
            db.close();
            
            if (err) {
              console.error('Database update error:', err);
              resolve(NextResponse.json({ error: 'Failed to update screen' }, { status: 500 }));
              return;
            }

            resolve(NextResponse.json({ success: true }));
          }
        );
      });
    });
  } catch (error) {
    console.error('Error updating welcome flow screen:', error);
    return NextResponse.json({ error: 'Failed to update screen' }, { status: 500 });
  }
}