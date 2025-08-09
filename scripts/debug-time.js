const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function debugTime() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    console.log('=== Time Debug ===');
    
    // Get current time from SQLite
    db.get(`SELECT datetime('now') as current_time`, (err, timeRow) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log(`SQLite current time: ${timeRow.current_time}`);
      console.log(`JavaScript current time: ${new Date().toISOString()}`);
      
      // Get all pending reminders with time comparison
      db.all(`
        SELECT 
          drq.id, 
          drq.match_id, 
          drq.reminder_time,
          drq.status,
          datetime('now') as current_time,
          (drq.reminder_time <= datetime('now')) as is_due
        FROM discord_reminder_queue drq
        WHERE drq.status = 'pending'
      `, (err, reminders) => {
        if (err) {
          reject(err);
          return;
        }
        
        console.log(`\nFound ${reminders.length} pending reminders:`);
        reminders.forEach(reminder => {
          console.log(`ID: ${reminder.id}`);
          console.log(`Match: ${reminder.match_id}`);
          console.log(`Reminder time: ${reminder.reminder_time}`);
          console.log(`Current time: ${reminder.current_time}`);
          console.log(`Is due: ${reminder.is_due ? 'YES' : 'NO'}`);
          console.log('---');
        });
        
        db.close();
        resolve();
      });
    });
  });
}

debugTime().catch(console.error);