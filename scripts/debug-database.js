const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(process.cwd(), 'app_data/data/matchexec.db');

console.log('Connecting to database at:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

async function debugDatabase() {
  try {
    // Check match_games table schema
    console.log('\n=== MATCH_GAMES TABLE SCHEMA ===');
    await new Promise((resolve, reject) => {
      db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='match_games'", (err, rows) => {
        if (err) reject(err);
        else {
          if (rows.length > 0) {
            console.log(rows[0].sql);
          } else {
            console.log('match_games table does not exist');
          }
          resolve();
        }
      });
    });

    // Check existing match_games entries
    console.log('\n=== EXISTING MATCH_GAMES ENTRIES ===');
    await new Promise((resolve, reject) => {
      db.all("SELECT * FROM match_games", (err, rows) => {
        if (err) reject(err);
        else {
          console.log(`Found ${rows.length} entries:`);
          rows.forEach(row => {
            console.log(`- ID: ${row.id}, Match: ${row.match_id}, Status: ${row.status}`);
          });
          resolve();
        }
      });
    });

    // Test the specific query that's hanging
    const testGameId = 'match_1755565888137_xvkibtw10_game_1';
    console.log(`\n=== TESTING QUERY FOR: ${testGameId} ===`);
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('Query timeout after 3 seconds');
        reject(new Error('Timeout'));
      }, 3000);

      db.get("SELECT id FROM match_games WHERE id = ?", [testGameId], (err, row) => {
        clearTimeout(timeout);
        if (err) {
          console.error('Query error:', err);
          reject(err);
        } else {
          console.log('Query result:', !!row ? 'Found' : 'Not found');
          if (row) {
            console.log('Row data:', row);
          }
          resolve();
        }
      });
    });

    // Check if there are any locks or transactions
    console.log('\n=== CHECKING FOR LOCKS ===');
    await new Promise((resolve, reject) => {
      db.all("PRAGMA locking_mode", (err, rows) => {
        if (err) reject(err);
        else {
          console.log('Locking mode:', rows);
          resolve();
        }
      });
    });

    await new Promise((resolve, reject) => {
      db.all("PRAGMA journal_mode", (err, rows) => {
        if (err) reject(err);
        else {
          console.log('Journal mode:', rows);
          resolve();
        }
      });
    });

  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('\nDatabase connection closed');
      }
      process.exit(0);
    });
  }
}

debugDatabase();