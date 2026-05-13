import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DatabaseSeeder } from '../../../lib/database/seeder';
import { getTestDb } from '../../utils/test-db';

const GAMES_DATA_DIR = path.join(process.cwd(), 'data', 'games');

interface GameJson {
  id: string;
  name: string;
  dataVersion: string;
}

interface ModeJson {
  id: string;
  name: string;
}

interface MapJson {
  id: string;
  name: string;
  type?: string;
}

function loadGameData(gameDir: string) {
  const gameJson = JSON.parse(fs.readFileSync(path.join(GAMES_DATA_DIR, gameDir, 'game.json'), 'utf-8')) as GameJson;
  const modesJson = JSON.parse(fs.readFileSync(path.join(GAMES_DATA_DIR, gameDir, 'modes.json'), 'utf-8')) as ModeJson[];
  const mapsJson = JSON.parse(fs.readFileSync(path.join(GAMES_DATA_DIR, gameDir, 'maps.json'), 'utf-8')) as MapJson[];
  return { gameJson, modesJson, mapsJson };
}

function getGameDirs(): string[] {
  return fs.readdirSync(GAMES_DATA_DIR)
    .filter(d => fs.existsSync(path.join(GAMES_DATA_DIR, d, 'game.json')));
}

describe('DatabaseSeeder — data integrity', () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
    await seeder.seedDatabase();
  });

  describe('per-game data version matches game.json', () => {
    const gameDirs = getGameDirs();

    for (const dir of gameDirs) {
      it(`${dir}: data_versions row matches game.json dataVersion`, async () => {
        const { gameJson } = loadGameData(dir);
        const row = await getTestDb().get(
          `SELECT data_version FROM data_versions WHERE game_id = ?`,
          [gameJson.id]
        ) as { data_version: string } | null;
        expect(row).toBeDefined();
        expect(row!.data_version).toBe(gameJson.dataVersion);
      });
    }
  });

  describe('modes are linked to the correct game', () => {
    it('every game_mode row has a game_id that exists in the games table', async () => {
      const orphanModes = await db.all(
        `SELECT gm.id, gm.game_id FROM game_modes gm
         LEFT JOIN games g ON g.id = gm.game_id
         WHERE g.id IS NULL`
      ) as Array<{ id: string; game_id: string }>;
      expect(orphanModes).toHaveLength(0);
    });

    it('overwatch2 has all expected modes seeded', async () => {
      const { modesJson } = loadGameData('overwatch2');
      const seededModes = await db.all(
        `SELECT id FROM game_modes WHERE game_id = 'overwatch2'`
      ) as Array<{ id: string }>;
      const seededIds = seededModes.map(m => m.id);
      for (const mode of modesJson) {
        expect(seededIds).toContain(mode.id);
      }
    });

    it('valorant has all expected modes seeded', async () => {
      const { modesJson } = loadGameData('valorant');
      const seededModes = await db.all(
        `SELECT id FROM game_modes WHERE game_id = 'valorant'`
      ) as Array<{ id: string }>;
      const seededIds = seededModes.map(m => m.id);
      for (const mode of modesJson) {
        expect(seededIds).toContain(mode.id);
      }
    });
  });

  describe('maps have valid game_id references', () => {
    it('every game_map row has a game_id that exists in the games table', async () => {
      const orphanMaps = await db.all(
        `SELECT gmap.id FROM game_maps gmap
         LEFT JOIN games g ON g.id = gmap.game_id
         WHERE g.id IS NULL`
      ) as Array<{ id: string }>;
      expect(orphanMaps).toHaveLength(0);
    });

    it('every game_map with a non-null mode_id has a mode that exists in game_modes', async () => {
      const orphanMaps = await db.all(
        `SELECT gmap.id FROM game_maps gmap
         LEFT JOIN game_modes gm ON gm.id = gmap.mode_id
         WHERE gmap.mode_id IS NOT NULL AND gm.id IS NULL`
      ) as Array<{ id: string }>;
      expect(orphanMaps).toHaveLength(0);
    });

    it('overwatch2 has at least as many maps as maps.json', async () => {
      const { mapsJson } = loadGameData('overwatch2');
      const seededMaps = await db.get(
        `SELECT COUNT(*) as cnt FROM game_maps WHERE game_id = 'overwatch2'`
      ) as { cnt: number } | null;
      expect(seededMaps!.cnt).toBeGreaterThanOrEqual(mapsJson.length);
    });
  });

  describe('re-running seeder with same dataVersion is a no-op', () => {
    it('game count stays the same after second seeder run', async () => {
      const before = await db.get(`SELECT COUNT(*) as cnt FROM games`) as { cnt: number } | null;
      const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
      await seeder.seedDatabase();
      const after = await db.get(`SELECT COUNT(*) as cnt FROM games`) as { cnt: number } | null;
      expect(after!.cnt).toBe(before!.cnt);
    });

    it('mode count stays the same after second seeder run', async () => {
      const before = await db.get(`SELECT COUNT(*) as cnt FROM game_modes`) as { cnt: number } | null;
      const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
      await seeder.seedDatabase();
      const after = await db.get(`SELECT COUNT(*) as cnt FROM game_modes`) as { cnt: number } | null;
      expect(after!.cnt).toBe(before!.cnt);
    });

    it('data_versions rows count stays the same after second seeder run', async () => {
      const before = await db.get(`SELECT COUNT(*) as cnt FROM data_versions`) as { cnt: number } | null;
      const seeder = new DatabaseSeeder(db as any, GAMES_DATA_DIR);
      await seeder.seedDatabase();
      const after = await db.get(`SELECT COUNT(*) as cnt FROM data_versions`) as { cnt: number } | null;
      expect(after!.cnt).toBe(before!.cnt);
    });
  });

  describe('overall counts', () => {
    it('has at least 6 games seeded', async () => {
      const row = await db.get(`SELECT COUNT(*) as cnt FROM games`) as { cnt: number } | null;
      expect(row!.cnt).toBeGreaterThanOrEqual(6);
    });

    it('has at least one mode per game', async () => {
      const games = await db.all(`SELECT id FROM games`) as Array<{ id: string }>;
      for (const game of games) {
        const modeCount = await db.get(
          `SELECT COUNT(*) as cnt FROM game_modes WHERE game_id = ?`,
          [game.id]
        ) as { cnt: number } | null;
        expect(modeCount!.cnt).toBeGreaterThan(0);
      }
    });

    it('has at least one map per game', async () => {
      const games = await db.all(`SELECT id FROM games`) as Array<{ id: string }>;
      for (const game of games) {
        const mapCount = await db.get(
          `SELECT COUNT(*) as cnt FROM game_maps WHERE game_id = ?`,
          [game.id]
        ) as { cnt: number } | null;
        expect(mapCount!.cnt).toBeGreaterThan(0);
      }
    });
  });
});
