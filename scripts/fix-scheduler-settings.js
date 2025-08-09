const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function fixSchedulerSettings() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    // Update reminder check to run every 5 minutes instead of every 4 hours
    db.run(`
      UPDATE scheduler_settings 
      SET reminder_check_cron = '0 */5 * * * *', updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, function(err) {
      if (err) {
        reject(err);
      } else {
        console.log('✅ Updated reminder check to run every 5 minutes');
        
        // Verify the update
        db.get("SELECT reminder_check_cron FROM scheduler_settings WHERE id = 1", (err, result) => {
          if (!err) {
            console.log('New reminder check schedule:', result.reminder_check_cron);
          }
          
          db.close();
          resolve();
        });
      }
    });
  });
}

fixSchedulerSettings().catch(console.error);