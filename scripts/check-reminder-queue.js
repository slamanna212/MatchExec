const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkReminderQueue() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    console.log('=== Discord Match Reminder Queue ===');
    
    db.all(`
      SELECT * FROM discord_match_reminder_queue 
      ORDER BY created_at DESC 
      LIMIT 10
    `, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (rows.length === 0) {
        console.log('No reminder queue entries found');
      } else {
        console.log('Found', rows.length, 'reminder queue entries:');
        rows.forEach(row => {
          console.log(`ID: ${row.id}`);
          console.log(`Match ID: ${row.match_id}`);
          console.log(`Status: ${row.status}`);
          console.log(`Created: ${row.created_at}`);
          console.log(`Processed: ${row.processed_at || 'Not processed'}`);
          console.log(`Error: ${row.error_message || 'None'}`);
          console.log('---');
        });
      }
      
      console.log('\n=== Discord Reminder Queue (Scheduler) ===');
      
      db.all(`
        SELECT * FROM discord_reminder_queue 
        ORDER BY created_at DESC 
        LIMIT 10
      `, (err, rows) => {
        if (err) {
          console.error('Error querying scheduler reminder queue:', err);
          db.close();
          resolve();
          return;
        }
        
        if (rows.length === 0) {
          console.log('No scheduler reminder queue entries found');
        } else {
          console.log('Found', rows.length, 'scheduler reminder queue entries:');
          rows.forEach(row => {
            console.log(`ID: ${row.id}`);
            console.log(`Match ID: ${row.match_id}`);
            console.log(`Status: ${row.status}`);
            console.log(`Reminder Time: ${row.reminder_time}`);
            console.log(`Created: ${row.created_at}`);
            console.log(`Sent: ${row.sent_at || 'Not sent'}`);
            console.log(`Error: ${row.error_message || 'None'}`);
            console.log('---');
          });
        }
        
        db.close();
        resolve();
      });
    });
  });
}

checkReminderQueue().catch(console.error);