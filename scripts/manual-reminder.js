const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function manualReminder() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    // Get the match that's starting soon
    db.get(`
      SELECT id, name, start_date, status 
      FROM matches 
      WHERE start_date IS NOT NULL 
      AND datetime(start_date) > datetime('now')
      ORDER BY start_date ASC
      LIMIT 1
    `, (err, match) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!match) {
        console.log('No upcoming matches found');
        db.close();
        resolve();
        return;
      }
      
      console.log(`Found upcoming match: ${match.name} at ${match.start_date}`);
      
      // Manually queue this match for Discord reminder
      const reminderId = `manual_reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      db.run(`
        INSERT INTO discord_match_reminder_queue (id, match_id, status)
        VALUES (?, ?, 'pending')
      `, [reminderId, match.id], function(err) {
        if (err) {
          reject(err);
        } else {
          console.log(`✅ Manually queued reminder for match: ${match.name}`);
          db.close();
          resolve();
        }
      });
    });
  });
}

manualReminder().catch(console.error);