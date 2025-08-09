const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkReminders() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    console.log('=== Checking Match Reminder System ===\n');
    
    // Check if reminder tables exist
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%reminder%'", (err, tables) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log('Reminder tables:', tables.map(t => t.name));
      
      // Check for matches with start_date
      db.all(`
        SELECT id, name, start_date, status 
        FROM matches 
        WHERE start_date IS NOT NULL 
        ORDER BY start_date DESC
      `, (err, matches) => {
        if (err) {
          console.error('Error fetching matches:', err);
        } else {
          console.log('\nMatches with start dates:');
          matches.forEach(match => {
            const startTime = new Date(match.start_date);
            const now = new Date();
            const diff = (startTime - now) / (1000 * 60); // minutes
            console.log(`- ${match.name}: ${match.start_date} (${Math.round(diff)} min from now) - Status: ${match.status}`);
          });
        }
        
        // Check reminder queue
        db.all("SELECT * FROM discord_reminder_queue ORDER BY created_at DESC", (err, reminders) => {
          if (err) {
            console.log('No discord_reminder_queue table found');
          } else {
            console.log(`\nDiscord reminder queue entries: ${reminders.length}`);
            reminders.forEach(reminder => {
              console.log(`- Match: ${reminder.match_id}, Status: ${reminder.status}, Reminder time: ${reminder.reminder_time}`);
            });
          }
          
          // Check match reminder queue
          db.all("SELECT * FROM discord_match_reminder_queue ORDER BY created_at DESC", (err, matchReminders) => {
            if (err) {
              console.log('No discord_match_reminder_queue table found');
            } else {
              console.log(`\nDiscord match reminder queue entries: ${matchReminders.length}`);
              matchReminders.forEach(reminder => {
                console.log(`- Match: ${reminder.match_id}, Status: ${reminder.status}, Created: ${reminder.created_at}`);
              });
            }
            
            db.close();
            resolve();
          });
        });
      });
    });
  });
}

checkReminders().catch(console.error);