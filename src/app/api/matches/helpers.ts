/**
 * Helper functions for match API routes
 */

import type { MatchDbRow } from '@/shared/types';
import { validateRequiredFields, safeJSONParse } from '@/lib/utils/validation';
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
}

export interface PreparedMatchData {
  matchId: string;
  maxParticipants: number;
  guildId: string;
  channelId: string;
  startDateTime: string | null;
}

/**
 * Validate match creation request
 */
export function validateMatchRequest(body: MatchRequestBody): ValidationResult {
  return validateRequiredFields(body as unknown as Record<string, unknown>, ['name', 'gameId']);
}

/**
 * Prepare match data for database insertion
 */
export async function prepareMatchData(
  body: MatchRequestBody,
  db: Database
): Promise<PreparedMatchData> {
  const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  // Get the game's max signups setting
  const game = await db.get<{ max_signups?: number }>('SELECT max_signups FROM games WHERE id = ?', [body.gameId]);
  const maxParticipants = game?.max_signups || 20;

  // For now, use placeholder values for Discord fields until they're configured
  const guildId = 'placeholder_guild';
  const channelId = 'placeholder_channel';

  const startDateTime = body.startDate ? new Date(body.startDate).toISOString() : null;

  return {
    matchId,
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
      id, name, description, game_id, guild_id, channel_id, max_participants, status, start_date, start_time,
      rules, rounds, maps, livestream_link, event_image_url, player_notifications, announcements, match_format
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    preparedData.matchId,
    body.name,
    body.description || null,
    body.gameId,
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
    body.rules || 'casual'
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
