/** Match creation: request validation, deriving the mode from the selected maps and the insert. */
import type { Executor } from '../../../lib/db';
import {
  validateRequiredFields, validateMaxLength, validateNumberRange, validateEnum, validatePositionScoringOverride, type ValidationResult,
} from '../utils/validation';
import { cleanMapId } from '../utils/map-utils';
import { getGameMaxSignups, getMap, getMode, getModeScoringType } from '../games';
import { createMatch as insertMatch, getMatchWithGame, type MatchWithGame } from './matches';
import type { Announcement } from '../../../lib/db/schema/types';

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

const RULES_VALUES = ['casual', 'competitive'] as const;

/** Validate a match creation request (the same rules the create form and the old route applied). */
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
 * Derive matches.mode_id from the selected maps. Match-level scoring (winner, overall score, team setup) reads the
 * scoring type through mode_id, so it must be set at creation. Map ids may carry the UI's `-<timestamp>-<random>`
 * suffix. All maps must share one scoring type: a match is Normal, FFA or Position, not a mix.
 */
export async function resolveModeFromMaps(ex: Executor, gameId: string, maps: string[] | undefined): Promise<{ modeId: string | null; error?: string }> {
  if (!maps || maps.length === 0) return { modeId: null };
  let modeId: string | null = null;
  let scoringType: string | null = null;
  for (const mapId of maps) {
    const map = await getMap(ex, gameId, cleanMapId(String(mapId)));
    if (!map) continue;
    const rowScoring = map.mode_id ? ((await getModeScoringType(ex, gameId, map.mode_id)) ?? null) : null;
    if (modeId === null) {
      modeId = map.mode_id as string;
      scoringType = rowScoring ?? 'Normal';
    } else if ((rowScoring ?? 'Normal') !== scoringType) {
      return { modeId: null, error: 'All maps in a match must use the same scoring type' };
    }
  }
  return { modeId };
}

/**
 * Create a match from a validated request. Returns an error message for an invalid mode mix.
 * `team_count` is NOT NULL in Postgres, so an unspecified team count is resolved here from the mode's `max_teams`
 * (what createMatchTeams used to do lazily at the assign transition).
 */
export async function createMatchFromRequest(ex: Executor, body: MatchRequestBody): Promise<{ match: MatchWithGame } | { error: string }> {
  const mode = await resolveModeFromMaps(ex, body.gameId, body.maps);
  if (mode.error) return { error: mode.error };

  let teamCount = body.teamCount;
  if (!teamCount && mode.modeId) {
    const m = await getMode(ex, body.gameId, mode.modeId);
    if (m && m.scoring_type === 'Normal' && m.max_teams && m.max_teams > 2) teamCount = Math.min(16, m.max_teams);
  }

  const row = await insertMatch(ex, {
    name: body.name,
    description: body.description,
    gameId: body.gameId,
    modeId: mode.modeId,
    maxParticipants: (await getGameMaxSignups(ex, body.gameId)) || 20,
    // Discord fields are placeholders until they're configured.
    guildId: 'placeholder_guild',
    channelId: 'placeholder_channel',
    startDate: new Date(body.startDate as string),
    rules: body.rules,
    rounds: body.rounds,
    maps: body.maps,
    livestreamLink: body.livestreamLink,
    eventImageUrl: body.eventImageUrl,
    playerNotifications: body.playerNotifications,
    announcements: body.announcements as unknown as Announcement[] | undefined,
    statsEnabled: body.statsEnabled,
    teamCount,
    positionScoringOverride: body.positionScoringOverride,
  });
  const match = (await getMatchWithGame(ex, row.id)) as MatchWithGame;
  return { match };
}
