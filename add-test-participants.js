const sqlite3 = require('sqlite3').verbose();
const { randomUUID } = require('crypto');

const dbPath = './app_data/data/matchexec.db';

// Sample usernames for randomization
const adjectives = ['Swift', 'Shadow', 'Fire', 'Ice', 'Thunder', 'Steel', 'Mystic', 'Phantom', 'Cyber', 'Neon', 'Viper', 'Phoenix', 'Storm', 'Blade', 'Frost', 'Crimson', 'Ghost', 'Titan', 'Sonic', 'Alpha'];
const nouns = ['Hunter', 'Warrior', 'Striker', 'Guardian', 'Sniper', 'Assassin', 'Wizard', 'Knight', 'Ranger', 'Demon', 'Dragon', 'Wolf', 'Eagle', 'Lion', 'Tiger', 'Shark', 'Falcon', 'Venom', 'Beast', 'Reaper'];

function generateRandomUsername() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 999) + 1;
  return `${adj}${noun}${num}`;
}

function generateRandomDiscordId() {
  // Generate a realistic Discord ID (18 digits)
  return Math.floor(Math.random() * (999999999999999999 - 100000000000000000) + 100000000000000000).toString();
}

async function addTestParticipants() {
  const db = new sqlite3.Database(dbPath);

  try {
    // Get the tournament in gather stage
    const tournament = await new Promise((resolve, reject) => {
      db.get('SELECT id, name FROM tournaments WHERE status = "gather" LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!tournament) {
      console.log('No tournament in gather stage found in database');
      return;
    }

    console.log(`Adding test participants to tournament: ${tournament.name} (${tournament.id})`);

    // Generate 39 test participants
    const participants = [];
    for (let i = 0; i < 39; i++) {
      participants.push({
        id: randomUUID(),
        tournament_id: tournament.id,
        user_id: randomUUID(),
        discord_user_id: generateRandomDiscordId(),
        username: generateRandomUsername(),
        signup_data: JSON.stringify({
          experience: ['Beginner', 'Intermediate', 'Advanced', 'Expert'][Math.floor(Math.random() * 4)],
          preferred_role: ['Tank', 'DPS', 'Support', 'Flex'][Math.floor(Math.random() * 4)],
          availability: 'Available'
        }),
        team_assignment: null // This keeps them in reserves
      });
    }

    // Insert all participants
    const stmt = db.prepare(`
      INSERT INTO tournament_participants
      (id, tournament_id, user_id, discord_user_id, username, signup_data, team_assignment)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const participant of participants) {
      await new Promise((resolve, reject) => {
        stmt.run([
          participant.id,
          participant.tournament_id,
          participant.user_id,
          participant.discord_user_id,
          participant.username,
          participant.signup_data,
          participant.team_assignment
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    stmt.finalize();
    console.log(`Successfully added ${participants.length} test participants to tournament reserves`);

    // Show current participant count
    const count = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = ?',
        [tournament.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });

    console.log(`Total participants in tournament: ${count}`);

  } catch (error) {
    console.error('Error adding test participants:', error);
  } finally {
    db.close();
  }
}

addTestParticipants();