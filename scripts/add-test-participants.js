import pg from 'pg';
import { randomUUID } from 'crypto';

// Dev helper: connects to Postgres through DATABASE_URL (defaults to the compose.dev.yml database).
const connectionString = process.env.DATABASE_URL || 'postgres://matchexec:matchexec@127.0.0.1:5432/matchexec';

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
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // Get the tournament in gather stage
    const { rows: [tournament] } = await client.query("SELECT id, name FROM tournaments WHERE status = 'gather' ORDER BY created_at LIMIT 1");

    if (!tournament) {
      console.log('No tournament in gather stage found in database');
      return;
    }

    console.log(`Adding test participants to tournament: ${tournament.name} (${tournament.id})`);

    // Generate 39 test participants (team_assignment stays NULL, which keeps them in reserves)
    for (let i = 0; i < 39; i++) {
      await client.query(
        `INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username, signup_data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          tournament.id,
          randomUUID(),
          generateRandomDiscordId(),
          generateRandomUsername(),
          JSON.stringify({
            experience: ['Beginner', 'Intermediate', 'Advanced', 'Expert'][Math.floor(Math.random() * 4)],
            preferred_role: ['Tank', 'DPS', 'Support', 'Flex'][Math.floor(Math.random() * 4)],
            availability: 'Available'
          }),
        ]
      );
    }
    console.log('Successfully added 39 test participants to tournament reserves');

    const { rows: [{ count }] } = await client.query('SELECT COUNT(*)::int AS count FROM tournament_participants WHERE tournament_id = $1', [tournament.id]);
    console.log(`Total participants in tournament: ${count}`);
  } catch (error) {
    console.error('Error adding test participants:', error);
  } finally {
    await client.end();
  }
}

addTestParticipants();
