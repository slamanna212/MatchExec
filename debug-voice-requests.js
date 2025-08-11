const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'app_data/data/matchexec.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Checking database tables...\n');

// First check what tables exist
db.all(`
  SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
`, (err, tables) => {
  if (err) {
    console.error('Error querying tables:', err);
    process.exit(1);
  }

  console.log('Available tables:');
  tables.forEach(table => console.log(`  - ${table.name}`));
  console.log('');

  // Now check for voice test requests if the table exists
  const hasDiscordBotRequests = tables.some(t => t.name === 'discord_bot_requests');
  
  if (!hasDiscordBotRequests) {
    console.log('❌ discord_bot_requests table does not exist');
    console.log('This means the voice test system is not properly set up.');
    db.close();
    return;
  }

  db.all(`
    SELECT id, data, status, created_at, updated_at 
    FROM discord_bot_requests 
    WHERE type = 'voice_test' 
    ORDER BY created_at DESC 
    LIMIT 10
  `, (err, rows) => {
    if (err) {
      console.error('Error querying voice requests:', err);
      process.exit(1);
    }

    if (rows.length === 0) {
      console.log('No voice test requests found.');
    } else {
      console.log(`Found ${rows.length} recent voice test requests:\n`);
      rows.forEach((row, index) => {
        const data = JSON.parse(row.data);
        console.log(`${index + 1}. Request ID: ${row.id}`);
        console.log(`   User ID: ${data.userId}`);
        console.log(`   Voice ID: ${data.voiceId || 'default'}`);
        console.log(`   Status: ${row.status}`);
        console.log(`   Created: ${row.created_at}`);
        console.log(`   Updated: ${row.updated_at}`);
        console.log('');
      });
    }

    db.close();
  });
});