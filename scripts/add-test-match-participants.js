import sqlite3 from 'sqlite3';
import { randomUUID } from 'crypto';

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

async function addTestMatchParticipants() {
  const db = new sqlite3.Database(dbPath);

  try {
    // Get the match in gather stage
    const match = await new Promise((resolve, reject) => {
      db.get('SELECT id, name FROM matches WHERE status = "gather" ORDER BY id DESC LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!match) {
      console.log('No match in gather stage found in database');
      return;
    }

    console.log(`Adding test participants to match: ${match.name} (${match.id})`);

    // Generate 10 test participants
    const participants = [];
    for (let i = 0; i < 10; i++) {
      participants.push({
        id: randomUUID(),
        match_id: match.id,
        user_id: randomUUID(),
        discord_user_id: generateRandomDiscordId(),
        username: generateRandomUsername(),
        team_assignment: null // No team assignment yet
      });
    }

    // Insert all participants
    const stmt = db.prepare(`
      INSERT INTO match_participants
      (id, match_id, user_id, discord_user_id, username, team_assignment)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const participant of participants) {
      await new Promise((resolve, reject) => {
        stmt.run([
          participant.id,
          participant.match_id,
          participant.user_id,
          participant.discord_user_id,
          participant.username,
          participant.team_assignment
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    stmt.finalize();
    console.log(`Successfully added ${participants.length} test participants to match`);

    // Show current participant count
    const count = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?',
        [match.id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });

    console.log(`Total participants in match: ${count}`);

  } catch (error) {
    console.error('Error adding test participants:', error);
  } finally {
    db.close();
  }
}

addTestMatchParticipants();
