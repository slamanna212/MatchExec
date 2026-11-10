/**
 * Series ("seasons") API contract shared by the server (src/lib/series, src/server/routes/series*.ts), the client
 * (src/components/series) and the Discord bot / scheduler. See docs/series-plan.md.
 *
 * Timestamps are ISO strings on the wire. Request bodies use snake_case like the rest of the series API.
 */

// ─── enums ───────────────────────────────────────────────────────────────────

export type SeriesStatus = 'created' | 'registration' | 'active' | 'complete' | 'cancelled';
export type SeriesEntrantType = 'solo' | 'team';
export type SeriesScoringType = 'Normal' | 'FFA' | 'Position';
export type SeriesEntrantStatus = 'pending' | 'active' | 'withdrawn';
export type SeriesMemberRole = 'captain' | 'player' | 'sub';
export type SeriesStageStatus = 'upcoming' | 'active' | 'complete';
export type SeriesEventRole = 'regular' | 'stage_playoff' | 'season_playoff' | 'exhibition';
export type SeriesEventStatus = 'planned' | 'live';
export type SeriesBatchKind = 'round_robin' | 'race_calendar';
export type SeriesStandingsMode = 'head_to_head' | 'points';
export type SeriesTiebreaker = 'match_wins' | 'win_pct' | 'points' | 'map_diff' | 'maps_won' | 'head_to_head' | 'event_wins' | 'best_finishes';
export type SeriesUpdateKind = 'registration_open' | 'weekly_schedule' | 'standings' | 'playoff_seeded' | 'champion';
export type TournamentBracketFormat = 'single-elimination' | 'double-elimination' | 'cumulative-points';

// ─── config blobs (jsonb columns on `series`) ────────────────────────────────

/**
 * `series.scoring_config` (also `series_stages.scoring_config` as a per-stage override; stage values win key by key).
 * A config without `mode` is a legacy config and is scored exactly as before (points per player via the legacy keys).
 */
export interface SeriesScoringConfig {
  mode?: SeriesStandingsMode;

  // head_to_head: W-L-T record from 2-entrant matches; optional league points per result.
  win_points?: number;
  loss_points?: number;
  tie_points?: number;
  /** Ordered tiebreakers. Default head_to_head: ['match_wins','map_diff','head_to_head','maps_won']; points: ['points','event_wins','best_finishes']. */
  tiebreakers?: SeriesTiebreaker[];

  // points: championship points per finishing position in match events (index 0 = 1st place).
  position_points?: number[];
  /** Ignore each entrant's N worst scoring events (0 = none). */
  drop_worst?: number;

  // legacy keys (still honoured; also used by `points` mode for tournament placements and FFA/Normal match events)
  match_win_points?: number;
  match_loss_points?: number;
  tournament_position_points?: number[];
  /** Position-mode match events use their own points_awarded spread instead of position_points/match_* points. Default true. */
  position_event_use_event_spread?: boolean;
}

/** `series.match_defaults`: prefills for matches/tournaments the series creates. */
export interface SeriesMatchDefaults {
  /** Maps of the matches the series creates: one game per map (the number of games is the number of maps). */
  maps?: string[];
  rules?: 'casual' | 'competitive';
  /** Maps played in each tournament match (tournaments pick them from the game's pool). */
  rounds_per_match?: number;
  stats_enabled?: boolean;
  player_notifications?: boolean;
  announcements?: Array<{ type: string; time: number }>;
  livestream_link?: string | null;
  event_image_url?: string | null;
}

/**
 * `series.discord_config`: which series posts are sent. Routing: registration -> `send_announcements` channels,
 * playoff/champion -> `send_match_start` ("Live Updates"), weekly schedule/standings -> `send_series_updates`.
 */
export interface SeriesDiscordConfig {
  weekly_schedule?: boolean;   // default true
  standings_posts?: boolean;   // default true
  schedule_lead_hours?: number; // default 48: post a week's schedule this long before its first match
  registration_posts?: boolean; // default true
}

// ─── rows / DTOs ─────────────────────────────────────────────────────────────

export interface SeriesDto {
  id: string;
  name: string;
  description: string | null;
  status: SeriesStatus;
  entrant_type: SeriesEntrantType;
  roster_min: number | null;
  roster_max: number | null;
  /** null = legacy series without a scoring-type restriction. */
  scoring_type: SeriesScoringType | null;
  /** Primary/default game. */
  game_id: string | null;
  /** Allowed games (all share scoring_type). Empty means "just game_id" (or anything for a legacy series without game_id). */
  game_ids: string[];
  game_mode_id: string | null;
  scoring_config: SeriesScoringConfig | null;
  match_defaults: SeriesMatchDefaults | null;
  discord_config: SeriesDiscordConfig | null;
  previous_series_id: string | null;
  start_date: string | null;
  end_date: string | null;
  event_image_url: string | null;
  guild_id: string | null;
  channel_id: string | null;
  announcements: boolean;
  player_notifications: boolean;
  livestream_link: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeriesEntrantMemberDto {
  id: string;
  entrant_id: string;
  series_id: string;
  user_id: string;
  discord_user_id: string | null;
  username: string;
  role: SeriesMemberRole;
  joined_at: string;
  /** Set when the player left the roster; history is kept. */
  left_at: string | null;
  avatar_url?: string | null;
}

export interface SeriesEntrantDto {
  id: string;
  series_id: string;
  name: string;
  tag: string | null;
  color: string | null;
  logo_url: string | null;
  division: string | null;
  seed: number | null;
  status: SeriesEntrantStatus;
  source_entrant_id: string | null;
  created_at: string;
  updated_at: string;
  /** Current roster (left_at null) unless the request asked for history (?include_left=true). */
  members: SeriesEntrantMemberDto[];
}

export interface SeriesStageDto {
  id: string;
  series_id: string;
  name: string;
  stage_order: number;
  status: SeriesStageStatus;
  counts_toward_season: boolean;
  scoring_config: SeriesScoringConfig | null;
  created_at: string;
  updated_at: string;
}

/** A playoff placeholder's rule; the tournament is created when it is seeded. */
export interface SeriesSeedingRule {
  source: 'stage' | 'season';
  /** Required when source = 'stage'. */
  stage_id?: string | null;
  /** How many entrants qualify (overall, or per division when per_division). */
  top: number;
  per_division?: boolean;
  format: TournamentBracketFormat;
  template: SeriesTournamentTemplate;
}

export interface SeriesTournamentTemplate {
  name: string;
  description?: string | null;
  game_id?: string | null;       // default: series.game_id
  game_mode_id?: string | null;  // default: series.game_mode_id
  rounds_per_match?: number;     // default: match_defaults.rounds_per_match ?? 3
  ruleset?: 'casual' | 'competitive';
  /** ISO datetime of the first round. */
  start_time?: string | null;
  stats_enabled?: boolean;
  player_notifications?: boolean;
  livestream_link?: string | null;
  event_image_url?: string | null;
}

export interface SeriesMatchTemplate {
  name?: string;                 // default "<A> vs <B>" (2 entrants) or "<series name> - Round <n>"
  description?: string | null;
  game_id?: string | null;       // default series.game_id
  maps?: string[];               // default match_defaults.maps; one game per map
  rules?: 'casual' | 'competitive';
  /** ISO datetime. Required for single matches; generators compute it. */
  start_date?: string;
  livestream_link?: string | null;
  event_image_url?: string | null;
  stats_enabled?: boolean;
  player_notifications?: boolean;
}

/** GET /api/series/:id/events item (extends the existing SeriesEventDetail read model). */
export interface SeriesEventDto {
  id: string;
  series_id: string;
  stage_id: string | null;
  event_type: 'match' | 'tournament';
  match_id: string | null;
  tournament_id: string | null;
  event_order: number;
  event_date: string | null;
  points_multiplier: number;
  role: SeriesEventRole;
  week: number | null;
  counts_for_standings: boolean;
  batch_id: string | null;
  status: SeriesEventStatus;
  /** null = all active entrants. */
  entrant_ids: string[] | null;
  seeding_rule: SeriesSeedingRule | null;
  // read-model extras (joined from the match / tournament; seeding_rule.template.name for planned events)
  name: string | null;
  target_status: string | null;
  start_date: string | null;
  game_id: string | null;
  game_name: string | null;
  game_icon: string | null;
  game_color: string | null;
  /** For 2-entrant matches: the two entrants in team order. */
  entrants?: Array<{ entrant_id: string; name: string; color: string | null; score?: number | null; is_winner?: boolean }>;
}

// ─── request bodies ──────────────────────────────────────────────────────────

export interface SeriesEventPlacementInput {
  stage_id?: string | null;
  role?: SeriesEventRole;
  week?: number | null;
  points_multiplier?: number;
  /** Default: true for regular/exhibition? -> regular true, exhibition false, playoffs false. */
  counts_for_standings?: boolean;
  event_date?: string | null;
}

/** POST /api/series/:id/events/match */
export interface CreateSeriesMatchInput extends SeriesEventPlacementInput {
  /** Normal: 2..16 entrants. FFA/Position: any number; null/omitted = all active entrants. */
  entrant_ids?: string[] | null;
  match: SeriesMatchTemplate & { start_date: string };
}

/** POST /api/series/:id/events/tournament */
export interface CreateSeriesTournamentInput extends SeriesEventPlacementInput {
  entrant_ids?: string[] | null;
  /** Entrant ids in seed order (1st = top seed). Default: entrant.seed, then name. */
  seed_order?: string[];
  format: TournamentBracketFormat;
  tournament: SeriesTournamentTemplate;
}

/** POST /api/series/:id/events/planned (playoff placeholder) */
export interface CreateSeriesPlannedEventInput extends SeriesEventPlacementInput {
  role: SeriesEventRole;
  seeding_rule: SeriesSeedingRule;
}

/** POST /api/series/:id/events (attach an existing match/tournament; the original flow, now with placement fields) */
export interface AttachSeriesEventInput extends SeriesEventPlacementInput {
  event_type: 'match' | 'tournament';
  match_id?: string;
  tournament_id?: string;
  event_order?: number;
}

export interface CreateSeriesEntrantInput {
  name: string;
  tag?: string | null;
  color?: string | null;
  logo_url?: string | null;
  division?: string | null;
  seed?: number | null;
  status?: SeriesEntrantStatus;
  members?: Array<{ user_id: string; discord_user_id?: string | null; username: string; avatar_url?: string | null; role?: SeriesMemberRole }>;
}

export interface CopySeriesEntrantsInput {
  from_series_id: string;
  /** Default: all non-withdrawn entrants of the source series. */
  entrant_ids?: string[];
  include_members?: boolean; // default true
}

export interface WithdrawEntrantInput {
  /** What happens to the entrant's unplayed matches: cancelled, or completed as a forfeit win for the opponent. */
  unplayed: 'cancel' | 'forfeit';
}

/** Generators. Times are wall-clock in `timezone` (IANA, default the server's TZ). */
export interface RoundRobinConfig {
  stage_id?: string | null;
  entrant_ids?: string[] | null;     // default all active entrants
  double: boolean;                   // play everyone twice (home/away swapped)
  /** 'none' = everyone plays everyone; 'within' = only inside divisions; 'within_and_cross' = inside divisions twice-weighted + cross once. */
  divisions: 'none' | 'within' | 'within_and_cross';
  start_date: string;                // YYYY-MM-DD, first possible match day
  match_days: number[];              // 0 = Sunday .. 6 = Saturday
  time_slots: string[];              // 'HH:MM'
  timezone?: string;
  /** Matches that can run in the same time slot (default 1). */
  concurrent_matches?: number;
  /** Max matches per entrant per week (default 1). */
  max_per_entrant_per_week?: number;
  skip_dates?: string[];             // YYYY-MM-DD
  points_multiplier?: number;
  match: Omit<SeriesMatchTemplate, 'start_date' | 'name'> & { name_template?: string }; // '{home} vs {away}'
}

export interface RaceCalendarConfig {
  stage_id?: string | null;
  entrant_ids?: string[] | null;
  count: number;
  start_date: string;                // YYYY-MM-DD
  interval_days: number;
  time: string;                      // 'HH:MM'
  timezone?: string;
  name_template?: string;            // 'Round {n}'
  points_multiplier?: number;
  event_kind: 'match' | 'tournament';
  match?: Omit<SeriesMatchTemplate, 'start_date' | 'name'>;
  /** event_kind = tournament: usually cumulative-points (a race weekend). */
  tournament?: Omit<SeriesTournamentTemplate, 'name' | 'start_time'> & { format?: TournamentBracketFormat };
}

export interface GeneratedFixture {
  week: number;
  start: string;                     // ISO
  name: string;
  /** Round robin: [home, away]. Race calendar: all participating entrant ids. */
  entrant_ids: string[];
}

export interface GeneratorPreview {
  fixtures: GeneratedFixture[];
  /** Round robin: per week, entrants without a fixture. */
  byes: Array<{ week: number; entrant_ids: string[] }>;
  warnings: string[];
}

/** POST .../generators/<kind> commit body: the config plus optionally the (edited) preview fixtures to create verbatim. */
export interface GeneratorCommitInput<C> {
  config: C;
  fixtures?: GeneratedFixture[];
}

// ─── standings ───────────────────────────────────────────────────────────────

export interface SeriesStandingEventPoints {
  series_event_id: string;
  /** Points from this event after the multiplier; null when the entrant didn't take part. */
  points: number | null;
  dropped?: boolean;
}

export interface SeriesStandingRow {
  rank: number;
  /** Entrant id (entrant view), or null for an implicit entrant in a legacy series without entrants / the individual view. */
  entrant_id: string | null;
  /** Stable key: entrant id, or the player key (discord id, else user id) in individual / legacy rows. */
  key: string;
  name: string;
  tag?: string | null;
  color?: string | null;
  division?: string | null;
  /** Individual view: the entrant the player raced for (latest). */
  entrant_name?: string | null;
  total_points: number;
  events_played: number;
  // head_to_head
  match_wins?: number;
  match_losses?: number;
  match_ties?: number;
  map_wins?: number;
  map_losses?: number;
  map_ties?: number;
  map_diff?: number;
  // points
  event_wins?: number;
  podiums?: number;
  events: SeriesStandingEventPoints[];
  /** Back-compat for old clients: username = name, user_id = key. */
  username: string;
  user_id: string;
}

export interface SeriesStandingsResponse {
  series_id: string;
  series_name: string;
  mode: SeriesStandingsMode;
  scope: { type: 'season' } | { type: 'stage'; stage_id: string };
  view: 'entrant' | 'individual';
  /** Events in scope, in (stage_order, event_order) order; only counting events. */
  events: Array<{ id: string; name: string | null; event_order: number; stage_id: string | null }>;
  divisions: string[];
  /** Back-compat alias of rows. */
  standings: SeriesStandingRow[];
  rows: SeriesStandingRow[];
}

export interface SeriesChampionDto {
  entrant_id: string | null;
  name: string;
  /** 'season_playoff' when decided by the season playoff tournament, else 'standings'. */
  source: 'season_playoff' | 'standings';
}

export interface SeedPreviewResponse {
  qualifiers: Array<{ entrant_id: string; name: string; seed: number; rank: number; division: string | null }>;
  /** Everything worth a look before seeding (includes `blockers`). */
  warnings: string[];
  /** The part of `warnings` that stops seeding unless it is forced: the source stage / season is not complete yet. */
  blockers: string[];
}

/** Payloads of `discord_series_update_queue` rows by kind (the bot re-reads live data; these are hints). */
export interface SeriesUpdatePayload {
  week?: number;
  /** `weekly_schedule` / `standings`: set when `week` is an ISO calendar week (events without a season week), not a season week. */
  calendar_year?: number;
  /** `standings`: earlier weeks that still have unplayed events when this table was posted (e.g. ["Week 2"]). */
  pending_weeks?: string[];
  stage_id?: string | null;
  event_id?: string;
  tournament_id?: string;
  /** `playoff_seeded`: qualifiers in seed order (optional; the bot falls back to the tournament's teams). */
  qualifiers?: Array<{ seed: number; name: string; entrant_id?: string | null }>;
}
