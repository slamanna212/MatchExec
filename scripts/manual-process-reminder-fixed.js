const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function processReminder() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    console.log('=== Processing Due Reminders (Fixed) ===');
    
    // Get reminders that are due - fix the datetime comparison
    db.all(`
      SELECT drq.id, drq.match_id, drq.reminder_time
      FROM discord_reminder_queue drq
      WHERE drq.status = 'pending'
      AND datetime(drq.reminder_time) <= datetime('now')
      LIMIT 5
    `, (err, dueReminders) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log(`Found ${dueReminders.length} due reminders`);
      
      if (dueReminders.length === 0) {
        db.close();
        resolve();
        return;
      }
      
      // Process each reminder
      let processed = 0;
      
      dueReminders.forEach(reminder => {
        console.log(`Processing reminder ${reminder.id} for match ${reminder.match_id}`);
        
        // Generate unique ID for the Discord bot queue entry
        const reminderId = `discord_reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Add to Discord reminder queue that the bot will process
        db.run(`
          INSERT INTO discord_match_reminder_queue (id, match_id, status)
          VALUES (?, ?, 'pending')
        `, [reminderId, reminder.match_id], function(err) {
          if (err) {
            console.error(`Error queuing Discord reminder for ${reminder.id}:`, err);
            processed++;
            if (processed === dueReminders.length) {
              db.close();
              resolve();
            }
          } else {
            console.log(`✅ Queued Discord reminder for match: ${reminder.match_id}`);
            
            // Mark scheduler reminder as sent
            db.run(`
              UPDATE discord_reminder_queue 
              SET status = 'sent', sent_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [reminder.id], (err) => {
              if (err) {
                console.error(`Error updating reminder status for ${reminder.id}:`, err);
              } else {
                console.log(`✅ Updated scheduler reminder status for: ${reminder.id}`);
              }
              
              processed++;
              if (processed === dueReminders.length) {
                db.close();
                resolve();
              }
            });
          }
        });
      });
    });
  });
}

processReminder().catch(console.error);