const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'app_data', 'data', 'matchexec.db');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  
  console.log('🔧 Testing FIXED API query...');
  db.all(`
    SELECT DISTINCT
      MIN(gm.id) as id,
      gm.name,
      gm.image_url as imageUrl,
      gm.location,
      GROUP_CONCAT(DISTINCT gmo.name) as modeName,
      'Supports: ' || GROUP_CONCAT(DISTINCT gmo.name) as modeDescription,
      GROUP_CONCAT(DISTINCT gmo.name) as supportedModes
    FROM game_maps gm
    LEFT JOIN game_modes gmo ON gm.mode_id = gmo.id
    WHERE gm.game_id = ?
    GROUP BY gm.name, gm.image_url, gm.location
    ORDER BY gm.name ASC
  `, ['cs2'], (err, apiResult) => {
    if (err) {
      console.error('❌ API Query Error:', err);
      db.close();
      return;
    }
    
    console.log(`✅ API Query Success! Found ${apiResult.length} unique maps:`);
    apiResult.forEach(map => {
      console.log(`  - ${map.name}: [${map.supportedModes}]`);
      console.log(`    Image: ${map.imageUrl}`);
    });
    
    db.close();
  });
});