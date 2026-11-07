/** Pure validation and parsing for the series domain (no database access). */
import type {
  SeriesEntrantStatus, SeriesEventRole, SeriesMemberRole, SeriesScoringConfig, SeriesStageStatus, SeriesTiebreaker,
} from '../../../shared/series-types';

export type { SeriesScoringConfig } from '../../../shared/series-types';

export const SERIES_STATUSES = ['created', 'registration', 'active', 'complete', 'cancelled'] as const;
export const ENTRANT_TYPES = ['solo', 'team'] as const;
export const SCORING_TYPES = ['Normal', 'FFA', 'Position'] as const;
export const ENTRANT_STATUSES: readonly SeriesEntrantStatus[] = ['pending', 'active', 'withdrawn'];
export const MEMBER_ROLES: readonly SeriesMemberRole[] = ['captain', 'player', 'sub'];
export const STAGE_STATUSES: readonly SeriesStageStatus[] = ['upcoming', 'active', 'complete'];
export const EVENT_ROLES: readonly SeriesEventRole[] = ['regular', 'stage_playoff', 'season_playoff', 'exhibition'];
export const TIEBREAKERS: readonly SeriesTiebreaker[] = [
  'match_wins', 'win_pct', 'points', 'map_diff', 'maps_won', 'head_to_head', 'event_wins', 'best_finishes',
];

/** Legal forward moves. `cancelled` is reachable from every non-terminal state (handled below). */
const SERIES_NEXT: Record<string, readonly string[]> = {
  created: ['registration', 'active'],
  registration: ['active'],
  active: ['complete'],
};

/**
 * Validates a series status transition: created -> registration -> active -> complete (registration is optional, so
 * created -> active is legal too); cancelled is reachable from created / registration / active but not from a terminal
 * state. Returns null when the transition is legal, else an error message describing why it isn't.
 */
export function validateSeriesStatusTransition(current: string, next: string): string | null {
  if (current === next) return null;

  if (next === 'cancelled') {
    if (current === 'complete' || current === 'cancelled') {
      return `Cannot cancel a series that is already ${current}`;
    }
    return null;
  }

  if (current === 'cancelled' || current === 'complete') {
    return `Cannot transition a ${current} series`;
  }

  if (!(SERIES_STATUSES as readonly string[]).includes(current) || !(SERIES_STATUSES as readonly string[]).includes(next)) {
    return `Invalid status: ${next}`;
  }
  if (!SERIES_NEXT[current]?.includes(next)) {
    return `Cannot move from "${current}" directly to "${next}"`;
  }
  return null;
}

export function validatePointsMultiplier(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10) {
    return 'points_multiplier must be a number greater than 0 and at most 10';
  }
  return null;
}

export function validateEventOrder(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return 'event_order must be a positive integer';
  }
  return null;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Validates the shape of a scoring_config object (series level or a stage override). Returns an error message or null. */
export function validateScoringConfig(config: unknown): string | null {
  if (!isObject(config)) {
    return 'scoring_config must be an object';
  }
  const c = config;
  if (c.mode !== undefined && c.mode !== 'head_to_head' && c.mode !== 'points') {
    return 'scoring_config.mode must be "head_to_head" or "points"';
  }
  for (const key of ['match_win_points', 'match_loss_points', 'win_points', 'loss_points', 'tie_points']) {
    if (c[key] !== undefined && !isFiniteNumber(c[key])) return `scoring_config.${key} must be a number`;
  }
  for (const key of ['tournament_position_points', 'position_points']) {
    const arr = c[key];
    if (arr !== undefined && (!Array.isArray(arr) || !arr.every(isFiniteNumber))) {
      return `scoring_config.${key} must be an array of numbers`;
    }
  }
  if (c.tiebreakers !== undefined) {
    const arr = c.tiebreakers;
    if (!Array.isArray(arr) || !arr.every((t) => (TIEBREAKERS as readonly unknown[]).includes(t))) {
      return `scoring_config.tiebreakers must be an array of: ${TIEBREAKERS.join(', ')}`;
    }
  }
  if (c.drop_worst !== undefined && (typeof c.drop_worst !== 'number' || !Number.isInteger(c.drop_worst) || c.drop_worst < 0)) {
    return 'scoring_config.drop_worst must be a non-negative integer';
  }
  if (c.position_event_use_event_spread !== undefined && typeof c.position_event_use_event_spread !== 'boolean') {
    return 'scoring_config.position_event_use_event_spread must be a boolean';
  }
  return null;
}

/** `match_defaults` shape. Returns an error message or null. */
export function validateMatchDefaults(value: unknown): string | null {
  if (!isObject(value)) return 'match_defaults must be an object';
  if (value.maps !== undefined && (!Array.isArray(value.maps) || !value.maps.every((m) => typeof m === 'string'))) {
    return 'match_defaults.maps must be an array of strings';
  }
  for (const key of ['rounds', 'rounds_per_match']) {
    const v = value[key];
    if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 99)) {
      return `match_defaults.${key} must be an integer between 1 and 99`;
    }
  }
  if (value.rules !== undefined && value.rules !== 'casual' && value.rules !== 'competitive') {
    return 'match_defaults.rules must be "casual" or "competitive"';
  }
  for (const key of ['stats_enabled', 'player_notifications']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return `match_defaults.${key} must be a boolean`;
  }
  for (const key of ['livestream_link', 'event_image_url']) {
    const v = value[key];
    if (v !== undefined && v !== null && typeof v !== 'string') return `match_defaults.${key} must be a string`;
  }
  if (value.announcements !== undefined) {
    const a = value.announcements;
    if (!Array.isArray(a) || !a.every((x) => isObject(x) && typeof x.type === 'string' && isFiniteNumber(x.time))) {
      return 'match_defaults.announcements must be an array of { type, time }';
    }
  }
  return null;
}

/** `discord_config` shape. Returns an error message or null. */
export function validateDiscordConfig(value: unknown): string | null {
  if (!isObject(value)) return 'discord_config must be an object';
  for (const key of ['weekly_schedule', 'standings_posts', 'registration_posts']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return `discord_config.${key} must be a boolean`;
  }
  const lead = value.schedule_lead_hours;
  if (lead !== undefined && (!isFiniteNumber(lead) || lead < 0 || lead > 24 * 30)) {
    return 'discord_config.schedule_lead_hours must be a number between 0 and 720';
  }
  return null;
}

/** Roster bounds are positive integers with min <= max; solo entrants always have a roster of exactly one. */
export function validateRosterBounds(entrantType: unknown, rosterMin: unknown, rosterMax: unknown): string | null {
  for (const [key, v] of [['roster_min', rosterMin], ['roster_max', rosterMax]] as const) {
    if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 64)) {
      return `${key} must be an integer between 1 and 64`;
    }
  }
  if (typeof rosterMin === 'number' && typeof rosterMax === 'number' && rosterMin > rosterMax) {
    return 'roster_min must not be greater than roster_max';
  }
  if (entrantType === 'solo') {
    if ((typeof rosterMin === 'number' && rosterMin !== 1) || (typeof rosterMax === 'number' && rosterMax !== 1)) {
      return 'A solo series has a roster of exactly one: roster_min / roster_max must be 1 or empty';
    }
  }
  return null;
}

/** A stored scoring_config, or `{}` when absent / malformed. */
export function parseScoringConfig(raw: unknown): SeriesScoringConfig {
  if (!raw || validateScoringConfig(raw) !== null) return {};
  return raw as SeriesScoringConfig;
}

const NULLABLE_STRING_FIELDS = [
  'description', 'start_date', 'end_date', 'event_image_url', 'game_id', 'game_mode_id', 'previous_series_id',
  'guild_id', 'channel_id', 'livestream_link',
] as const;

/** Each date must be parseable, and the end must not be before the start. Null/undefined are fine. */
export function validateSeriesDates(start: unknown, end: unknown): string | null {
  const parse = (v: unknown): number | null => {
    if (v instanceof Date) return v.getTime();
    return typeof v === 'string' && v !== '' ? Date.parse(v) : null;
  };
  const s = parse(start);
  const e = parse(end);
  if (s !== null && Number.isNaN(s)) return 'start_date must be a valid date';
  if (e !== null && Number.isNaN(e)) return 'end_date must be a valid date';
  if (s !== null && e !== null && e < s) return 'end_date must not be before start_date';
  return null;
}

/**
 * Validates a series create/update body. Returns an error message or null.
 * For updates (`partial`), name may be omitted but must be a non-empty string when present; nullable fields accept null.
 */
export function validateSeriesBody(body: Record<string, unknown>, partial: boolean): string | null {
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) return 'name must be a non-empty string';
  }
  for (const f of NULLABLE_STRING_FIELDS) {
    const v = body[f];
    if (v !== undefined && v !== null && typeof v !== 'string') return `${f} must be a string`;
  }
  for (const f of ['announcements', 'player_notifications'] as const) {
    if (body[f] !== undefined && typeof body[f] !== 'boolean') return `${f} must be a boolean`;
  }
  const dateError = validateSeriesDates(body.start_date, body.end_date);
  if (dateError) return dateError;
  if (body.scoring_config !== undefined && !(partial && body.scoring_config === null)) {
    const err = validateScoringConfig(body.scoring_config);
    if (err) return err;
  }
  if (body.entrant_type !== undefined && !(ENTRANT_TYPES as readonly unknown[]).includes(body.entrant_type)) {
    return 'entrant_type must be "solo" or "team"';
  }
  if (body.scoring_type !== undefined && body.scoring_type !== null && !(SCORING_TYPES as readonly unknown[]).includes(body.scoring_type)) {
    return 'scoring_type must be "Normal", "FFA" or "Position" (or null)';
  }
  const rosterError = validateRosterBounds(body.entrant_type, body.roster_min, body.roster_max);
  if (rosterError) return rosterError;
  if (body.game_ids !== undefined) {
    const ids = body.game_ids;
    if (!Array.isArray(ids) || !ids.every((g) => typeof g === 'string' && g !== '')) return 'game_ids must be an array of game ids';
  }
  if (body.match_defaults !== undefined && body.match_defaults !== null) {
    const err = validateMatchDefaults(body.match_defaults);
    if (err) return err;
  }
  if (body.discord_config !== undefined && body.discord_config !== null) {
    const err = validateDiscordConfig(body.discord_config);
    if (err) return err;
  }
  return null;
}

const MAX_NAME = 100;
const isNullableString = (v: unknown): boolean => v === undefined || v === null || typeof v === 'string';

/** Entrant create / update body (members included). Returns an error message or null. */
export function validateEntrantBody(body: Record<string, unknown>, partial: boolean): string | null {
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) return 'name must be a non-empty string';
    if (body.name.trim().length > MAX_NAME) return `name must be at most ${MAX_NAME} characters`;
  }
  for (const f of ['tag', 'color', 'logo_url', 'division'] as const) {
    if (!isNullableString(body[f])) return `${f} must be a string`;
  }
  if (typeof body.tag === 'string' && body.tag.length > 12) return 'tag must be at most 12 characters';
  if (body.seed !== undefined && body.seed !== null && (typeof body.seed !== 'number' || !Number.isInteger(body.seed) || body.seed < 1 || body.seed > 9999)) {
    return 'seed must be a positive integer';
  }
  if (body.status !== undefined && !(ENTRANT_STATUSES as readonly unknown[]).includes(body.status)) {
    return `status must be one of: ${ENTRANT_STATUSES.join(', ')}`;
  }
  if (body.members !== undefined) {
    if (!Array.isArray(body.members)) return 'members must be an array';
    for (const m of body.members) {
      if (!isObject(m)) return 'each member must be an object';
      const err = validateMemberBody(m, false);
      if (err) return err;
    }
  }
  return null;
}

/** Member body (`user_id`, `username`, optional `discord_user_id`, `role`). Returns an error message or null. */
export function validateMemberBody(body: Record<string, unknown>, partial: boolean): string | null {
  if (body.user_id !== undefined || !partial) {
    if (typeof body.user_id !== 'string' || body.user_id.trim() === '') return 'user_id must be a non-empty string';
  }
  if (body.username !== undefined || !partial) {
    if (typeof body.username !== 'string' || body.username.trim() === '') return 'username must be a non-empty string';
  }
  if (!isNullableString(body.discord_user_id)) return 'discord_user_id must be a string';
  if (!isNullableString(body.avatar_url)) return 'avatar_url must be a string';
  if (body.role !== undefined && !(MEMBER_ROLES as readonly unknown[]).includes(body.role)) {
    return `role must be one of: ${MEMBER_ROLES.join(', ')}`;
  }
  return null;
}

/** Stage create / update body. Returns an error message or null. */
export function validateStageBody(body: Record<string, unknown>, partial: boolean): string | null {
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) return 'name must be a non-empty string';
    if (body.name.trim().length > MAX_NAME) return `name must be at most ${MAX_NAME} characters`;
  }
  if (body.stage_order !== undefined && (typeof body.stage_order !== 'number' || !Number.isInteger(body.stage_order) || body.stage_order < 1)) {
    return 'stage_order must be a positive integer';
  }
  if (body.counts_toward_season !== undefined && typeof body.counts_toward_season !== 'boolean') {
    return 'counts_toward_season must be a boolean';
  }
  if (body.status !== undefined && !(STAGE_STATUSES as readonly unknown[]).includes(body.status)) {
    return `status must be one of: ${STAGE_STATUSES.join(', ')}`;
  }
  if (body.scoring_config !== undefined && body.scoring_config !== null) {
    const err = validateScoringConfig(body.scoring_config);
    if (err) return err;
  }
  return null;
}

/** Stage statuses only move forward: upcoming -> active -> complete (upcoming -> complete is allowed too). */
export function validateStageStatusTransition(current: string, next: string): string | null {
  if (current === next) return null;
  const order: Record<string, number> = { upcoming: 0, active: 1, complete: 2 };
  if (order[current] === undefined || order[next] === undefined) return `Invalid stage status: ${next}`;
  if (order[next] < order[current]) return `Cannot move a stage back from "${current}" to "${next}"`;
  return null;
}

/** Placement fields shared by event attach / edit. Returns an error message or null. */
export function validatePlacementFields(body: Record<string, unknown>): string | null {
  if (body.stage_id !== undefined && body.stage_id !== null && typeof body.stage_id !== 'string') return 'stage_id must be a string or null';
  if (body.role !== undefined && !(EVENT_ROLES as readonly unknown[]).includes(body.role)) {
    return `role must be one of: ${EVENT_ROLES.join(', ')}`;
  }
  if (body.week !== undefined && body.week !== null && (typeof body.week !== 'number' || !Number.isInteger(body.week) || body.week < 1 || body.week > 999)) {
    return 'week must be a positive integer or null';
  }
  if (body.counts_for_standings !== undefined && typeof body.counts_for_standings !== 'boolean') {
    return 'counts_for_standings must be a boolean';
  }
  return null;
}
