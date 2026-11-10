/** Request-body validation for the builder routes (events, planned events, generators, withdraw). Each returns an error message or null. */
import { EVENT_ROLES, validatePlacementFields, validatePointsMultiplier } from './validation';

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const BRACKET_FORMATS = ['single-elimination', 'double-elimination', 'cumulative-points'];
const RULESETS = ['casual', 'competitive'];
const SEEDING_SOURCES = ['stage', 'season'];
const DIVISION_MODES = ['none', 'within', 'within_and_cross'];
const MAX_FIXTURES = 1000;

function isDateString(v: unknown): boolean {
  return typeof v === 'string' && v !== '' && !Number.isNaN(new Date(v).getTime());
}

function stringField(o: Record<string, unknown>, key: string, max: number, label: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return `${label}.${key} must be a string`;
  return v.length > max ? `${label}.${key} must be at most ${max} characters` : null;
}

function boolField(o: Record<string, unknown>, key: string, label: string): string | null {
  return o[key] === undefined || o[key] === null || typeof o[key] === 'boolean' ? null : `${label}.${key} must be a boolean`;
}

function firstError(...checks: Array<string | null>): string | null {
  return checks.find((c) => c !== null) ?? null;
}

/** `entrant_ids`: omitted / null (= all active) or an array of ids. */
export function validateEntrantIds(v: unknown, field = 'entrant_ids'): string | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || !v.every((id) => typeof id === 'string' && id !== '')) return `${field} must be an array of entrant ids`;
  return v.length > 256 ? `${field} lists too many entrants` : null;
}

function validatePlacementBody(body: Record<string, unknown>): string | null {
  return firstError(
    validatePlacementFields(body),
    body.points_multiplier === undefined ? null : validatePointsMultiplier(body.points_multiplier),
    body.event_date === undefined || body.event_date === null || isDateString(body.event_date) ? null : 'event_date must be a valid date',
  );
}

/** The template fields shared by match and tournament templates. */
function validateCommonTemplate(t: Record<string, unknown>, label: string): string | null {
  return firstError(
    stringField(t, 'description', 1000, label), stringField(t, 'game_id', 100, label), stringField(t, 'livestream_link', 500, label),
    stringField(t, 'event_image_url', 500, label),
    t.ruleset !== undefined && !RULESETS.includes(t.ruleset as string) ? `${label}.ruleset must be casual or competitive` : null,
    boolField(t, 'stats_enabled', label), boolField(t, 'player_notifications', label),
  );
}

function validateMatchTemplate(m: unknown, label: string, requireStart: boolean): string | null {
  if (!isObject(m)) return `${label} is required`;
  if (requireStart && !isDateString(m.start_date)) return `${label}.start_date is required and must be a valid date`;
  if (!requireStart && m.start_date !== undefined) return `${label}.start_date is computed by the generator`;
  if (m.maps !== undefined && (!Array.isArray(m.maps) || !m.maps.every((x) => typeof x === 'string'))) return `${label}.maps must be an array of map ids`;
  if (m.rounds !== undefined) return `${label}.rounds is not accepted: a match plays one game per map, so choose the maps instead`;
  if (m.rules !== undefined && !RULESETS.includes(m.rules as string)) return `${label}.rules must be casual or competitive`;
  return firstError(
    stringField(m, 'name', 255, label), stringField(m, 'description', 1000, label), stringField(m, 'game_id', 100, label),
    stringField(m, 'livestream_link', 500, label), stringField(m, 'event_image_url', 500, label),
    boolField(m, 'stats_enabled', label), boolField(m, 'player_notifications', label),
  );
}

function validateTournamentTemplate(t: unknown, label: string, requireName: boolean): string | null {
  if (!isObject(t)) return `${label} is required`;
  if (requireName && (typeof t.name !== 'string' || t.name.trim() === '' || t.name.length > 255)) return `${label}.name is required (at most 255 characters)`;
  if (t.start_time !== undefined && t.start_time !== null && !isDateString(t.start_time)) return `${label}.start_time must be a valid date`;
  if (t.rounds_per_match !== undefined && (typeof t.rounds_per_match !== 'number' || !Number.isInteger(t.rounds_per_match) || t.rounds_per_match < 1 || t.rounds_per_match > 9)) {
    return `${label}.rounds_per_match must be an integer from 1 to 9`;
  }
  return firstError(validateCommonTemplate(t, label), stringField(t, 'game_mode_id', 100, label));
}

/** POST /:id/events/match */
export function validateCreateMatchBody(body: Record<string, unknown>): string | null {
  return firstError(validatePlacementBody(body), validateEntrantIds(body.entrant_ids), validateMatchTemplate(body.match, 'match', true));
}

/** POST /:id/events/tournament */
export function validateCreateTournamentBody(body: Record<string, unknown>): string | null {
  if (!BRACKET_FORMATS.includes(body.format as string)) return `format must be one of: ${BRACKET_FORMATS.join(', ')}`;
  if (body.seed_order !== undefined && (!Array.isArray(body.seed_order) || !body.seed_order.every((id) => typeof id === 'string'))) return 'seed_order must be an array of entrant ids';
  return firstError(validatePlacementBody(body), validateEntrantIds(body.entrant_ids), validateTournamentTemplate(body.tournament, 'tournament', true));
}

/** POST /:id/events/planned */
export function validateCreatePlannedBody(body: Record<string, unknown>): string | null {
  if (!(EVENT_ROLES as readonly unknown[]).includes(body.role)) return `role is required and must be one of: ${EVENT_ROLES.join(', ')}`;
  const rule = body.seeding_rule;
  if (!isObject(rule)) return 'seeding_rule is required';
  if (!SEEDING_SOURCES.includes(rule.source as string)) return 'seeding_rule.source must be stage or season';
  if (rule.source === 'stage' && (typeof rule.stage_id !== 'string' || rule.stage_id === '')) return 'seeding_rule.stage_id is required when the source is a stage';
  if (typeof rule.top !== 'number' || !Number.isInteger(rule.top) || rule.top < 2 || rule.top > 256) return 'seeding_rule.top must be an integer from 2 to 256';
  if (rule.per_division !== undefined && typeof rule.per_division !== 'boolean') return 'seeding_rule.per_division must be a boolean';
  if (!BRACKET_FORMATS.includes(rule.format as string)) return `seeding_rule.format must be one of: ${BRACKET_FORMATS.join(', ')}`;
  return firstError(validatePlacementBody(body), validateTournamentTemplate(rule.template, 'seeding_rule.template', true));
}

function validateGeneratorSchedule(cfg: Record<string, unknown>): string | null {
  if (typeof cfg.start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cfg.start_date)) return 'config.start_date must be YYYY-MM-DD';
  if (cfg.timezone !== undefined && typeof cfg.timezone !== 'string') return 'config.timezone must be an IANA timezone name';
  if (cfg.stage_id !== undefined && cfg.stage_id !== null && typeof cfg.stage_id !== 'string') return 'config.stage_id must be a string or null';
  if (cfg.points_multiplier !== undefined) {
    const m = validatePointsMultiplier(cfg.points_multiplier);
    if (m) return m;
  }
  return validateEntrantIds(cfg.entrant_ids, 'config.entrant_ids');
}

/** The round robin config (also the `config` of a commit body). */
export function validateRoundRobinConfig(cfg: unknown): string | null {
  if (!isObject(cfg)) return 'config is required';
  if (typeof cfg.double !== 'boolean') return 'config.double must be a boolean';
  if (!DIVISION_MODES.includes(cfg.divisions as string)) return `config.divisions must be one of: ${DIVISION_MODES.join(', ')}`;
  if (!Array.isArray(cfg.match_days) || cfg.match_days.length === 0 || !cfg.match_days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return 'config.match_days must list weekdays 0 (Sunday) to 6 (Saturday)';
  }
  if (!Array.isArray(cfg.time_slots) || cfg.time_slots.length === 0 || !cfg.time_slots.every((t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) {
    return 'config.time_slots must list times as HH:MM';
  }
  for (const key of ['concurrent_matches', 'max_per_entrant_per_week']) {
    const v = cfg[key];
    if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 100)) return `config.${key} must be an integer from 1 to 100`;
  }
  if (cfg.skip_dates !== undefined && (!Array.isArray(cfg.skip_dates) || !cfg.skip_dates.every((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))) {
    return 'config.skip_dates must list dates as YYYY-MM-DD';
  }
  const match = cfg.match === undefined ? {} : cfg.match;
  if (isObject(match) && match.name_template !== undefined && typeof match.name_template !== 'string') return 'config.match.name_template must be a string';
  return firstError(validateGeneratorSchedule(cfg), validateMatchTemplate(match, 'config.match', false));
}

/** The race calendar config (also the `config` of a commit body). */
export function validateRaceCalendarConfig(cfg: unknown): string | null {
  if (!isObject(cfg)) return 'config is required';
  if (typeof cfg.count !== 'number' || !Number.isInteger(cfg.count) || cfg.count < 1 || cfg.count > 200) return 'config.count must be an integer from 1 to 200';
  if (typeof cfg.interval_days !== 'number' || !Number.isInteger(cfg.interval_days) || cfg.interval_days < 1 || cfg.interval_days > 366) return 'config.interval_days must be an integer from 1 to 366';
  if (typeof cfg.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(cfg.time)) return 'config.time must be HH:MM';
  if (cfg.name_template !== undefined && typeof cfg.name_template !== 'string') return 'config.name_template must be a string';
  if (cfg.event_kind !== 'match' && cfg.event_kind !== 'tournament') return 'config.event_kind must be match or tournament';
  if (cfg.match !== undefined) {
    const m = validateMatchTemplate(cfg.match, 'config.match', false);
    if (m) return m;
  }
  if (cfg.tournament !== undefined) {
    const t = validateTournamentTemplate(cfg.tournament, 'config.tournament', false);
    if (t) return t;
    const format = (cfg.tournament as Record<string, unknown>).format;
    if (format !== undefined && !BRACKET_FORMATS.includes(format as string)) return `config.tournament.format must be one of: ${BRACKET_FORMATS.join(', ')}`;
  }
  return validateGeneratorSchedule(cfg);
}

/** Edited preview fixtures sent with a commit. */
export function validateFixtures(fixtures: unknown): string | null {
  if (fixtures === undefined) return null;
  if (!Array.isArray(fixtures)) return 'fixtures must be an array';
  if (fixtures.length > MAX_FIXTURES) return `fixtures may hold at most ${MAX_FIXTURES} entries`;
  for (const [i, f] of fixtures.entries()) {
    if (!isObject(f)) return `fixtures[${i}] must be an object`;
    if (typeof f.week !== 'number' || !Number.isInteger(f.week) || f.week < 1 || f.week > 999) return `fixtures[${i}].week must be a positive integer`;
    if (!isDateString(f.start)) return `fixtures[${i}].start must be a valid date`;
    if (typeof f.name !== 'string' || f.name.trim() === '' || f.name.length > 255) return `fixtures[${i}].name is required (at most 255 characters)`;
    if (!Array.isArray(f.entrant_ids) || f.entrant_ids.length < 2 || !f.entrant_ids.every((id) => typeof id === 'string')) return `fixtures[${i}].entrant_ids must list at least 2 entrants`;
  }
  return null;
}

/** POST /:id/entrants/:entrantId/withdraw */
export function validateWithdrawBody(body: Record<string, unknown>): string | null {
  return body.unplayed === 'cancel' || body.unplayed === 'forfeit' ? null : 'unplayed must be cancel or forfeit';
}
