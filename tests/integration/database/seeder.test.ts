import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Database } from '../../../lib/database/connection';

// Note: This is a structural test that validates the seeder's expected database
// behavior (schema, constraints, idempotency) using manual INSERT statements.
// It does NOT import or call the actual seeder module. Bugs in the real seeder's
// file-reading or parsing logic would not be caught by these tests.
describe('Database Seeder', () => {
  const testDbPath = path.join(process.cwd(), 'app_data', 'data', 'seeder-test.db');
  let db: Database;

  beforeAll(async () => {
    // Clean up
    for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    // Ensure directory exists
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Create and migrate database
    db = new Database(testDbPath);
    await db.connect();

    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }
  });

  afterAll(async () => {
    await db.close();

    for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch { }
      }
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

    // Note: Actual seeder module behavior is tested in seeder-full.test.ts
  });

  // Removed: "Seeding Process" tests that manually ran INSERT OR IGNORE
  // statements testing SQLite behavior rather than the actual DatabaseSeeder.
  // See seeder-full.test.ts for real seeder integration tests.
});
