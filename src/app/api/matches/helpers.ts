/**
 * Helper functions for match API routes
 */

import type { MatchDbRow } from '@/shared/types';
import { validateRequiredFields, validateMaxLength, validateNumberRange, validateEnum, safeJSONParse, validatePositionScoringOverride } from '@/lib/utils/validation';
import type { ValidationResult } from '@/lib/utils/validation';
import type { Database } from '@/lib/database/connection';

export interface MatchRequestBody {
  name: string;
  description?: string;
  gameId: string;
  startDate?: string;
  livestreamLink?: string;
  rules?: string;
  rounds?: number;
  maps?: string[];
  eventImageUrl?: string;
  playerNotifications?: boolean;
  announcements?: Array<{ type: string; time: number }>;
  statsEnabled?: boolean;
  teamCount?: number;
  positionScoringOverride?: Record<string, number> | null;
}

export interface PreparedMatchData {
  matchId: string;
  /** game_modes.id derived from the selected maps; null when no maps were provided. */
  modeId: string | null;
  maxParticipants: number;
  guildId: string;
  channelId: string;
  startDateTime: string | null;
}

const RULES_VALUES = ['casual', 'competitive'] as const;

/**
 * Validate match creation request
 */
export function validateMatchRequest(body: MatchRequestBody): ValidationResult {
  const required = validateRequiredFields(body as unknown as Record<string, unknown>, ['name', 'gameId']);
  if (!required.valid) return required;

  // start_date / start_time are NOT NULL, so reject here rather than failing at insert.
  if (typeof body.startDate !== 'string' || Number.isNaN(new Date(body.startDate).getTime())) {
    return { valid: false, error: 'startDate is required and must be a valid date' };
  }

  const overrideError = validatePositionScoringOverride(body.positionScoringOverride);
  if (overrideError) return { valid: false, error: overrideError };

  for (const check of [
    validateMaxLength(body.name, 255, 'name'),
    validateMaxLength(body.description, 1000, 'description'),
    validateMaxLength(body.livestreamLink, 500, 'livestreamLink'),
    validateEnum(body.rules, RULES_VALUES, 'rules'),
    validateNumberRange(body.rounds, 1, 9, 'rounds'),
    validateNumberRange(body.teamCount, 2, 16, 'teamCount'),
  ]) {
    if (!check.valid) return check;
  }

  return { valid: true };
}

/**
 * Derive matches.mode_id from the selected maps. Match-level scoring (winner,
 * overall score, team setup) reads the scoring type through mode_id, so it must
 * be set at creation. Map ids may carry the UI's `-<timestamp>-<random>` suffix.
 * All maps must share one scoring type: a match is Normal, FFA or Position, not a mix.
 */
export async function resolveModeFromMaps(
  db: Database,
  gameId: string,
  maps: string[] | undefined
): Promise<{ modeId: string | null; error?: string }> {
  if (!maps || maps.length === 0) return { modeId: null };

  let modeId: string | null = null;
  let scoringType: string | null = null;
  for (const mapId of maps) {
    const cleanId = String(mapId).replace(/-\d+-[a-zA-Z0-9]+$/, '');
    const row = await db.get<{ mode_id: string; scoring_type: string | null }>(
      `SELECT gm.mode_id, gmo.scoring_type
       FROM game_maps gm
       LEFT JOIN game_modes gmo ON gmo.id = gm.mode_id AND gmo.game_id = gm.game_id
       WHERE gm.game_id = ? AND gm.id = ?`,
      [gameId, cleanId]
    );
    if (!row) continue;
    if (modeId === null) {
      modeId = row.mode_id;
      scoringType = row.scoring_type ?? 'Normal';
    } else if ((row.scoring_type ?? 'Normal') !== scoringType) {
      return { modeId: null, error: 'All maps in a match must use the same scoring type' };
    }
  }
  return { modeId };
}

/**
 * Prepare match data for database insertion
 */
export async function prepareMatchData(
  body: MatchRequestBody,
  db: Database,
  modeId: string | null = null
): Promise<PreparedMatchData> {
  const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation

  // Get the game's max signups setting
  const game = await db.get<{ max_signups?: number }>('SELECT max_signups FROM games WHERE id = ?', [body.gameId]);
  const maxParticipants = game?.max_signups || 20;

  // For now, use placeholder values for Discord fields until they're configured
  const guildId = 'placeholder_guild';
  const channelId = 'placeholder_channel';

  const startDateTime = body.startDate ? new Date(body.startDate).toISOString() : null;

  return {
    matchId,
    modeId,
    maxParticipants,
    guildId,
    channelId,
    startDateTime
  };
}

/**
 * Insert match into database
 */
export async function insertMatchToDatabase(
  db: Database,
  body: MatchRequestBody,
  preparedData: PreparedMatchData
): Promise<void> {
  await db.run(`
    INSERT INTO matches (
      id, name, description, game_id, mode_id, guild_id, channel_id, max_participants, status, start_date, start_time,
      rules, rounds, maps, livestream_link, event_image_url, player_notifications, announcements, match_format,
      stats_enabled, team_count, position_scoring_override
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    preparedData.matchId,
    body.name,
    body.description || null,
    body.gameId,
    preparedData.modeId,
    preparedData.guildId,
    preparedData.channelId,
    preparedData.maxParticipants,
    'created',
    preparedData.startDateTime,
    preparedData.startDateTime,
    body.rules || null,
    body.rounds || null,
    body.maps && body.maps.length > 0 ? JSON.stringify(body.maps) : null,
    body.livestreamLink || null,
    body.eventImageUrl || null,
    body.playerNotifications ?? true,
    body.announcements && body.announcements.length > 0 ? JSON.stringify(body.announcements) : null,
    body.rules || 'casual',
    body.statsEnabled ? 1 : 0,
    body.teamCount ?? null,
    body.positionScoringOverride ? JSON.stringify(body.positionScoringOverride) : null,
  ]);
}

/**
 * Parse match response from database
 */
export function parseMatchResponse(match: MatchDbRow | undefined) {
  if (!match) return null;

  return {
    ...match,
    maps: safeJSONParse(typeof match.maps === 'string' ? match.maps : null, []),
    map_codes: safeJSONParse(typeof match.map_codes === 'string' ? match.map_codes : null, {})
  };
}
