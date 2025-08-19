const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(process.cwd(), 'app_data', 'data', 'matchexec.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database at:', dbPath);
});

async function testNewScoring() {
  console.log('\n=== TESTING NEW SCORING SYSTEM ===\n');
  
  // 1. Get the active match
  console.log('1. Finding active match:');
  db.get(`
    SELECT id, name, maps, rounds, match_format, game_id 
    FROM matches 
    WHERE status = 'battle' 
    LIMIT 1
  `, async (err, match) => {
    if (err) {
      console.error('Error querying matches:', err);
      return;
    }
    
    if (!match) {
      console.log('No active matches found');
      db.close();
      return;
    }
    
    console.log(`  Match: ${match.name} (${match.id})`);
    console.log(`  Game: ${match.game_id}`);
    console.log(`  Maps: ${match.maps}`);
    
    // Parse maps
    const maps = JSON.parse(match.maps || '[]');
    console.log(`  Parsed maps (${maps.length}):`, maps);
    
    // 2. Initialize match games for all maps (simulate what happens on battle transition)
    console.log('\n2. Initializing match games for all maps:');
    
    for (let i = 0; i < maps.length; i++) {
      const mapId = maps[i];
      const gameId = `${match.id}_game_${i + 1}`;
      
      // Check if game already exists
      db.get('SELECT id FROM match_games WHERE id = ?', [gameId], (err, existing) => {
        if (err) {
          console.error('Error checking existing game:', err);
          return;
        }
        
        if (!existing) {
          // Create the match game
          db.run(`
            INSERT INTO match_games (
              id, match_id, round, participant1_id, participant2_id,
              map_id, status, created_at, updated_at
            ) VALUES (?, ?, ?, 'team1', 'team2', ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [gameId, match.id, i + 1, mapId], function(err) {
            if (err) {
              console.error('Error creating match game:', err);
            } else {
              console.log(`  ✓ Created game ${gameId} for map ${mapId}`);
            }
            
            // After processing all maps, show the results
            if (i === maps.length - 1) {
              setTimeout(() => {
                console.log('\n3. Verifying match games:');
                db.all(`
                  SELECT mg.*, gm.name as map_name
                  FROM match_games mg
                  LEFT JOIN game_maps gm ON mg.map_id = gm.id AND gm.game_id = ?
                  WHERE mg.match_id = ?
                  ORDER BY mg.round ASC
                `, [match.game_id, match.id], (err, games) => {
                  if (err) {
                    console.error('Error querying match games:', err);
                  } else {
                    console.log(`Found ${games.length} match games:`);
                    games.forEach((game, index) => {
                      console.log(`  ${index + 1}. Game: ${game.id}`);
                      console.log(`     Round: ${game.round}`);
                      console.log(`     Map: ${game.map_id} (${game.map_name || 'Name not found'})`);
                      console.log(`     Status: ${game.status}`);
                      console.log('');
                    });
                  }
                  
                  db.close();
                });
              }, 100);
            }
          });
        } else {
          console.log(`  - Game ${gameId} already exists`);
          
          // If this is the last map and we haven't created any new games, still show results
          if (i === maps.length - 1) {
            setTimeout(() => {
              console.log('\n3. Verifying existing match games:');
              db.all(`
                SELECT mg.*, gm.name as map_name
                FROM match_games mg
                LEFT JOIN game_maps gm ON mg.map_id = gm.id AND gm.game_id = ?
                WHERE mg.match_id = ?
                ORDER BY mg.round ASC
              `, [match.game_id, match.id], (err, games) => {
                if (err) {
                  console.error('Error querying match games:', err);
                } else {
                  console.log(`Found ${games.length} match games:`);
                  games.forEach((game, index) => {
                    console.log(`  ${index + 1}. Game: ${game.id}`);
                    console.log(`     Round: ${game.round}`);
                    console.log(`     Map: ${game.map_id} (${game.map_name || 'Name not found'})`);
                    console.log(`     Status: ${game.status}`);
                    console.log('');
                  });
                }
                
                db.close();
              });
            }, 100);
          }
        }
      });
    }
  });
}

testNewScoring();