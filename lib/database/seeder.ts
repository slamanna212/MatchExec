import fs from 'fs';
import path from 'path';
import { Database } from './connection';

interface GameData {
  id: string;
  name: string;
  color?: string;
  genre: string;
  developer: string;
  releaseDate: string;
  patch: string;
  dataVersion: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  maxSignups?: number;
  supportsAllModes?: boolean;
  assets: {
    iconUrl: string;
    coverUrl?: string;
  };
}

interface ModeData {
  id: string;
  name: string;
  description: string;
}

interface MapData {
  id: string;
  name: string;
  type: string;
  location?: string;
  thumbnailUrl?: string;
}

export class DatabaseSeeder {
  private db: Database;
  private dataDir: string;

  constructor(db: Database, dataDir: string = './data/games') {
    this.db = db;
    this.dataDir = dataDir;
  }

  async seedDatabase(): Promise<void> {

    const gameDirectories = this.getGameDirectories();

    for (const gameDir of gameDirectories) {
      await this.seedGame(gameDir);
    }

  }

  private getGameDirectories(): string[] {
    if (!fs.existsSync(this.dataDir)) {
      return [];
    }

    return fs.readdirSync(this.dataDir)
      .filter(dir => fs.statSync(path.join(this.dataDir, dir)).isDirectory());
  }

  private async seedGame(gameDir: string): Promise<void> {
    const gamePath = path.join(this.dataDir, gameDir);
    const gameJsonPath = path.join(gamePath, 'game.json');

    if (!fs.existsSync(gameJsonPath)) {
      return;
    }

    const gameData: GameData = JSON.parse(fs.readFileSync(gameJsonPath, 'utf8'));

    // Check if we need to seed this game
    const existingVersion = await this.getExistingDataVersion(gameData.id);
    if (existingVersion === gameData.dataVersion) {
      return;
    }


    // Seed game data
    await this.seedGameData(gameData);

    // Seed modes if they exist
    const modesPath = path.join(gamePath, 'modes.json');
    if (fs.existsSync(modesPath)) {
      const modesContent = fs.readFileSync(modesPath, 'utf8').trim();
      if (modesContent) {
        const modesData: ModeData[] = JSON.parse(modesContent);
        await this.seedModes(gameData.id, modesData);
      }
    }

    // Seed maps if they exist
    const mapsPath = path.join(gamePath, 'maps.json');
    if (fs.existsSync(mapsPath)) {
      const mapsContent = fs.readFileSync(mapsPath, 'utf8').trim();
      if (mapsContent) {
        const mapsData: MapData[] = JSON.parse(mapsContent);
        await this.seedMaps(gameData.id, mapsData, gameData.supportsAllModes);
      }
    }

    // Update data version
    await this.updateDataVersion(gameData.id, gameData.dataVersion);
  }

  private async getExistingDataVersion(gameId: string): Promise<string | null> {
    const result = await this.db.get<{ data_version: string }>(
      'SELECT data_version FROM data_versions WHERE game_id = ?',
      [gameId]
    );
    return result?.data_version || null;
  }

  private async seedGameData(gameData: GameData): Promise<void> {
    await this.db.run(`
      INSERT OR REPLACE INTO games (
        id, name, color, genre, developer, release_date, version, description,
        min_players, max_players, max_signups, supports_all_modes, icon_url, cover_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      gameData.id,
      gameData.name,
      gameData.color || null,
      gameData.genre,
      gameData.developer,
      gameData.releaseDate,
      gameData.patch,
      gameData.description,
      gameData.minPlayers,
      gameData.maxPlayers,
      gameData.maxSignups || null,
      gameData.supportsAllModes ? 1 : 0,
      gameData.assets.iconUrl,
      gameData.assets.coverUrl || null
    ]);
  }

  private async seedModes(gameId: string, modesData: ModeData[]): Promise<void> {
    // Clear existing modes for this game
    await this.db.run('DELETE FROM game_modes WHERE game_id = ?', [gameId]);

    for (const mode of modesData) {
      await this.db.run(`
        INSERT INTO game_modes (id, game_id, name, description, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [mode.id, gameId, mode.name, mode.description]);
    }
  }

  private async seedMaps(gameId: string, mapsData: MapData[], supportsAllModes?: boolean): Promise<void> {
    // Clear existing maps for this game
    await this.db.run('DELETE FROM game_maps WHERE game_id = ?', [gameId]);

    if (supportsAllModes) {
      // For games that support all modes on all maps (like Valorant)
      // Get all modes for this game first
      const modes = await this.db.all<{ id: string }>('SELECT id FROM game_modes WHERE game_id = ?', [gameId]);
      
      for (const map of mapsData) {
        // Fix image URL by removing /public prefix for Next.js static assets
        let imageUrl = map.thumbnailUrl || null;
        if (imageUrl && imageUrl.startsWith('/public/')) {
          imageUrl = imageUrl.replace('/public/', '/');
        }

        if (modes.length > 0) {
          // Create an entry for each map-mode combination
          for (const mode of modes) {
            const mapIdWithMode = `${map.id}-${mode.id}`;
            await this.db.run(`
              INSERT INTO game_maps (id, game_id, name, mode_id, image_url, location, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [mapIdWithMode, gameId, map.name, mode.id, imageUrl, map.location || null]);
          }
        } else {
          // Fallback: create with null mode_id
          await this.db.run(`
            INSERT INTO game_maps (id, game_id, name, mode_id, image_url, location, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `, [map.id, gameId, map.name, null, imageUrl, map.location || null]);
        }
      }
    } else {
      // Traditional approach: map type defines the mode
      for (const map of mapsData) {
        // Convert type (e.g., "Hybrid") to mode_id (e.g., "hybrid")
        // Special handling for "Doom Match" -> "doom-match"
        let modeId = map.type.toLowerCase();
        if (modeId === 'doom match') {
          modeId = 'doom-match';
        }
        
        // Fix image URL by removing /public prefix for Next.js static assets
        let imageUrl = map.thumbnailUrl || null;
        if (imageUrl && imageUrl.startsWith('/public/')) {
          imageUrl = imageUrl.replace('/public/', '/');
        }

        await this.db.run(`
          INSERT INTO game_maps (id, game_id, name, mode_id, image_url, location, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [map.id, gameId, map.name, modeId, imageUrl, map.location || null]);
      }
    }
  }

  private async updateDataVersion(gameId: string, dataVersion: string): Promise<void> {
    await this.db.run(`
      INSERT OR REPLACE INTO data_versions (game_id, data_version, seeded_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [gameId, dataVersion]);
  }
}