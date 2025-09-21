const sqlite3 = require('sqlite3').verbose();

const dbPath = './app_data/data/matchexec.db';

async function checkTournaments() {
  const db = new sqlite3.Database(dbPath);

  try {
    // Get all tournaments
    const tournaments = await new Promise((resolve, reject) => {
      db.all('SELECT id, name, status FROM tournaments', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (tournaments.length === 0) {
      console.log('No tournaments found in database');
      return;
    }

    console.log('Current tournaments:');

    // Get participant count for each tournament
    for (let i = 0; i < tournaments.length; i++) {
      const tournament = tournaments[i];
      const participantCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = ?', [tournament.id], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });

      console.log(`${i + 1}. ID: ${tournament.id}, Name: ${tournament.name}, Status: ${tournament.status}, Participants: ${participantCount}`);
    }

  } catch (error) {
    console.error('Error checking tournaments:', error);
  } finally {
    db.close();
  }
}

checkTournaments();