const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

async function checkSchema() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');
  
  console.log(`Checking database at: ${dbPath}`);
  console.log(`Database exists: ${fs.existsSync(dbPath)}`);
  
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    // First check if table exists
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='match_participants'", (err, tables) => {
      if (err) {
        reject(err);
        return;
      }
      
      console.log(`match_participants table exists: ${tables.length > 0}`);
      
      if (tables.length === 0) {
        // Let's see what tables exist
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, allTables) => {
          console.log('Existing tables:', allTables.map(t => t.name));
          db.close();
          resolve(false);
        });
        return;
      }
      
      // Now check schema
      db.all("PRAGMA table_info(match_participants)", (err, rows) => {
        if (err) {
          reject(err);
        } else {
          console.log('match_participants table schema:');
          rows.forEach(row => {
            console.log(`- ${row.name} (${row.type})`);
          });
          
          // Check if discord_user_id exists
          const hasDiscordUserId = rows.some(col => col.name === 'discord_user_id');
          console.log(`\nhas discord_user_id column: ${hasDiscordUserId}`);
          
          db.close();
          resolve(hasDiscordUserId);
        }
      });
    });
  });
}

checkSchema().catch(console.error);