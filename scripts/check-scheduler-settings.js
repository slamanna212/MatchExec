const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkSchedulerSettings() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM scheduler_settings WHERE id = 1", (err, settings) => {
      if (err) {
        reject(err);
      } else {
        console.log('Current scheduler settings:');
        console.log('- Match Check:', settings?.match_check_cron || 'default');
        console.log('- Reminder Check:', settings?.reminder_check_cron || 'default');
        console.log('- Cleanup Check:', settings?.cleanup_check_cron || 'default');
        console.log('- Report Generation:', settings?.report_generation_cron || 'default');
        
        // Also check Discord settings for reminder minutes
        db.get("SELECT match_reminder_minutes FROM discord_settings WHERE id = 1", (err, discord) => {
          if (!err && discord) {
            console.log('- Reminder Minutes Before Match:', discord.match_reminder_minutes || '10');
          }
          
          db.close();
          resolve(settings);
        });
      }
    });
  });
}

checkSchedulerSettings().catch(console.error);