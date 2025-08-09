const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function checkDiscordMessages() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    console.log('=== Discord Match Messages ===');
    
    db.all(`
      SELECT * FROM discord_match_messages 
      ORDER BY created_at DESC 
      LIMIT 5
    `, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (rows.length === 0) {
        console.log('No Discord messages found');
      } else {
        console.log('Found', rows.length, 'Discord messages:');
        rows.forEach(row => {
          console.log(`ID: ${row.id}`);
          console.log(`Match ID: ${row.match_id}`);
          console.log(`Message ID: ${row.message_id}`);
          console.log(`Channel ID: ${row.channel_id}`);
          console.log(`Thread ID: ${row.thread_id || 'None'}`);
          console.log(`Discord Event ID: ${row.discord_event_id || 'None'}`);
          console.log(`Message Type: ${row.message_type || 'Unknown'}`);
          console.log(`Created: ${row.created_at}`);
          console.log('---');
        });
      }
      
      db.close();
      resolve();
    });
  });
}

checkDiscordMessages().catch(console.error);