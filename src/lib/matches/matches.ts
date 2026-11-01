/** The `matches` table: reads for the API / bot / scheduler, creation, editing, deletion and the status compare-and-set. */
import { and, asc, desc, eq, getTableColumns, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import {
  gameMaps, gameModes, games, matchParticipants, matches, series, seriesEvents, tournamentMatches, tournaments,
} from '../../../lib/db/schema';
import type { PositionScoringConfig } from '../../../lib/db/schema/types';
import type { Announcement } from '../../../lib/db/schema/types';
import { newMatchId } from './ids';

export type MatchRow = typeof matches.$inferSelect;
export type MatchStatus = MatchRow['status'];

const matchColumns = getTableColumns(matches);

// ─── Single-match reads ──────────────────────────────────────────────────────

export async function getMatch(ex: Executor, matchId: string): Promise<MatchRow | undefined> {
  const [row] = await ex.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  return row;
}

export async function matchExists(ex: Executor, matchId: string): Promise<boolean> {
  const [row] = await ex.select({ id: matches.id }).from(matches).where(eq(matches.id, matchId)).limit(1);
  return !!row;
}

export async function getMatchStatus(ex: Executor, matchId: string): Promise<MatchStatus | undefined> {
  const [row] = await ex.select({ status: matches.status }).from(matches).where(eq(matches.id, matchId)).limit(1);
  return row?.status;
}

export async function getMatchName(ex: Executor, matchId: string): Promise<string | undefined> {
  const [row] = await ex.select({ name: matches.name }).from(matches).where(eq(matches.id, matchId)).limit(1);
  return row?.name;
}

export type MatchWithGame = MatchRow & {
  game_name: string | null;
  game_icon: string | null;
  game_color: string | null;
  map_codes_supported: boolean | null;
};

/** `matches.*` plus the game's display fields (game_name / game_icon / game_color / map_codes_supported). */
export async function getMatchWithGame(ex: Executor, matchId: string): Promise<MatchWithGame | undefined> {
  const [row] = await ex
    .select({
      ...matchColumns,
      game_name: games.name, game_icon: games.icon_url, game_color: games.color, map_codes_supported: games.map_codes_supported,
    })
    .from(matches).leftJoin(games, eq(matches.game_id, games.id))
    .where(eq(matches.id, matchId)).limit(1);
  return row;
}

export type MatchDetail = MatchWithGame & {
  tournament_allow_match_editing: boolean | null;
  scoring_type: string | null;
  setup_components: string[] | null;
};

/** What `GET /api/matches/:id` returns: match + game display + the tournament's edit flag + the mode's scoring/setup config. */
export async function getMatchDetail(ex: Executor, matchId: string): Promise<MatchDetail | undefined> {
  const [row] = await ex
    .select({
      ...matchColumns,
      game_name: games.name, game_icon: games.icon_url, game_color: games.color, map_codes_supported: games.map_codes_supported,
      tournament_allow_match_editing: tournaments.allow_match_editing,
      scoring_type: gameModes.scoring_type, setup_components: gameModes.setup_components,
    })
    .from(matches)
    .leftJoin(games, eq(matches.game_id, games.id))
    .leftJoin(tournaments, eq(matches.tournament_id, tournaments.id))
    .leftJoin(gameModes, and(eq(gameModes.id, matches.mode_id), eq(gameModes.game_id, matches.game_id)))
    .where(eq(matches.id, matchId)).limit(1);
  return row as MatchDetail | undefined;
}

/** Match row + whether its tournament allows editing (null for standalone matches), for the PUT permission check. */
export async function getMatchEditContext(ex: Executor, matchId: string) {
  const [row] = await ex
    .select({ id: matches.id, status: matches.status, tournament_id: matches.tournament_id, tournament_allow_match_editing: tournaments.allow_match_editing })
    .from(matches).leftJoin(tournaments, eq(matches.tournament_id, tournaments.id))
    .where(eq(matches.id, matchId)).limit(1);
  return row;
}

/** The mode's scoring type for a match ('Normal' when the mode is unknown). */
export async function getMatchScoringType(ex: Executor, matchId: string): Promise<'Normal' | 'FFA' | 'Position'> {
  const [row] = await ex.select({ scoring_type: gameModes.scoring_type })
    .from(matches)
    .leftJoin(gameModes, and(eq(gameModes.id, matches.mode_id), eq(gameModes.game_id, matches.game_id)))
    .where(eq(matches.id, matchId)).limit(1);
  const t = row?.scoring_type;
  return t === 'FFA' || t === 'Position' ? t : 'Normal';
}

// ─── Listing ─────────────────────────────────────────────────────────────────

export interface ListMatchesOptions {
  /** Empty = everything except completed matches (the dashboard default). A single `complete` = history. */
  statuses?: string[];
  excludeTournament?: boolean;
  limit?: number | null;
  offset?: number;
}

export type MatchListRow = Omit<MatchRow, 'maps'> & {
  maps: unknown[];
  game_name: string | null;
  game_icon: string | null;
  game_color: string | null;
  map_codes_supported: boolean | null;
  tournament_name: string | null;
  map_name: string | null;
  participant_count: number;
  series: Array<{ id: string; name: string }>;
};

export async function listMatches(ex: Executor, opts: ListMatchesOptions = {}): Promise<MatchListRow[]> {
  const statuses = opts.statuses ?? [];
  const tournamentFilter = opts.excludeTournament ? isNull(matches.tournament_id) : undefined;
  let statusFilter;
  if (statuses.length > 1) statusFilter = inArray(matches.status, statuses as MatchStatus[]);
  else if (statuses[0] === 'complete') statusFilter = eq(matches.status, 'complete');
  else statusFilter = ne(matches.status, 'complete');

  const participantCount = sql<number>`(SELECT count(*) FROM ${matchParticipants} WHERE ${matchParticipants.match_id} = ${matches.id})`.mapWith(Number);
  const mapName = sql<string | null>`(SELECT ${gameMaps.name} FROM ${gameMaps} WHERE ${gameMaps.id} = ${matches.map_id} AND ${gameMaps.game_id} = ${matches.game_id} LIMIT 1)`;

  let query = ex
    .select({
      ...matchColumns,
      // The list shows the game's signup cap and the bracket position from tournament_matches (same as before).
      max_participants: games.max_signups,
      tournament_round: tournamentMatches.round,
      tournament_bracket_type: tournamentMatches.bracket_type,
      game_name: games.name, game_icon: games.icon_url, game_color: games.color, map_codes_supported: games.map_codes_supported,
      tournament_name: tournaments.name,
      map_name: mapName,
      participant_count: participantCount,
    })
    .from(matches)
    .leftJoin(games, eq(matches.game_id, games.id))
    .leftJoin(tournamentMatches, eq(matches.id, tournamentMatches.match_id))
    .leftJoin(tournaments, eq(tournamentMatches.tournament_id, tournaments.id))
    .where(and(statusFilter, tournamentFilter))
    .orderBy(desc(matches.updated_at), asc(matches.id))
    .$dynamic();
  if (opts.limit !== null && opts.limit !== undefined) query = query.limit(opts.limit).offset(opts.offset ?? 0);
  const rows = await query;

  const seriesByMatch = await listSeriesRefsForMatches(ex, rows);
  return rows.map((row) => {
    const maps = Array.isArray(row.maps) ? row.maps : row.map_id ? [row.map_id] : [];
    return { ...row, maps, map_codes: row.map_codes ?? {}, series: seriesByMatch.get(row.id) ?? [] } as MatchListRow;
  });
}

/** Series each match belongs to: directly, or through the series its tournament is part of. */
async function listSeriesRefsForMatches(
  ex: Executor,
  rows: Array<{ id: string; tournament_id: string | null }>,
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const out = new Map<string, Array<{ id: string; name: string }>>();
  if (rows.length === 0) return out;
  const matchIds = rows.map((r) => r.id);
  const tournamentIds = [...new Set(rows.map((r) => r.tournament_id).filter((t): t is string => !!t))];
  const events = await ex
    .select({ match_id: seriesEvents.match_id, tournament_id: seriesEvents.tournament_id, id: series.id, name: series.name })
    .from(seriesEvents).innerJoin(series, eq(series.id, seriesEvents.series_id))
    .where(or(inArray(seriesEvents.match_id, matchIds), tournamentIds.length ? inArray(seriesEvents.tournament_id, tournamentIds) : undefined))
    .orderBy(asc(series.id));
  for (const row of rows) {
    const refs = new Map<string, { id: string; name: string }>();
    for (const e of events) {
      if (e.match_id === row.id || (row.tournament_id && e.tournament_id === row.tournament_id)) refs.set(e.id, { id: e.id, name: e.name });
    }
    out.set(row.id, [...refs.values()]);
  }
  return out;
}

/** Matches of a tournament (id only), for fan-out like status updates. */
export async function listTournamentMatchIds(ex: Executor, tournamentId: string): Promise<string[]> {
  const rows = await ex.select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, tournamentId)).orderBy(asc(matches.id));
  return rows.map((r) => r.id);
}

// ─── Create / update / delete ────────────────────────────────────────────────

export interface CreateMatchInput {
  name: string;
  description?: string | null;
  gameId: string;
  modeId: string | null;
  maxParticipants: number;
  guildId: string;
  channelId: string;
  startDate: Date;
  rules?: string | null;
  rounds?: number | null;
  maps?: string[] | null;
  livestreamLink?: string | null;
  eventImageUrl?: string | null;
  playerNotifications?: boolean;
  announcements?: Announcement[] | null;
  statsEnabled?: boolean;
  teamCount?: number | null;
  positionScoringOverride?: Record<string, number> | null;
}

export async function createMatch(ex: Executor, input: CreateMatchInput & { id?: string }): Promise<MatchRow> {
  const [row] = await ex.insert(matches).values({
    id: input.id ?? newMatchId(),
    name: input.name,
    description: input.description || null,
    game_id: input.gameId,
    mode_id: input.modeId,
    guild_id: input.guildId,
    channel_id: input.channelId,
    max_participants: input.maxParticipants,
    status: 'created',
    start_date: input.startDate,
    start_time: input.startDate,
    rules: input.rules || null,
    rounds: input.rounds || null,
    maps: input.maps && input.maps.length > 0 ? input.maps : null,
    livestream_link: input.livestreamLink || null,
    event_image_url: input.eventImageUrl || null,
    player_notifications: input.playerNotifications ?? true,
    announcements: input.announcements && input.announcements.length > 0 ? input.announcements : null,
    match_format: input.rules || 'casual',
    stats_enabled: !!input.statsEnabled,
    ...(input.teamCount ? { team_count: input.teamCount } : {}),
    position_scoring_override: (input.positionScoringOverride as unknown as PositionScoringConfig | null) ?? null,
  }).returning();
  return row;
}

export interface UpdateMatchInput {
  name: string;
  description?: string | null;
  startDate?: Date | null;
  rules?: string | null;
  rounds?: number | null;
  livestreamLink?: string | null;
  maps?: unknown[] | null;
  statsEnabled: boolean;
  playerNotifications: boolean;
}

/** Edit the user-editable fields. Returns false when the match does not exist. */
export async function updateMatchDetails(ex: Executor, matchId: string, input: UpdateMatchInput): Promise<boolean> {
  const rows = await ex.update(matches).set({
    name: input.name,
    description: input.description || null,
    ...(input.startDate ? { start_date: input.startDate, start_time: input.startDate } : {}),
    rules: input.rules || null,
    rounds: input.rounds || null,
    livestream_link: input.livestreamLink || null,
    maps: input.maps && input.maps.length > 0 ? input.maps : null,
    stats_enabled: input.statsEnabled,
    player_notifications: input.playerNotifications,
  }).where(eq(matches.id, matchId)).returning({ id: matches.id });
  return rows.length > 0;
}

/** Delete a match. Child rows (games, placements, participants, teams, stats, series events, ...) cascade via FKs. */
export async function deleteMatch(ex: Executor, matchId: string): Promise<boolean> {
  const rows = await ex.delete(matches).where(eq(matches.id, matchId)).returning({ id: matches.id });
  return rows.length > 0;
}

export async function getMatchEventImage(ex: Executor, matchId: string): Promise<{ id: string; event_image_url: string | null } | undefined> {
  const [row] = await ex.select({ id: matches.id, event_image_url: matches.event_image_url }).from(matches).where(eq(matches.id, matchId)).limit(1);
  return row;
}

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * Compare-and-set the status: only flips when the row is still in `from`. Returns false when another request won.
 * `winnerTeam` is written only when completing (undefined leaves it alone).
 */
export async function casMatchStatus(
  ex: Executor,
  matchId: string,
  from: MatchStatus,
  to: MatchStatus,
  winnerTeam?: string | null,
): Promise<boolean> {
  const rows = await ex.update(matches)
    .set({ status: to, updated_at: new Date(), ...(winnerTeam !== undefined ? { winner_team: winnerTeam } : {}) })
    .where(and(eq(matches.id, matchId), eq(matches.status, from)))
    .returning({ id: matches.id });
  return rows.length > 0;
}

/** Scheduler / bot status moves that don't need the transition side effects (e.g. auto-advance). */
export async function setMatchStatus(ex: Executor, matchId: string, status: MatchStatus): Promise<void> {
  await ex.update(matches).set({ status, updated_at: new Date() }).where(eq(matches.id, matchId));
}

/** Bump updated_at so list pollers (ETag) notice participant-only changes. */
export async function touchMatch(ex: Executor, matchId: string): Promise<void> {
  await ex.update(matches).set({ updated_at: new Date() }).where(eq(matches.id, matchId));
}

// ─── Map codes ───────────────────────────────────────────────────────────────

export async function getMapCodes(ex: Executor, matchId: string): Promise<Record<string, string> | undefined> {
  const [row] = await ex.select({ map_codes: matches.map_codes }).from(matches).where(eq(matches.id, matchId)).limit(1);
  return row ? (row.map_codes ?? {}) : undefined;
}

export async function setMapCodes(ex: Executor, matchId: string, mapCodes: Record<string, string>): Promise<boolean> {
  const rows = await ex.update(matches).set({ map_codes: mapCodes, updated_at: new Date() }).where(eq(matches.id, matchId)).returning({ id: matches.id });
  return rows.length > 0;
}

// ─── Bot summaries ───────────────────────────────────────────────────────────

export interface MatchSummary { id: string; name: string; status: MatchStatus; start_date: Date; game_name: string }

/** Standalone matches that are open for signups or running, soonest first (`/matches`). */
export async function listActiveMatchSummaries(ex: Executor, limit = 5): Promise<MatchSummary[]> {
  return ex.select({ id: matches.id, name: matches.name, status: matches.status, start_date: matches.start_date, game_name: games.name })
    .from(matches).innerJoin(games, eq(matches.game_id, games.id))
    .where(and(inArray(matches.status, ['gather', 'assign', 'battle']), isNull(matches.tournament_id)))
    .orderBy(asc(matches.start_date), asc(matches.id)).limit(limit);
}

/** Active matches a Discord user is signed up for (`/mine`), soonest first. */
export async function listActiveMatchSignups(ex: Executor, discordUserId: string): Promise<MatchSummary[]> {
  return ex.select({ id: matches.id, name: matches.name, status: matches.status, start_date: matches.start_date, game_name: games.name })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.match_id, matches.id))
    .innerJoin(games, eq(matches.game_id, games.id))
    .where(and(eq(matchParticipants.discord_user_id, discordUserId), inArray(matches.status, ['gather', 'assign', 'battle'])))
    .orderBy(asc(matches.start_date), asc(matches.id));
}

/** Matches in these statuses that have a start date between `from` and `to` and still need to advance (scheduler). */
export async function listMatchesByStatus(ex: Executor, status: MatchStatus): Promise<MatchRow[]> {
  return ex.select().from(matches).where(eq(matches.status, status)).orderBy(asc(matches.start_time), asc(matches.id));
}

// ─── Scheduler queries ───────────────────────────────────────────────────────

type SchedulerMatch = Pick<MatchRow, 'id' | 'name' | 'start_date'>;
const schedulerColumns = { id: matches.id, name: matches.name, start_date: matches.start_date };

/** Matches in 'assign' whose start time has arrived. */
export async function listMatchesDueToStart(ex: Executor, now: Date): Promise<SchedulerMatch[]> {
  return ex.select(schedulerColumns).from(matches).where(and(eq(matches.status, 'assign'), lte(matches.start_date, now))).orderBy(asc(matches.start_date), asc(matches.id));
}

/** Matches that have been in 'battle' without an update since `before`. */
export async function listStaleBattleMatches(ex: Executor, before: Date): Promise<Array<Pick<MatchRow, 'id' | 'name'>>> {
  return ex.select({ id: matches.id, name: matches.name }).from(matches).where(and(eq(matches.status, 'battle'), lt(matches.updated_at, before))).orderBy(asc(matches.id));
}

/** Not-yet-started matches (any pre-complete status) for the match-reminder queue. */
export async function listUpcomingMatches(ex: Executor, now: Date): Promise<SchedulerMatch[]> {
  return ex.select(schedulerColumns).from(matches)
    .where(and(inArray(matches.status, ['created', 'gather', 'assign', 'battle']), gt(matches.start_date, now))).orderBy(asc(matches.start_date), asc(matches.id));
}

/** Matches with player notifications on that start at or before `threshold`. */
export async function listMatchesForPlayerReminders(ex: Executor, threshold: Date): Promise<SchedulerMatch[]> {
  return ex.select(schedulerColumns).from(matches)
    .where(and(eq(matches.player_notifications, true), inArray(matches.status, ['gather', 'assign', 'battle']), lte(matches.start_date, threshold)))
    .orderBy(asc(matches.start_date), asc(matches.id));
}

/** Matches with timed announcements configured that start no earlier than `since`. */
export async function listMatchesWithAnnouncements(ex: Executor, since: Date): Promise<Array<SchedulerMatch & { announcements: MatchRow['announcements'] }>> {
  return ex.select({ ...schedulerColumns, announcements: matches.announcements }).from(matches)
    .where(and(isNotNull(matches.announcements), inArray(matches.status, ['created', 'gather', 'assign']), gte(matches.start_date, since)))
    .orderBy(asc(matches.start_date), asc(matches.id));
}
