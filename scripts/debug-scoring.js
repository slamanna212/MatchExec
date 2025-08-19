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

async function debugScoring() {
  console.log('\n=== DEBUGGING SCORING ISSUES ===\n');
  
  // 1. Check active matches and their maps
  console.log('1. Active matches with maps configuration:');
  db.all(`
    SELECT id, name, maps, rounds, match_format, game_id 
    FROM matches 
    WHERE status = 'battle' 
    ORDER BY created_at DESC 
    LIMIT 5
  `, (err, matches) => {
    if (err) {
      console.error('Error querying matches:', err);
      return;
    }
    
    console.log(`Found ${matches.length} active matches:`);
    matches.forEach((match, index) => {
      console.log(`  ${index + 1}. Match: ${match.name}`);
      console.log(`     ID: ${match.id}`);
      console.log(`     Game: ${match.game_id}`);
      console.log(`     Format: ${match.match_format}`);
      console.log(`     Maps (JSON): ${match.maps}`);
      console.log(`     Rounds field: ${match.rounds}`);
      
      // Parse maps JSON if it exists
      if (match.maps) {
        try {
          const mapsArray = JSON.parse(match.maps);
          console.log(`     Parsed maps (${mapsArray.length}): ${mapsArray.join(', ')}`);
        } catch (parseErr) {
          console.log(`     Maps parsing error: ${parseErr.message}`);
        }
      }
      console.log('');
    });
    
    // 2. Check match_games for scoring entries
    console.log('\n2. Match games and scoring data:');
    db.all(`
      SELECT mg.id, mg.match_id, mg.status, mg.score_data, mg.winner_id,
             m.name as match_name
      FROM match_games mg
      JOIN matches m ON mg.match_id = m.id
      WHERE m.status = 'battle'
      ORDER BY mg.created_at DESC
      LIMIT 10
    `, (err, games) => {
      if (err) {
        console.error('Error querying match games:', err);
        return;
      }
      
      console.log(`Found ${games.length} match games:`);
      games.forEach((game, index) => {
        console.log(`  ${index + 1}. Game ID: ${game.id}`);
        console.log(`     Match: ${game.match_name} (${game.match_id})`);
        console.log(`     Status: ${game.status}`);
        console.log(`     Winner: ${game.winner_id || 'None'}`);
        console.log(`     Score data: ${game.score_data ? 'Present' : 'None'}`);
        
        if (game.score_data) {
          try {
            const scoreData = JSON.parse(game.score_data);
            console.log(`     Parsed score:`, scoreData);
          } catch (parseErr) {
            console.log(`     Score parsing error: ${parseErr.message}`);
          }
        }
        console.log('');
      });
      
      // 3. Check game configuration files
      console.log('\n3. Checking Overwatch 2 mode configuration:');
      const fs = require('fs');
      const modesPath = path.join(process.cwd(), 'data', 'games', 'overwatch2', 'modes.json');
      
      try {
        const modesData = JSON.parse(fs.readFileSync(modesPath, 'utf8'));
        const controlMode = modesData.find(mode => mode.id === 'control');
        
        if (controlMode) {
          console.log('Control mode configuration:');
          console.log('  Scoring type:', controlMode.scoringType);
          console.log('  Format variants:');
          Object.entries(controlMode.formatVariants).forEach(([format, config]) => {
            console.log(`    ${format}:`, config);
          });
        } else {
          console.log('Control mode not found in configuration');
        }
      } catch (err) {
        console.log('Error reading modes configuration:', err.message);
      }
      
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('\nDatabase connection closed.');
        }
      });
    });
  });
}

debugScoring();