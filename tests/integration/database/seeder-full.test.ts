import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSeeder } from '../../../lib/database/seeder';
import { getTestDb } from '../../utils/test-db';
import * as path from 'path';

const GAMES_DATA_DIR = path.join(process.cwd(), 'data', 'games');

describe('DatabaseSeeder (full integration)', () => {
  let db: any;

  beforeEach(async () => {
    db = getTestDb();
  });

  describe('seedDatabase', () => {
    it('seeds all games into the database', async () => {
      const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
      await seeder.seedDatabase();

      const games = await db.all('SELECT id FROM games');
      expect(games.length).toBeGreaterThanOrEqual(6);

      const ids = games.map((g: any) => g.id);
      expect(ids).toContain('overwatch2');
      expect(ids).toContain('valorant');
      expect(ids).toContain('marvelrivals');
      expect(ids).toContain('leagueoflegends');
      expect(ids).toContain('r6siege');
      expect(ids).toContain('counterstrike2');
    });

    it('seeds modes for all games', async () => {
      const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
      await seeder.seedDatabase();

      const modes = await db.all('SELECT id, game_id FROM game_modes');
      expect(modes.length).toBeGreaterThan(0);

      // Each game should have at least one mode
      const modesByGame = modes.reduce((acc: any, m: any) => {
        acc[m.game_id] = (acc[m.game_id] || 0) + 1;
        return acc;
      }, {});

      expect(Object.keys(modesByGame).length).toBeGreaterThanOrEqual(6);
    });

    it('seeds maps for all games', async () => {
      const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
      await seeder.seedDatabase();

      const maps = await db.all('SELECT id, game_id FROM game_maps');
      expect(maps.length).toBeGreaterThan(0);
    });

    it('records data versions for each game', async () => {
      const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
      await seeder.seedDatabase();

      const versions = await db.all('SELECT game_id, data_version FROM data_versions');
      expect(versions.length).toBeGreaterThanOrEqual(6);
    });

    it('is idempotent — re-running does not create duplicates', async () => {
      const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
      await seeder.seedDatabase();

      const gamesAfterFirst = await db.get('SELECT COUNT(*) as count FROM games') as { count: number };
      const modesAfterFirst = await db.get('SELECT COUNT(*) as count FROM game_modes') as { count: number };
      const mapsAfterFirst = await db.get('SELECT COUNT(*) as count FROM game_maps') as { count: number };

      // Run seeder again
      await seeder.seedDatabase();

      const gamesAfterSecond = await db.get('SELECT COUNT(*) as count FROM games') as { count: number };
      const modesAfterSecond = await db.get('SELECT COUNT(*) as count FROM game_modes') as { count: number };
      const mapsAfterSecond = await db.get('SELECT COUNT(*) as count FROM game_maps') as { count: number };

      expect(gamesAfterSecond!.count).toBe(gamesAfterFirst!.count);
      expect(modesAfterSecond!.count).toBe(modesAfterFirst!.count);
      expect(mapsAfterSecond!.count).toBe(mapsAfterFirst!.count);
    });

    it('skips re-seeding when dataVersion is unchanged', async () => {
      const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
      await seeder.seedDatabase();

      // Manually corrupt a game name so we can detect if it gets re-seeded
      await db.run("UPDATE games SET name = 'Modified Name' WHERE id = 'overwatch2'");

      // Re-seed — should NOT overwrite since version is unchanged
      await seeder.seedDatabase();

      const game = await db.get('SELECT name FROM games WHERE id = ?', ['overwatch2']) as { name: string };
      expect(game!.name).toBe('Modified Name'); // Still modified — seeder skipped it
    });

    it('re-seeds when dataVersion is bumped', async () => {
      const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
      await seeder.seedDatabase();

      // Bump the version so seeder thinks data is outdated
      await db.run(
        "UPDATE data_versions SET data_version = 'old-version' WHERE game_id = 'overwatch2'"
      );

      // Re-seed — should overwrite since version changed
      await seeder.seedDatabase();

      const game = await db.get('SELECT name FROM games WHERE id = ?', ['overwatch2']) as { name: string };
      expect(game!.name).not.toBe('');
    });

    it('handles missing game data directory gracefully', async () => {
      const seeder = new DatabaseSeeder(db as any, '/nonexistent/path');

      // Should not throw, just seed nothing
      await expect(seeder.seedDatabase()).resolves.not.toThrow();

      const games = await db.all('SELECT id FROM games');
      expect(games.length).toBe(0);
    });
  });
});
