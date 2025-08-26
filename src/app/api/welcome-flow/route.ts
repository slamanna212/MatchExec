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
          resolve(NextResponse.json({ 
            isFirstRun: true, 
            completed: false, 
            metadata: { screens_completed: [], completion_date: null, setup_type: null }
          }));
          return;
        }

        db.get(
          'SELECT setting_value, metadata FROM app_settings WHERE setting_key = ?',
          ['welcome_flow_completed'],
          (err, row: any) => {
            db.close();
            
            if (err) {
              console.error('Database query error:', err);
              resolve(NextResponse.json({ 
                isFirstRun: true, 
                completed: false, 
                metadata: { screens_completed: [], completion_date: null, setup_type: null }
              }));
              return;
            }

            const completed = row?.setting_value === 'true';
            const metadata = row?.metadata 
              ? JSON.parse(row.metadata)
              : { screens_completed: [], completion_date: null, setup_type: null };

            resolve(NextResponse.json({ 
              isFirstRun: !completed,
              completed,
              metadata 
            }));
          }
        );
      });
    });
  } catch (error) {
    console.error('Error checking welcome flow status:', error);
    return NextResponse.json({ 
      isFirstRun: true, 
      completed: false, 
      metadata: { screens_completed: [], completion_date: null, setup_type: null }
    });
  }
}

export async function PUT(request: Request) {
  try {
    const { setupType } = await request.json();
    const dbPath = path.join(process.cwd(), 'app_data/data/matchexec.db');
    
    const metadata = {
      screens_completed: setupType === 'pro_mode' ? [1] : [1, 2, 3],
      completion_date: new Date().toISOString(),
      setup_type: setupType
    };

    return new Promise((resolve) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Database connection error:', err);
          resolve(NextResponse.json({ error: 'Failed to complete welcome flow' }, { status: 500 }));
          return;
        }

        db.run(
          'UPDATE app_settings SET setting_value = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
          ['true', JSON.stringify(metadata), 'welcome_flow_completed'],
          (err) => {
            db.close();
            
            if (err) {
              console.error('Database update error:', err);
              resolve(NextResponse.json({ error: 'Failed to complete welcome flow' }, { status: 500 }));
              return;
            }

            resolve(NextResponse.json({ success: true }));
          }
        );
      });
    });
  } catch (error) {
    console.error('Error completing welcome flow:', error);
    return NextResponse.json({ error: 'Failed to complete welcome flow' }, { status: 500 });
  }
}