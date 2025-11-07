import fs from 'fs';
import path from 'path';
import { Database } from './connection';
import { markDbNotReady, markDbReady } from './status';
import { logger } from '../../src/lib/logger/server';

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
  mapCodesSupported?: boolean;
  scoringConfig?: {
    type: 'Position';
    pointsPerPosition: Record<string, number>;
  };
  assets: {
    iconUrl: string;
    coverUrl?: string;
  };
}

interface ModeData {
  id: string;
  name: string;
  description: string;
  teamSize?: number;
  maxTeams?: number;
  scoringType?: string; // FFA or Normal
  scoring?: Record<string, unknown>; // Flexible scoring configuration
}

interface MapData {
  id: string;
  name: string;
  type: string;
  location?: string;
  thumbnailUrl?: string;
}

interface VoiceData {
  dataVersion: string;
  voices: Array<{
    id: string;
    name: string;
    path: string;
  }>;
}

export class DatabaseSeeder {
  private db: Database;
  private dataDir: string;

  constructor(db: Database, dataDir: string = './data/games') {
    this.db = db;
    this.dataDir = dataDir;
  }

  async seedDatabase(): Promise<void> {
    logger.debug('🌱 Starting database seeding...');
    markDbNotReady('Starting database seeding...');

    // Seed games first
    const gameDirectories = this.getGameDirectories();
    logger.debug(`📁 Found ${gameDirectories.length} game directories: ${gameDirectories.join(', ')}`);

    for (let i = 0; i < gameDirectories.length; i++) {
      const gameDir = gameDirectories[i];
      markDbNotReady(`Seeding game data (${i + 1}/${gameDirectories.length})...`);
      await this.seedGame(gameDir);
    }

    // Seed voice data
    markDbNotReady('Seeding voice data...');
    await this.seedVoices();

    logger.debug('✅ Database seeding completed');
    markDbReady();
  }

  private getGameDirectories(): string[] {
    logger.debug(`🔍 Checking for game data directory: ${this.dataDir}`);
    
    if (!fs.existsSync(this.dataDir)) {
      logger.debug(`❌ Game data directory not found: ${this.dataDir}`);
      return [];
    }

    const directories = fs.readdirSync(this.dataDir)
      .filter(dir => fs.statSync(path.join(this.dataDir, dir)).isDirectory());
    
    logger.debug(`📂 Found directories: ${directories.join(', ')}`);
    return directories;
  }

  private async seedGame(gameDir: string): Promise<void> {
    logger.debug(`\n🎮 Processing game: ${gameDir}`);
    const gamePath = path.join(this.dataDir, gameDir);
    const gameJsonPath = path.join(gamePath, 'game.json');

    if (!fs.existsSync(gameJsonPath)) {
      logger.debug(`❌ No game.json found for ${gameDir}`);
      return;
    }

    let gameData: GameData;
    try {
      gameData = JSON.parse(fs.readFileSync(gameJsonPath, 'utf8'));
      logger.debug(`📋 Loaded ${gameData.name} (${gameData.id}) v${gameData.dataVersion}`);
    } catch (error) {
      logger.error(`❌ Error parsing game.json for ${gameDir}:`, error);
      return;
    }

    // Check if we need to seed this game
    const existingVersion = await this.getExistingDataVersion(gameData.id);
    logger.debug(`🔍 Existing version: ${existingVersion || 'none'}, File version: ${gameData.dataVersion}`);
    
    if (existingVersion === gameData.dataVersion) {
      logger.debug(`✅ ${gameData.name} already up-to-date (v${gameData.dataVersion})`);
      return;
    }

    logger.debug(`🔄 Seeding ${gameData.name} (v${gameData.dataVersion})...`);

    // Seed game data
    try {
      await this.seedGameData(gameData);
      logger.debug(`✅ Seeded game data for ${gameData.name}`);
    } catch (error) {
      logger.error(`❌ Error seeding game data for ${gameData.name}:`, error);
      throw error;
    }

    // Seed modes if they exist
    const modesPath = path.join(gamePath, 'modes.json');
    if (fs.existsSync(modesPath)) {
      try {
        const modesContent = fs.readFileSync(modesPath, 'utf8').trim();
        if (modesContent) {
          const modesData: ModeData[] = JSON.parse(modesContent);
          await this.seedModes(gameData.id, modesData);
          logger.debug(`✅ Seeded ${modesData.length} modes for ${gameData.name}`);
        }
      } catch (error) {
        logger.error(`❌ Error seeding modes for ${gameData.name}:`, error);
      }
    } else {
      logger.debug(`ℹ️ No modes.json found for ${gameData.name}`);
    }

    // Seed maps if they exist
    const mapsPath = path.join(gamePath, 'maps.json');
    if (fs.existsSync(mapsPath)) {
      try {
        const mapsContent = fs.readFileSync(mapsPath, 'utf8').trim();
        if (mapsContent) {
          const mapsData: MapData[] = JSON.parse(mapsContent);
          await this.seedMaps(gameData.id, mapsData, gameData.supportsAllModes);
          logger.debug(`✅ Seeded ${mapsData.length} maps for ${gameData.name}`);
        }
      } catch (error) {
        logger.error(`❌ Error seeding maps for ${gameData.name}:`, error);
      }
    } else {
      logger.debug(`ℹ️ No maps.json found for ${gameData.name}`);
    }

    // Update data version
    try {
      await this.updateDataVersion(gameData.id, gameData.dataVersion);
      logger.debug(`✅ Updated ${gameData.name} version to ${gameData.dataVersion}`);
    } catch (error) {
      logger.error(`❌ Error updating version for ${gameData.name}:`, error);
      throw error;
    }
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
        min_players, max_players, max_signups, supports_all_modes, map_codes_supported,
        scoring_config, icon_url, cover_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
      gameData.mapCodesSupported ? 1 : 0,
      gameData.scoringConfig ? JSON.stringify(gameData.scoringConfig) : null,
      gameData.assets.iconUrl,
      gameData.assets.coverUrl || null
    ]);
  }

  private async seedModes(gameId: string, modesData: ModeData[]): Promise<void> {
    // Clear existing modes for this game
    await this.db.run('DELETE FROM game_modes WHERE game_id = ?', [gameId]);

    for (const mode of modesData) {
      const scoringType = mode.scoringType || 'Normal';
      const teamSize = mode.teamSize || 1;
      const maxTeams = mode.maxTeams || 2;
      await this.db.run(`
        INSERT INTO game_modes (id, game_id, name, description, team_size, max_teams, scoring_type, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [mode.id, gameId, mode.name, mode.description, teamSize, maxTeams, scoringType]);
    }
  }

  private async seedMaps(gameId: string, mapsData: MapData[], supportsAllModes?: boolean): Promise<void> {
    // Clear existing maps for this game
    await this.db.run('DELETE FROM game_maps WHERE game_id = ?', [gameId]);

    // Check if any map has supportedModes array
    const hasSupportedModes = mapsData.some(map => Array.isArray((map as MapData & { supportedModes?: string[] }).supportedModes));
    
    if (hasSupportedModes) {
      // New approach: maps define their supported modes via supportedModes array
      for (const map of mapsData) {
        const mapWithModes = map as MapData & { supportedModes?: string[] };
        // Fix image URL by removing /public prefix for Next.js static assets
        let imageUrl = map.thumbnailUrl || null;
        if (imageUrl && imageUrl.startsWith('/public/')) {
          imageUrl = imageUrl.replace('/public/', '/');
        }

        if (mapWithModes.supportedModes && Array.isArray(mapWithModes.supportedModes)) {
          // Create an entry for each supported mode
          for (const modeId of mapWithModes.supportedModes) {
            const mapIdWithMode = `${map.id}-${modeId}`;
            await this.db.run(`
              INSERT INTO game_maps (id, game_id, name, mode_id, image_url, location, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [mapIdWithMode, gameId, map.name, modeId, imageUrl, map.location || null]);
          }
        } else {
          // Fallback: create with null mode_id
          await this.db.run(`
            INSERT INTO game_maps (id, game_id, name, mode_id, image_url, location, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `, [map.id, gameId, map.name, null, imageUrl, map.location || null]);
        }
      }
    } else if (supportsAllModes) {
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
        // Special handling for "Doom Match" -> "doommatch"
        let modeId = map.type.toLowerCase();
        if (modeId === 'doom match') {
          modeId = 'doommatch';
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

  private async seedVoices(): Promise<void> {
    logger.debug('\n🔊 Processing voice data...');
    const voicesJsonPath = path.join('./data', 'voices.json');
    
    if (!fs.existsSync(voicesJsonPath)) {
      logger.debug('❌ No voices.json file found, skipping voice seeding');
      return;
    }

    const voiceData: VoiceData = JSON.parse(fs.readFileSync(voicesJsonPath, 'utf8'));
    logger.debug(`📋 Loaded voice data v${voiceData.dataVersion} with ${voiceData.voices.length} voices`);

    // Check if we need to seed voices
    const existingVoiceVersion = await this.getExistingVoiceDataVersion();
    logger.debug(`🔍 Existing voice version: ${existingVoiceVersion || 'none'}, File version: ${voiceData.dataVersion}`);
    
    if (existingVoiceVersion === voiceData.dataVersion) {
      logger.debug(`✅ Voice data already up-to-date (v${voiceData.dataVersion})`);
      return;
    }

    logger.debug(`🔄 Seeding voice data v${voiceData.dataVersion}...`);

    // Clear existing voice data
    await this.db.run('DELETE FROM voices');

    // Seed voice data
    for (const voice of voiceData.voices) {
      await this.db.run(`
        INSERT INTO voices (id, name, path, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `, [voice.id, voice.name, voice.path]);
    }

    // Update voice data version
    await this.updateVoiceDataVersion(voiceData.dataVersion);
    
    logger.debug(`✅ Seeded ${voiceData.voices.length} voice announcers (v${voiceData.dataVersion})`);
  }

  private async getExistingVoiceDataVersion(): Promise<string | null> {
    const result = await this.db.get<{ data_version: string }>(
      'SELECT data_version FROM voice_data_versions WHERE voice_type = ?',
      ['voices']
    );
    return result?.data_version || null;
  }

  private async updateVoiceDataVersion(dataVersion: string): Promise<void> {
    await this.db.run(`
      INSERT OR REPLACE INTO voice_data_versions (voice_type, data_version, seeded_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, ['voices', dataVersion]);
  }
}