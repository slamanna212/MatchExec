/**
 * Reference-data seeder (Drizzle port of lib/database/seeder.ts).
 *
 * Seeds `data/games/<game>/{game,modes,maps,stats}.json` and `data/voices.json`, tracking `dataVersion` in
 * `data_versions` / `voice_data_versions` so unchanged data is skipped. Also inserts the default app settings
 * rows that the old SQLite migrations created (they are data, not schema, so they are not in the baseline SQL).
 * Idempotent; safe to run on every start.
 */
import fs from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import type { Db, Executor } from './index';
import {
  appSettings, dataVersions, gameMaps, gameModes, gameStatDefinitions, games, statsSettings, voiceDataVersions, voices,
} from './schema';
import type { PositionScoringConfig } from './schema';

const log = (...a: unknown[]) => { if (!process.env.VITEST) console.log('[seed]', ...a); };

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
  scoringConfig?: PositionScoringConfig;
  assets: { iconUrl: string; coverUrl?: string };
}

interface ModeData {
  id: string;
  name: string;
  description: string;
  teamSize?: number | null;
  maxTeams?: number;
  maxPlayers?: number;
  scoringType?: string;
  setupComponents?: string[];
}

interface MapData {
  id: string;
  name: string;
  type: string;
  location?: string;
  thumbnailUrl?: string;
  tournament_enabled?: boolean;
  supportedModes?: string[];
}

interface StatData {
  id: string;
  name: string;
  displayName: string;
  statType: string;
  category?: string;
  sortOrder: number;
  isPrimary: boolean;
  format?: string;
  chartType?: string;
}

interface VoiceData {
  dataVersion: string;
  voices: Array<{ id: string; name: string; path: string }>;
}

export interface SeedOptions {
  /** Directory containing one folder per game. Default `<cwd>/data/games`. */
  gamesDir?: string;
  /** Path to voices.json. Default `<cwd>/data/voices.json`. */
  voicesFile?: string;
}

/** Defaults the old SQLite migrations inserted into `app_settings` (final state after migrations 003..015). */
export const DEFAULT_APP_SETTINGS: ReadonlyArray<{ setting_key: string; setting_value: string; data_type: string; metadata: Record<string, unknown> }> = [
  { setting_key: 'welcome_flow_completed', setting_value: 'false', data_type: 'boolean', metadata: { description: 'Whether the initial setup welcome flow has been completed' } },
  { setting_key: 'welcome_flow_step', setting_value: '1', data_type: 'number', metadata: { description: 'Current step in the welcome flow process', min: 1, max: 3 } },
  { setting_key: 'log_level', setting_value: 'warning', data_type: 'string', metadata: { description: 'Application log level filter', options: ['debug', 'info', 'warning', 'error', 'critical'] } },
  { setting_key: 'scheduler_last_heartbeat', setting_value: '', data_type: 'string', metadata: { description: 'ISO timestamp of the last scheduler heartbeat for health monitoring' } },
  { setting_key: 'stats_processor_last_heartbeat', setting_value: '', data_type: 'string', metadata: { description: 'ISO timestamp of the last stats processor heartbeat for health monitoring' } },
  { setting_key: 'feed_retention_days', setting_value: '180', data_type: 'number', metadata: { description: 'Number of days to keep activity feed events before automatic cleanup.', min: 1, max: 3650 } },
  { setting_key: 'update_check_enabled', setting_value: 'true', data_type: 'boolean', metadata: { description: 'Whether the scheduler checks GitHub for new releases' } },
  { setting_key: 'latest_version', setting_value: '', data_type: 'string', metadata: { description: 'Latest release tag from GitHub e.g. v0.9.0' } },
  { setting_key: 'update_check_last_run', setting_value: '', data_type: 'string', metadata: { description: 'ISO timestamp of last successful check' } },
  { setting_key: 'update_available', setting_value: 'false', data_type: 'boolean', metadata: { description: 'Set true by scheduler when newer version available' } },
];

export async function seedDefaultSettings(ex: Executor): Promise<void> {
  await ex.insert(appSettings).values([...DEFAULT_APP_SETTINGS]).onConflictDoNothing();
  await ex.insert(statsSettings).values({ id: 1 }).onConflictDoNothing();
}

function readJson<T>(file: string): T | undefined {
  if (!fs.existsSync(file)) return undefined;
  const content = fs.readFileSync(file, 'utf8').trim();
  return content ? (JSON.parse(content) as T) : undefined;
}

function fixImageUrl(url: string | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/public/') ? url.replace('/public/', '/') : url;
}

const convertMapTypeToModeId = (type: string): string => {
  const id = type.toLowerCase();
  return id === 'doom match' ? 'doommatch' : id;
};

type MapRow = typeof gameMaps.$inferInsert;

function buildMapRows(gameId: string, maps: MapData[], supportsAllModes: boolean | undefined, modeIds: string[]): MapRow[] {
  const rows: MapRow[] = [];
  const row = (id: string, map: MapData, mode_id: string | null): MapRow => ({
    id, game_id: gameId, name: map.name, mode_id, image_url: fixImageUrl(map.thumbnailUrl),
    location: map.location || null, tournament_enabled: map.tournament_enabled ?? true,
  });
  const hasSupportedModes = maps.some((m) => Array.isArray(m.supportedModes));
  for (const map of maps) {
    if (hasSupportedModes) {
      if (Array.isArray(map.supportedModes)) for (const modeId of map.supportedModes) rows.push(row(`${map.id}-${modeId}`, map, modeId));
      else rows.push(row(map.id, map, null));
    } else if (supportsAllModes) {
      if (modeIds.length > 0) for (const modeId of modeIds) rows.push(row(`${map.id}-${modeId}`, map, modeId));
      else rows.push(row(map.id, map, null));
    } else {
      rows.push(row(map.id, map, convertMapTypeToModeId(map.type)));
    }
  }
  return rows;
}

async function seedStats(tx: Executor, gameId: string, statsRaw: StatData[] | { stats: StatData[]; aiNotes?: string }): Promise<void> {
  const stats = Array.isArray(statsRaw) ? statsRaw : statsRaw.stats;
  await tx.delete(gameStatDefinitions).where(eq(gameStatDefinitions.game_id, gameId));
  if (stats.length > 0) {
    await tx.insert(gameStatDefinitions).values(stats.map((s) => ({
      id: s.id, game_id: gameId, name: s.name, display_name: s.displayName, stat_type: s.statType,
      category: s.category || null, sort_order: s.sortOrder, is_primary: !!s.isPrimary, format: s.format || null,
      chart_type: s.chartType || 'bar',
    })));
  }
  if (!Array.isArray(statsRaw) && statsRaw.aiNotes !== undefined) {
    await tx.update(games).set({ ai_screenshot_notes: statsRaw.aiNotes }).where(eq(games.id, gameId));
  }
}

async function seedGame(db: Db, gameDir: string, dir: string): Promise<boolean> {
  const gamePath = path.join(gameDir, dir);
  const gameData = readJson<GameData>(path.join(gamePath, 'game.json'));
  if (!gameData) {
    log(`no game.json for ${dir}, skipping`);
    return false;
  }
  const [existing] = await db.select({ v: dataVersions.data_version }).from(dataVersions).where(eq(dataVersions.game_id, gameData.id));
  if (existing?.v === gameData.dataVersion) {
    log(`${gameData.name} up-to-date (v${gameData.dataVersion})`);
    return false;
  }
  log(`seeding ${gameData.name} (v${gameData.dataVersion})`);

  const modes = readJson<ModeData[]>(path.join(gamePath, 'modes.json'));
  const maps = readJson<MapData[]>(path.join(gamePath, 'maps.json'));
  const statsRaw = readJson<StatData[] | { stats: StatData[]; aiNotes?: string }>(path.join(gamePath, 'stats.json'));

  await db.transaction(async (tx) => {
    const gameValues = {
      id: gameData.id,
      name: gameData.name,
      color: gameData.color ?? null,
      genre: gameData.genre,
      developer: gameData.developer,
      release_date: gameData.releaseDate,
      version: gameData.patch,
      description: gameData.description,
      min_players: gameData.minPlayers,
      max_players: gameData.maxPlayers,
      max_signups: gameData.maxSignups ?? null,
      supports_all_modes: !!gameData.supportsAllModes,
      map_codes_supported: !!gameData.mapCodesSupported,
      scoring_config: gameData.scoringConfig ?? null,
      icon_url: gameData.assets.iconUrl,
      cover_url: gameData.assets.coverUrl ?? null,
    };
    // Upsert (the SQLite seeder used INSERT OR REPLACE, which would cascade-delete modes/maps/versions here).
    await tx.insert(games).values(gameValues).onConflictDoUpdate({ target: games.id, set: { ...gameValues, updated_at: new Date() } });

    // game_maps has a composite FK to game_modes, so maps must go before modes.
    if (modes || maps) await tx.delete(gameMaps).where(eq(gameMaps.game_id, gameData.id));
    let modeIds: string[] = [];
    if (modes) {
      await tx.delete(gameModes).where(eq(gameModes.game_id, gameData.id));
      if (modes.length > 0) {
        await tx.insert(gameModes).values(modes.map((m) => ({
          id: m.id, game_id: gameData.id, name: m.name, description: m.description,
          team_size: m.teamSize !== undefined ? m.teamSize : null,
          max_teams: m.maxTeams || 2,
          max_players: m.maxPlayers || null,
          scoring_type: m.scoringType || 'Normal',
          setup_components: m.setupComponents ?? null,
        })));
      }
      modeIds = modes.map((m) => m.id);
    } else {
      const existingModes = await tx.select({ id: gameModes.id }).from(gameModes).where(eq(gameModes.game_id, gameData.id));
      modeIds = existingModes.map((m) => m.id);
    }
    if (maps && maps.length > 0) {
      await tx.insert(gameMaps).values(buildMapRows(gameData.id, maps, gameData.supportsAllModes, modeIds));
    }
    if (statsRaw) await seedStats(tx, gameData.id, statsRaw);
    await tx.insert(dataVersions)
      .values({ game_id: gameData.id, data_version: gameData.dataVersion })
      .onConflictDoUpdate({ target: dataVersions.game_id, set: { data_version: gameData.dataVersion, seeded_at: sql`now()` } });
  });
  return true;
}

async function seedVoices(db: Db, voicesFile: string): Promise<void> {
  const data = readJson<VoiceData>(voicesFile);
  if (!data) {
    log('no voices.json, skipping voice seeding');
    return;
  }
  const [existing] = await db.select({ v: voiceDataVersions.data_version }).from(voiceDataVersions).where(eq(voiceDataVersions.voice_type, 'voices'));
  if (existing?.v === data.dataVersion) {
    log(`voice data up-to-date (v${data.dataVersion})`);
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(voices);
    if (data.voices.length > 0) await tx.insert(voices).values(data.voices.map((v) => ({ id: v.id, name: v.name, path: v.path })));
    await tx.insert(voiceDataVersions)
      .values({ voice_type: 'voices', data_version: data.dataVersion })
      .onConflictDoUpdate({ target: voiceDataVersions.voice_type, set: { data_version: data.dataVersion, seeded_at: sql`now()` } });
  });
  log(`seeded ${data.voices.length} voices (v${data.dataVersion})`);
}

/** Seed default settings, every game directory, and voices. Returns the number of games (re)seeded. */
export async function seedDatabase(db: Db, options: SeedOptions = {}): Promise<number> {
  const gamesDir = options.gamesDir ?? path.join(process.cwd(), 'data', 'games');
  const voicesFile = options.voicesFile ?? path.join(process.cwd(), 'data', 'voices.json');

  await seedDefaultSettings(db);

  let seeded = 0;
  if (fs.existsSync(gamesDir)) {
    const dirs = fs.readdirSync(gamesDir).filter((d) => fs.statSync(path.join(gamesDir, d)).isDirectory()).sort();
    for (const dir of dirs) {
      if (await seedGame(db, gamesDir, dir)) seeded++;
    }
  } else {
    log(`games directory not found: ${gamesDir}`);
  }
  await seedVoices(db, voicesFile);
  return seeded;
}
