const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function updateDiscordIds() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    // For existing records, if user_id looks like a Discord ID (all digits, 17-19 chars), 
    // copy it to discord_user_id
    db.run(`
      UPDATE match_participants 
      SET discord_user_id = user_id 
      WHERE discord_user_id IS NULL 
      AND user_id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]*'
      AND LENGTH(user_id) BETWEEN 17 AND 19
    `, function(err) {
      if (err) {
        reject(err);
      } else {
        console.log(`✅ Updated ${this.changes} participant records with Discord IDs`);
        
        // Show remaining records without Discord IDs
        db.all(`
          SELECT COUNT(*) as count 
          FROM match_participants 
          WHERE discord_user_id IS NULL
        `, (err, result) => {
          if (!err && result.length > 0) {
            console.log(`ℹ️ ${result[0].count} participant records still without Discord IDs`);
          }
          
          db.close();
          resolve(this.changes);
        });
      }
    });
  });
}

updateDiscordIds().catch(console.error);