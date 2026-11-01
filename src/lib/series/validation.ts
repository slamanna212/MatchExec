/** Pure validation and parsing for the series domain (no database access). */

export interface SeriesScoringConfig {
  match_win_points?: number;
  match_loss_points?: number;
  tournament_position_points?: number[];
  /** Position-mode match events use their own points_awarded spread instead of match_win_points/match_loss_points. Defaults to true. */
  position_event_use_event_spread?: boolean;
}

const SERIES_STATUS_ORDER: Record<string, number> = {
  created: 0,
  active: 1,
  complete: 2,
};

/**
 * Validates a series status transition. created -> active -> complete is the only forward path; cancelled is reachable
 * from created/active but not from a terminal state. Returns null when the transition is legal, else an error message
 * describing why it isn't.
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

  const currentOrder = SERIES_STATUS_ORDER[current];
  const nextOrder = SERIES_STATUS_ORDER[next];
  if (currentOrder === undefined || nextOrder === undefined) {
    return `Invalid status: ${next}`;
  }
  if (nextOrder !== currentOrder + 1) {
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

/** Validates the shape of a scoring_config object. Returns an error message or null. */
export function validateScoringConfig(config: unknown): string | null {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return 'scoring_config must be an object';
  }
  const c = config as Record<string, unknown>;
  for (const key of ['match_win_points', 'match_loss_points']) {
    if (c[key] !== undefined && !isFiniteNumber(c[key])) return `scoring_config.${key} must be a number`;
  }
  if (c.tournament_position_points !== undefined) {
    const arr = c.tournament_position_points;
    if (!Array.isArray(arr) || !arr.every(isFiniteNumber)) {
      return 'scoring_config.tournament_position_points must be an array of numbers';
    }
  }
  if (c.position_event_use_event_spread !== undefined && typeof c.position_event_use_event_spread !== 'boolean') {
    return 'scoring_config.position_event_use_event_spread must be a boolean';
  }
  return null;
}

/** A stored scoring_config, or `{}` when absent / malformed. */
export function parseScoringConfig(raw: unknown): SeriesScoringConfig {
  if (!raw || validateScoringConfig(raw) !== null) return {};
  return raw as SeriesScoringConfig;
}

const NULLABLE_STRING_FIELDS = [
  'description', 'start_date', 'end_date', 'event_image_url', 'game_id',
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
  return null;
}
