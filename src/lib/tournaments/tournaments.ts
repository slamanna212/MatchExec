/** `tournaments`: reads, list, create, edit, delete, status compare-and-set and the tournament-level row lock. */
import { and, asc, desc, eq, getTableColumns, inArray, ne, notInArray, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { games, matches, tournamentParticipants, tournaments } from '../../../lib/db/schema';
import type { AnnouncementConfig, PositionScoringConfig } from '../../../lib/db/schema/types';
import { genId } from '../matches/ids';
import { listSeriesRefsForTournaments } from '../series/refs';

export type TournamentRow = typeof tournaments.$inferSelect;
export type TournamentStatus = TournamentRow['status'];
export type TournamentFormat = TournamentRow['format'];

/** Domain error carrying the HTTP status the API should answer with. */
export class TournamentError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = 'TournamentError';
  }
}

export const newTournamentId = (): string => genId('tournament');

// Raw column refs for correlated subqueries: Drizzle renders bare columns unqualified inside a single-table select,
// which would bind to the subquery's own table.
const T_ID = sql.raw('"tournaments"."id"');
const T_STATUS = sql.raw('"tournaments"."status"');

/** Signed-up players while signups are open, players on teams afterwards (what the cards show). */
const participantCount = sql<number>`(case when ${T_STATUS} in ('created', 'gather')
  then (select count(distinct tp.user_id) from tournament_participants tp where tp.tournament_id = ${T_ID})
  else (select count(distinct ttm.user_id) from tournament_team_members ttm join tournament_teams tt on tt.id = ttm.team_id where tt.tournament_id = ${T_ID})
  end)`.mapWith(Number);

const hasBracket = sql<boolean>`exists (select 1 from tournament_matches tm where tm.tournament_id = ${T_ID})`.mapWith(Boolean);

const withGame = {
  ...getTableColumns(tournaments),
  game_name: games.name,
  game_icon: games.icon_url,
  game_color: games.color,
};

export type TournamentWithGame = TournamentRow & { game_name: string | null; game_icon: string | null; game_color: string | null };

// ─── reads ───────────────────────────────────────────────────────────────────

export async function getTournament(ex: Executor, id: string): Promise<TournamentRow | undefined> {
  const [row] = await ex.select().from(tournaments).where(eq(tournaments.id, id));
  return row;
}

export async function tournamentExists(ex: Executor, id: string): Promise<boolean> {
  const rows = await ex.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, id)).limit(1);
  return rows.length > 0;
}

export async function getTournamentName(ex: Executor, id: string): Promise<string | undefined> {
  const [row] = await ex.select({ name: tournaments.name }).from(tournaments).where(eq(tournaments.id, id));
  return row?.name;
}

/**
 * Take the tournament's row lock (`SELECT ... FOR UPDATE`). Every flow that reads the bracket and then writes (generate
 * matches, progress a round, transition, team assignment) calls this first inside its transaction, so overlapping
 * requests for ONE tournament run one after the other while other tournaments are unaffected. Lock order is always
 * tournament -> match, never the reverse.
 */
export async function lockTournament(ex: Executor, id: string): Promise<TournamentRow | undefined> {
  const [row] = await ex.select().from(tournaments).where(eq(tournaments.id, id)).for('update');
  return row;
}

/**
 * Lock every match of the tournament (ordered by id, so concurrent lockers can't deadlock). Bracket progression takes
 * this after the tournament lock: a result submission or rescore holding a match lock finishes first, and progression
 * then reads the committed winners; a rescore arriving later sees the newly generated round and is refused.
 */
export async function lockTournamentMatches(ex: Executor, id: string): Promise<void> {
  await ex.select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, id)).orderBy(asc(matches.id)).for('update');
}

export async function getTournamentWithGame(ex: Executor, id: string): Promise<TournamentWithGame | undefined> {
  const [row] = await ex.select(withGame).from(tournaments).leftJoin(games, eq(tournaments.game_id, games.id)).where(eq(tournaments.id, id));
  return row;
}

export type TournamentListRow = TournamentWithGame & {
  participant_count: number;
  has_bracket: boolean;
  series: Array<{ id: string; name: string }>;
};

export interface ListTournamentsOptions {
  /** `complete` lists finished tournaments; anything else lists every tournament EXCEPT finished ones. */
  status?: string | null;
  limit?: number | null;
  offset?: number;
}

export async function listTournaments(ex: Executor, opts: ListTournamentsOptions = {}): Promise<TournamentListRow[]> {
  const where = opts.status === 'complete' ? eq(tournaments.status, 'complete') : ne(tournaments.status, 'complete');
  const query = ex
    .select({ ...withGame, participant_count: participantCount, has_bracket: hasBracket })
    .from(tournaments).leftJoin(games, eq(tournaments.game_id, games.id))
    .where(where)
    .orderBy(desc(tournaments.updated_at), asc(tournaments.id));
  const rows = opts.limit != null ? await query.limit(opts.limit).offset(opts.offset ?? 0) : await query;
  const refs = await listSeriesRefsForTournaments(ex, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, series: refs.get(r.id) ?? [] }));
}

/** Detail read: tournament + game + the participant count (same CASE as the list). */
export async function getTournamentDetail(ex: Executor, id: string): Promise<(TournamentWithGame & { participant_count: number }) | undefined> {
  const [row] = await ex.select({ ...withGame, participant_count: participantCount })
    .from(tournaments).leftJoin(games, eq(tournaments.game_id, games.id)).where(eq(tournaments.id, id));
  return row;
}

export async function hasActiveMatches(ex: Executor, id: string): Promise<boolean> {
  const rows = await ex.select({ id: matches.id }).from(matches)
    .where(and(eq(matches.tournament_id, id), notInArray(matches.status, ['complete', 'cancelled']))).limit(1);
  return rows.length > 0;
}

export async function listTournamentMatchesIds(ex: Executor, id: string): Promise<string[]> {
  const rows = await ex.select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, id)).orderBy(asc(matches.id));
  return rows.map((r) => r.id);
}

export async function getTournamentEventImage(ex: Executor, id: string): Promise<{ id: string; event_image_url: string | null } | undefined> {
  const [row] = await ex.select({ id: tournaments.id, event_image_url: tournaments.event_image_url }).from(tournaments).where(eq(tournaments.id, id));
  return row;
}

/** Event image + name + game for a Discord embed (bot). */
export async function getTournamentAnnouncementContext(ex: Executor, id: string) {
  const [row] = await ex.select({
    id: tournaments.id, name: tournaments.name, description: tournaments.description, game_id: tournaments.game_id, max_participants: tournaments.max_participants,
    start_time: tournaments.start_time, start_date: tournaments.start_date, event_image_url: tournaments.event_image_url,
    format: tournaments.format, status: tournaments.status, game_mode_id: tournaments.game_mode_id,
    allow_player_team_selection: tournaments.allow_player_team_selection, livestream_link: tournaments.livestream_link,
    signup_config_id: tournaments.signup_config_id,
  }).from(tournaments).where(eq(tournaments.id, id));
  return row;
}

// ─── bot / dashboard summaries ───────────────────────────────────────────────

export interface TournamentSummary {
  id: string;
  name: string;
  status: TournamentStatus;
  start_date: Date | null;
  format: TournamentFormat;
  game_name: string;
}

const ACTIVE_STATUSES: TournamentStatus[] = ['gather', 'assign', 'battle'];
const summaryColumns = {
  id: tournaments.id, name: tournaments.name, status: tournaments.status, start_date: tournaments.start_date,
  format: tournaments.format, game_name: games.name,
};

/** Tournaments that are open for signups or running, soonest first (`/tournaments`). */
export async function listActiveTournamentSummaries(ex: Executor, limit = 5): Promise<TournamentSummary[]> {
  return ex.select(summaryColumns).from(tournaments).innerJoin(games, eq(tournaments.game_id, games.id))
    .where(inArray(tournaments.status, ACTIVE_STATUSES)).orderBy(asc(tournaments.start_date), asc(tournaments.id)).limit(limit);
}

/** Active tournaments a Discord user signed up for (`/mine`), soonest first. */
export async function listActiveTournamentSignups(ex: Executor, discordUserId: string): Promise<TournamentSummary[]> {
  return ex.select(summaryColumns).from(tournamentParticipants)
    .innerJoin(tournaments, eq(tournamentParticipants.tournament_id, tournaments.id))
    .innerJoin(games, eq(tournaments.game_id, games.id))
    .where(and(eq(tournamentParticipants.discord_user_id, discordUserId), inArray(tournaments.status, ACTIVE_STATUSES)))
    .orderBy(asc(tournaments.start_date), asc(tournaments.id));
}

/** Name + game + start for a signup welcome DM / notification. */
export async function getTournamentWithGameDisplay(ex: Executor, id: string) {
  const [row] = await ex.select({ name: tournaments.name, game_id: tournaments.game_id, game_name: games.name, game_color: games.color, start_date: tournaments.start_date })
    .from(tournaments).leftJoin(games, eq(tournaments.game_id, games.id)).where(eq(tournaments.id, id));
  return row;
}

/** Tournament row + game name / colour + signup cap, for the signup notification embed. */
export async function getTournamentSignupEventData(ex: Executor, id: string) {
  const [row] = await ex.select({ ...getTableColumns(tournaments), game_name: games.name, max_signups: tournaments.max_participants, game_color: games.color })
    .from(tournaments).leftJoin(games, eq(tournaments.game_id, games.id)).where(eq(tournaments.id, id));
  return row;
}

/** Signup capacity and team-selection flag of a tournament (`max_participants` NULL = unlimited). */
export async function getTournamentSignupLimit(ex: Executor, id: string) {
  const [row] = await ex.select({ game_id: tournaments.game_id, max_participants: tournaments.max_participants, allow_player_team_selection: tournaments.allow_player_team_selection })
    .from(tournaments).where(eq(tournaments.id, id));
  return row;
}

export async function getTournamentCounts(ex: Executor): Promise<{ tournaments: number; participants: number }> {
  const [t] = await ex.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(tournaments);
  const [p] = await ex.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(tournamentParticipants);
  return { tournaments: t?.n ?? 0, participants: p?.n ?? 0 };
}

// ─── writes ──────────────────────────────────────────────────────────────────

export interface CreateTournamentInput {
  name: string;
  description?: string | null;
  gameId: string;
  gameModeId: string;
  format: TournamentFormat;
  roundsPerMatch: number;
  ruleset?: string | null;
  maxParticipants?: number | null;
  startDate?: Date | null;
  startTime?: Date | null;
  eventImageUrl?: string | null;
  allowPlayerTeamSelection?: boolean;
  allowMatchEditing?: boolean;
  statsEnabled?: boolean;
  announcements?: AnnouncementConfig;
  playerNotifications?: boolean;
  livestreamLink?: string | null;
  positionScoringOverride?: PositionScoringConfig | null;
}

export async function createTournament(ex: Executor, input: CreateTournamentInput): Promise<TournamentWithGame & { participant_count: number; has_bracket: boolean }> {
  const id = newTournamentId();
  await ex.insert(tournaments).values({
    id,
    name: input.name,
    description: input.description || null,
    game_id: input.gameId,
    game_mode_id: input.gameModeId,
    format: input.format,
    status: 'created',
    rounds_per_match: input.roundsPerMatch,
    ruleset: input.ruleset === 'competitive' ? 'competitive' : 'casual',
    max_participants: input.maxParticipants || null,
    start_date: input.startDate ?? null,
    start_time: input.startTime ?? null,
    event_image_url: input.eventImageUrl || null,
    allow_player_team_selection: !!input.allowPlayerTeamSelection,
    allow_match_editing: input.allowMatchEditing !== false,
    stats_enabled: !!input.statsEnabled,
    announcements: input.announcements && input.announcements.length > 0 ? input.announcements : null,
    player_notifications: input.playerNotifications !== false,
    livestream_link: input.livestreamLink || null,
    position_scoring_override: input.positionScoringOverride ?? null,
  });
  const created = await getTournamentWithGame(ex, id);
  return { ...created!, participant_count: 0, has_bracket: false };
}

export interface UpdateTournamentInput {
  name?: string;
  description?: string | null;
  startDate?: Date | null;
  startTime?: Date | null;
  eventImageUrl?: string | null;
  livestreamLink?: string | null;
  announcements?: AnnouncementConfig;
  playerNotifications?: boolean;
  allowMatchEditing?: boolean;
  positionScoringOverride?: PositionScoringConfig | null;
}

/** Apply the provided fields (undefined = leave alone). Returns false when nothing matched. */
export async function updateTournamentDetails(ex: Executor, id: string, input: UpdateTournamentInput): Promise<boolean> {
  const set: Partial<typeof tournaments.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined) set.description = input.description || null;
  if (input.startDate !== undefined) set.start_date = input.startDate;
  if (input.startTime !== undefined) set.start_time = input.startTime;
  if (input.eventImageUrl !== undefined) set.event_image_url = input.eventImageUrl || null;
  if (input.livestreamLink !== undefined) set.livestream_link = input.livestreamLink || null;
  if (input.announcements !== undefined) set.announcements = input.announcements && input.announcements.length > 0 ? input.announcements : null;
  if (input.playerNotifications !== undefined) set.player_notifications = input.playerNotifications;
  if (input.allowMatchEditing !== undefined) set.allow_match_editing = input.allowMatchEditing;
  if (input.positionScoringOverride !== undefined) set.position_scoring_override = input.positionScoringOverride || null;
  const rows = await ex.update(tournaments).set({ ...set, updated_at: new Date() }).where(eq(tournaments.id, id)).returning({ id: tournaments.id });
  return rows.length > 0;
}

/** Bump `updated_at` so ETag pollers see a change that happened in a child table. */
export async function touchTournament(ex: Executor, id: string): Promise<void> {
  await ex.update(tournaments).set({ updated_at: new Date() }).where(eq(tournaments.id, id));
}

/**
 * Compare-and-set the status: only flips when the tournament is still in `from`. Returns false when another request won.
 */
export async function casTournamentStatus(ex: Executor, id: string, from: TournamentStatus, to: TournamentStatus): Promise<boolean> {
  const rows = await ex.update(tournaments).set({ status: to, updated_at: new Date() })
    .where(and(eq(tournaments.id, id), eq(tournaments.status, from))).returning({ id: tournaments.id });
  return rows.length > 0;
}

/**
 * Delete a tournament. Everything below it (teams, members, participants, byes, bracket rows, its matches with their
 * games / participants / placements, series events) goes with it through the FK cascades.
 */
export async function deleteTournament(ex: Executor, id: string): Promise<boolean> {
  const rows = await ex.delete(tournaments).where(eq(tournaments.id, id)).returning({ id: tournaments.id });
  return rows.length > 0;
}
