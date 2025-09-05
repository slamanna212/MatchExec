const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');

console.log('Checking database at:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('✅ Connected to SQLite database');
  
  // Check games table
  db.all('SELECT id, name FROM games', (err, games) => {
    if (err) {
      console.error('Error fetching games:', err);
      return;
    }
    
    console.log('\n🎮 Games in database:');
    games.forEach(game => {
      console.log(`  - ${game.id}: ${game.name}`);
    });
    
    // Check CS2 specifically
    const cs2Id = 'cs2';
    console.log(`\n🔍 Checking CS2 data for game ID: ${cs2Id}`);
    
    // Check game modes for CS2
    db.all('SELECT id, name FROM game_modes WHERE game_id = ?', [cs2Id], (err, modes) => {
      if (err) {
        console.error('Error fetching CS2 modes:', err);
        return;
      }
      
      console.log(`\n🎯 CS2 Game Modes (${modes.length}):`);
      modes.forEach(mode => {
        console.log(`  - ${mode.id}: ${mode.name}`);
      });
      
      // Check game maps for CS2
      db.all(`
        SELECT 
          gm.id,
          gm.name,
          gm.mode_id,
          gm.image_url,
          gm.location,
          gmo.name as mode_name
        FROM game_maps gm
        LEFT JOIN game_modes gmo ON gm.mode_id = gmo.id
        WHERE gm.game_id = ?
        ORDER BY gm.name, gm.mode_id
      `, [cs2Id], (err, maps) => {
        if (err) {
          console.error('Error fetching CS2 maps:', err);
          return;
        }
        
        console.log(`\n🗺️  CS2 Game Maps (${maps.length} entries):`);
        
        // Group by map name to see how many modes each map has
        const mapGroups = {};
        maps.forEach(map => {
          if (!mapGroups[map.name]) {
            mapGroups[map.name] = {
              name: map.name,
              location: map.location,
              imageUrl: map.image_url,
              modes: []
            };
          }
          mapGroups[map.name].modes.push({
            id: map.mode_id,
            name: map.mode_name
          });
        });
        
        Object.values(mapGroups).forEach(mapGroup => {
          const modeNames = mapGroup.modes.map(m => m.name).join(', ');
          console.log(`  - ${mapGroup.name} (${mapGroup.location})`);
          console.log(`    Modes: ${modeNames}`);
          console.log(`    Image: ${mapGroup.imageUrl}`);
          console.log('');
        });
        
        // Test the actual query used in the API
        console.log('🔧 Testing API query...');
        db.all(`
          SELECT DISTINCT
            MIN(gm.id) as id,
            gm.name,
            gm.image_url as imageUrl,
            gm.location,
            GROUP_CONCAT(DISTINCT gmo.name, ', ') as modeName,
            'Supports: ' || GROUP_CONCAT(DISTINCT gmo.name, ', ') as modeDescription,
            GROUP_CONCAT(DISTINCT gmo.name, ',') as supportedModes
          FROM game_maps gm
          LEFT JOIN game_modes gmo ON gm.mode_id = gmo.id
          WHERE gm.game_id = ?
          GROUP BY gm.name, gm.image_url, gm.location
          ORDER BY gm.name ASC
        `, [cs2Id], (err, apiResult) => {
          if (err) {
            console.error('❌ API Query Error:', err);
            db.close();
            return;
          }
          
          console.log(`✅ API Query Success! Found ${apiResult.length} unique maps:`);
          apiResult.slice(0, 3).forEach(map => {
            console.log(`  - ${map.name}: ${map.supportedModes}`);
            console.log(`    Image: ${map.imageUrl}`);
          });
          
          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err);
            } else {
              console.log('\n✅ Database connection closed');
            }
          });
        });
      });
    });
  });
});