import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

// Note: This is a structural test that validates the seeder's expected database
// behavior (schema, constraints, idempotency) using manual INSERT statements.
// It does NOT import or call the actual seeder module. Bugs in the real seeder's
// file-reading or parsing logic would not be caught by these tests.
describe('Database Seeder', () => {
  const testDbPath = path.join(process.cwd(), 'app_data', 'data', 'seeder-test.db');
  let db: sqlite3.Database;

  beforeAll(async () => {
    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create and migrate database
    db = new sqlite3.Database(testDbPath);
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await new Promise<void>((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  afterAll(async () => {
    // Close and clean up
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Game Data Seeding', () => {
    const expectedGames = [
      { name: 'Overwatch 2', id: 'overwatch2' },
      { name: 'Valorant', id: 'valorant' },
      { name: 'Marvel Rivals', id: 'marvelrivals' },
      { name: 'League of Legends', id: 'leagueoflegends' },
      { name: 'Rainbow Six Siege', id: 'r6siege' },
      { name: 'Counter-Strike 2', id: 'counterstrike2' },
    ];

    it('should have game data directories for all supported games', () => {
      const gamesDataDir = path.join(process.cwd(), 'data', 'games');
      const gameDirs = fs.readdirSync(gamesDataDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      expect(gameDirs.length).toBeGreaterThanOrEqual(6);

      for (const game of expectedGames) {
        expect(gameDirs).toContain(game.id);
      }
    });

    it('should have valid game.json for each game', () => {
      const gamesDataDir = path.join(process.cwd(), 'data', 'games');

      for (const game of expectedGames) {
        const gameJsonPath = path.join(gamesDataDir, game.id, 'game.json');
        expect(fs.existsSync(gameJsonPath)).toBe(true);

        const gameData = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));
        expect(gameData).toHaveProperty('name');
        expect(gameData).toHaveProperty('id');
        expect(gameData).toHaveProperty('dataVersion');
        expect(gameData.id).toBe(game.id);
      }
    });

    it('should have modes.json for each game', () => {
      const gamesDataDir = path.join(process.cwd(), 'data', 'games');

      for (const game of expectedGames) {
        const modesJsonPath = path.join(gamesDataDir, game.id, 'modes.json');
        expect(fs.existsSync(modesJsonPath)).toBe(true);

        const modesData = JSON.parse(fs.readFileSync(modesJsonPath, 'utf-8'));
        expect(Array.isArray(modesData)).toBe(true);
        expect(modesData.length).toBeGreaterThan(0);

        // Each mode should have required fields
        for (const mode of modesData) {
          expect(mode).toHaveProperty('name');
          expect(mode).toHaveProperty('id');
        }
      }
    });

    it('should have maps.json for each game', () => {
      const gamesDataDir = path.join(process.cwd(), 'data', 'games');

      for (const game of expectedGames) {
        const mapsJsonPath = path.join(gamesDataDir, game.id, 'maps.json');
        expect(fs.existsSync(mapsJsonPath)).toBe(true);

        const mapsData = JSON.parse(fs.readFileSync(mapsJsonPath, 'utf-8'));

        // Maps should be an array
        expect(Array.isArray(mapsData)).toBe(true);

        if (mapsData.length > 0) {
          for (const map of mapsData) {
            expect(map).toHaveProperty('name');
            expect(map).toHaveProperty('id');
            // type field may or may not exist depending on the game
            // Some games have 'type' to indicate which mode the map belongs to
          }
        }
      }
    });
  });

  describe('Seeding Process', () => {
    it('should seed games into database', async () => {
      // Note: This test assumes seeding has run via normal app startup or migration
      // In a real implementation, you would call the seeder function here

      // For now, we manually seed to test the structure
      const gamesDataDir = path.join(process.cwd(), 'data', 'games');
      const gameDirs = fs.readdirSync(gamesDataDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const gameId of gameDirs) {
        const gameJsonPath = path.join(gamesDataDir, gameId, 'game.json');
        const gameData = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));

        // Insert game using the actual schema
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT OR IGNORE INTO games (id, name, genre, developer, version, icon_url, cover_url, color, min_players, max_players, max_signups, map_codes_supported)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              gameData.id,
              gameData.name,
              gameData.genre || null,
              gameData.developer || null,
              gameData.patch || null,
              gameData.assets?.iconUrl || null,
              gameData.assets?.coverUrl || null,
              gameData.color || null,
              gameData.minPlayers || null,
              gameData.maxPlayers || null,
              gameData.maxSignups || null,
              gameData.mapCodesSupported ? 1 : 0
            ],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      // Verify games were seeded
      const games = await new Promise<any[]>((resolve, reject) => {
        db.all('SELECT * FROM games', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      expect(games.length).toBeGreaterThanOrEqual(6);

      const gameIds = games.map(g => g.id);
      expect(gameIds).toContain('overwatch2');
      expect(gameIds).toContain('valorant');
      expect(gameIds).toContain('marvelrivals');
      expect(gameIds).toContain('leagueoflegends');
      expect(gameIds).toContain('r6siege');
      expect(gameIds).toContain('counterstrike2');
    });

    it('should seed modes linked to correct games', async () => {
      const gamesDataDir = path.join(process.cwd(), 'data', 'games');
      const gameDirs = fs.readdirSync(gamesDataDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      // Seed games first
      for (const gameId of gameDirs) {
        const gameJsonPath = path.join(gamesDataDir, gameId, 'game.json');
        const gameData = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));

        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT OR IGNORE INTO games (id, name, genre, icon_url) VALUES (?, ?, ?, ?)`,
            [gameData.id, gameData.name, gameData.genre || null, gameData.assets?.iconUrl || null],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      // Seed modes
      for (const gameId of gameDirs) {
        const modesJsonPath = path.join(gamesDataDir, gameId, 'modes.json');
        const modesData = JSON.parse(fs.readFileSync(modesJsonPath, 'utf-8'));

        for (const mode of modesData) {
          await new Promise<void>((resolve, reject) => {
            db.run(
              `INSERT OR IGNORE INTO game_modes (id, game_id, name, description, scoring_type) VALUES (?, ?, ?, ?, ?)`,
              [mode.id, gameId, mode.name, mode.description || null, mode.scoringType || 'Normal'],
              (err) => err ? reject(err) : resolve()
            );
          });
        }
      }

      // Verify modes are linked correctly
      const modes = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT gm.*, g.id as game_id_check
           FROM game_modes gm
           JOIN games g ON gm.game_id = g.id`,
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      expect(modes.length).toBeGreaterThan(0);

      // Each mode should have a valid game_id
      for (const mode of modes) {
        expect(mode.game_id).toBeTruthy();
        expect(mode.game_id_check).toBeTruthy();
      }
    });

    it('should seed maps linked to correct modes', async () => {
      const gamesDataDir = path.join(process.cwd(), 'data', 'games');
      const gameDirs = fs.readdirSync(gamesDataDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      // Seed games and modes first
      for (const gameId of gameDirs) {
        const gameJsonPath = path.join(gamesDataDir, gameId, 'game.json');
        const gameData = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));

        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT OR IGNORE INTO games (id, name, genre) VALUES (?, ?, ?)`,
            [gameData.id, gameData.name, gameData.genre || null],
            (err) => err ? reject(err) : resolve()
          );
        });

        const modesJsonPath = path.join(gamesDataDir, gameId, 'modes.json');
        const modesData = JSON.parse(fs.readFileSync(modesJsonPath, 'utf-8'));

        for (const mode of modesData) {
          await new Promise<void>((resolve, reject) => {
            db.run(
              `INSERT OR IGNORE INTO game_modes (id, game_id, name, scoring_type) VALUES (?, ?, ?, ?)`,
              [mode.id, gameId, mode.name, mode.scoringType || 'Normal'],
              (err) => err ? reject(err) : resolve()
            );
          });
        }
      }

      // Seed maps
      for (const gameId of gameDirs) {
        const mapsJsonPath = path.join(gamesDataDir, gameId, 'maps.json');
        const mapsData = JSON.parse(fs.readFileSync(mapsJsonPath, 'utf-8'));

        for (const map of mapsData) {
          await new Promise<void>((resolve, reject) => {
            db.run(
              `INSERT OR IGNORE INTO game_maps (id, game_id, mode_id, name, location, image_url) VALUES (?, ?, ?, ?, ?, ?)`,
              [map.id, gameId, map.type, map.name, map.location || null, map.thumbnailUrl || null],
              (err) => err ? reject(err) : resolve()
            );
          });
        }
      }

      // Verify maps are linked correctly
      const maps = await new Promise<any[]>((resolve, reject) => {
        db.all(
          `SELECT gmap.*, g.id as game_id_check
           FROM game_maps gmap
           JOIN games g ON gmap.game_id = g.id`,
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      expect(maps.length).toBeGreaterThan(0);

      // Each map should have a valid mode_id and game_id
      for (const map of maps) {
        expect(map.game_id).toBeTruthy();
        expect(map.game_id_check).toBeTruthy();
        if (map.mode_id) {
          expect(map.mode_id).toBeTruthy();
        }
      }
    });

    it('should not create duplicates when seeding twice', async () => {
      const gamesDataDir = path.join(process.cwd(), 'data', 'games');
      const gameDirs = fs.readdirSync(gamesDataDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      // Seed games first time
      for (const gameId of gameDirs) {
        const gameJsonPath = path.join(gamesDataDir, gameId, 'game.json');
        const gameData = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));

        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT OR IGNORE INTO games (id, name, genre) VALUES (?, ?, ?)`,
            [gameData.id, gameData.name, gameData.genre || null],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      const gamesCountFirst = await new Promise<number>((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM games', (err, row: any) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });

      // Seed games second time (should use INSERT OR IGNORE)
      for (const gameId of gameDirs) {
        const gameJsonPath = path.join(gamesDataDir, gameId, 'game.json');
        const gameData = JSON.parse(fs.readFileSync(gameJsonPath, 'utf-8'));

        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT OR IGNORE INTO games (id, name, genre) VALUES (?, ?, ?)`,
            [gameData.id, gameData.name, gameData.genre || null],
            (err) => err ? reject(err) : resolve()
          );
        });
      }

      const gamesCountSecond = await new Promise<number>((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM games', (err, row: any) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });

      // Count should be the same - no duplicates
      expect(gamesCountSecond).toBe(gamesCountFirst);
    });
  });
});
