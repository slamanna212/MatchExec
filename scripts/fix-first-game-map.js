const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(process.cwd(), 'app_data', 'data', 'matchexec.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

// Update the first game to have the correct map ID
db.run(`
  UPDATE match_games 
  SET map_id = 'spider-islands' 
  WHERE id = 'match_1755625723793_lekmf7z9c_game_1'
`, function(err) {
  if (err) {
    console.error('Error updating match game:', err);
  } else {
    console.log(`Updated ${this.changes} rows - set map_id to 'spider-islands' for first game`);
  }
  
  // Verify the update
  db.get(`
    SELECT mg.*, gm.name as map_name
    FROM match_games mg
    LEFT JOIN game_maps gm ON mg.map_id = gm.id AND gm.game_id = 'marvelrivals'
    WHERE mg.id = 'match_1755625723793_lekmf7z9c_game_1'
  `, (err, game) => {
    if (err) {
      console.error('Error verifying update:', err);
    } else {
      console.log('Verified first game:');
      console.log(`  Game: ${game.id}`);
      console.log(`  Map: ${game.map_id} (${game.map_name})`);
      console.log(`  Status: ${game.status}`);
    }
    
    db.close();
  });
});