/**
 * The series event builder: a series CREATES its matches and tournaments (with the entrants' rosters preset) instead of
 * only attaching existing ones, plus planned (playoff placeholder) events.
 *
 * Every creator has a transaction-taking core (`create...Tx`) that runs inside the caller's transaction and queues
 * work that must not run in it (voice channels, feed events) on an `AfterCommit`; the plain functions wrap that in
 * their own transaction and run the effects once it has committed. Lock order is series -> tournament -> matches.
 *
 * Work package E (playoffs) calls `createSeriesTournamentEventTx` from its own transaction; the generators call the
 * match / tournament cores once per fixture inside the batch transaction.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Db, Executor } from '../../../lib/db';
import {
  matchParticipants, matchTeams, seriesEventBatches, seriesEvents, tournamentParticipants, tournamentTeamMembers, tournamentTeams,
} from '../../../lib/db/schema';
import type { AnnouncementConfig } from '../../../lib/db/schema/types';
import type {
  CreateSeriesMatchInput, CreateSeriesPlannedEventInput, CreateSeriesTournamentInput, SeriesEventPlacementInput, SeriesEventRole,
  SeriesScoringType,
} from '../../../shared/series-types';
import { enqueueAnnouncement } from '../discord-queues';
import { logFeedEvent } from '../feed-helpers';
import { getGame, getMode, getModeScoringType, listModes, type GameModeRow } from '../games';
import { logger } from '../logger';
import {
  addParticipantsBulk, casMatchStatus, createMatchFromRequest, createMatchTeams, createNamedMatchTeams, resolveModeFromMaps,
  validateMatchRequest, type MatchRequestBody,
} from '../matches';
import { AfterCommit, bestEffort } from '../matches/effects';
import { genId } from '../matches/ids';
import { seedOrder } from '../tournaments/bracket-math';
import { generateTournamentMatchesInTx } from '../tournaments/generate';
import { createTournament, casTournamentStatus, TournamentError, type TournamentRow } from '../tournaments/tournaments';
import { toDateOrNull, allowedGameIds, lockSeries, newSeriesEventId, SeriesError, type SeriesRow } from './series';
import { getStage } from './stages';
import { parseScoringConfig } from './validation';
import {
  assertRosters, loadSeriesEntrants, orderBySeed, rosterAsParticipants, selectEntrants, type ResolvedEntrant,
} from './rosters';

const BRACKET_FORMATS = ['single-elimination', 'double-elimination'] as const;
const MAX_BRACKET_ENTRANTS = 256;

/** The locked series row plus every entrant with its current roster, loaded once per transaction. */
export interface BuilderContext {
  series: SeriesRow;
  entrants: Map<string, ResolvedEntrant>;
}

export interface CreateEventOptions {
  /** The generator batch the event belongs to. */
  batchId?: string | null;
  /** Explicit `event_order` (default: the series' max + 1). */
  eventOrder?: number;
  /** A context from `loadBuilderContext` (generators load it once for the whole batch). */
  context?: BuilderContext;
  /** Playoffs: turn this existing `planned` event into the live one instead of inserting a new row. */
  fillEventId?: string;
  /** Queue the per-match Discord announcement(s) (default true). Generators turn it off: the weekly schedule post covers them. */
  announce?: boolean;
}

export interface CreatedMatchEvent { event_id: string; match_id: string }
export interface CreatedTournamentEvent { event_id: string; tournament_id: string }

/** Locks the series (the first lock of every builder transaction) and loads its entrants. 404 / 409 for an unknown / finished series. */
export async function loadBuilderContext(tx: Executor, seriesId: string): Promise<BuilderContext> {
  const series = await lockSeries(tx, seriesId);
  if (!series) throw new SeriesError('Series not found', 404);
  if (series.status === 'complete' || series.status === 'cancelled') throw new SeriesError(`Cannot add events to a ${series.status} series`, 409);
  return { series, entrants: await loadSeriesEntrants(tx, seriesId) };
}

// ─── shared pieces ───────────────────────────────────────────────────────────

async function resolveGameId(tx: Executor, series: SeriesRow, requested: string | null | undefined): Promise<string> {
  const gameId = requested || series.game_id;
  if (!gameId) throw new SeriesError('game_id is required (the series has no default game)', 400);
  const allowed = allowedGameIds(series);
  if (allowed && !allowed.includes(gameId)) throw new SeriesError(`Game ${gameId} is not one of this series' games`, 400);
  if (!(await getGame(tx, gameId))) throw new SeriesError(`Unknown game "${gameId}"`, 400);
  return gameId;
}

/**
 * The mode a series tournament is created with: the template's, else the series' default (only valid for the series'
 * own game), else the first mode (by name, like the UI's mode list) that matches the series' scoring type. Returns
 * null when the game has no usable mode.
 */
export async function resolveTournamentModeId(
  ex: Executor, series: SeriesRow, gameId: string, requested: string | null | undefined,
): Promise<string | null> {
  if (requested) return requested;
  if (series.game_mode_id && (!series.game_id || series.game_id === gameId)) return series.game_mode_id;
  const modes = await listModes(ex, gameId);
  const fit = modes.find((m) => !series.scoring_type || m.scoring_type === series.scoring_type);
  return fit?.id ?? null;
}

function assertScoringType(series: SeriesRow, actual: string, what: string): void {
  if (series.scoring_type && series.scoring_type !== actual) {
    throw new SeriesError(`This series only takes ${series.scoring_type} events, but the ${what} is ${actual}`, 400);
  }
}

async function assertStage(tx: Executor, seriesId: string, stageId: string | null | undefined): Promise<void> {
  if (stageId && !(await getStage(tx, seriesId, stageId))) throw new SeriesError('stage_id does not match a stage of this series', 400);
}

/**
 * head_to_head standings only count matches between exactly two entrants. Refuse a counted match with more sides in a
 * head_to_head table (stage override first) instead of letting it silently count for nothing.
 */
async function assertCountableInH2h(
  tx: Executor, series: SeriesRow, stageId: string | null | undefined, entrantCount: number, counts: boolean,
): Promise<void> {
  if (!counts || entrantCount <= 2) return;
  const stage = stageId ? await getStage(tx, series.id, stageId) : null;
  const mode = stage?.scoring_config?.mode ?? parseScoringConfig(series.scoring_config).mode;
  if (mode === 'head_to_head') {
    throw new SeriesError(
      `Head-to-head standings only count matches between two entrants, but this match has ${entrantCount}. ` +
      'Set it to not count for standings (an exhibition), or use a points-based standings mode.', 400,
    );
  }
}

/**
 * The next free `event_order`: after every event and every slot a planned batch holds (its fixtures are inserted there
 * when it is generated). Callers hold the series row lock.
 */
export async function nextEventOrder(tx: Executor, seriesId: string): Promise<number> {
  const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
  const [events] = await tx.select({ max_order: sql<number | null>`max(${seriesEvents.event_order})`.mapWith(toNumber) })
    .from(seriesEvents).where(eq(seriesEvents.series_id, seriesId));
  const [batches] = await tx.select({ max_order: sql<number | null>`max(${seriesEventBatches.position})`.mapWith(toNumber) })
    .from(seriesEventBatches).where(eq(seriesEventBatches.series_id, seriesId));
  return Math.max(events?.max_order ?? 0, batches?.max_order ?? 0) + 1;
}

function countsForStandings(input: SeriesEventPlacementInput, role: SeriesEventRole): boolean {
  return input.counts_for_standings ?? role === 'regular';
}

function validDate(value: string | null | undefined, field: string): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new SeriesError(`${field} must be a valid date`, 400);
  return d;
}

interface EventRowInput {
  placement: SeriesEventPlacementInput;
  eventType: 'match' | 'tournament';
  matchId?: string;
  tournamentId?: string;
  entrantIds: string[];
  eventDate: Date | null;
}

/** Insert the `series_events` row (or fill the planned one) of a created match / tournament. Returns its id. */
async function writeEventRow(tx: Executor, ctx: BuilderContext, input: EventRowInput, opts: CreateEventOptions): Promise<string> {
  const { placement } = input;
  const seriesId = ctx.series.id;
  const role = placement.role ?? 'regular';

  if (opts.fillEventId) {
    const [planned] = await tx.select().from(seriesEvents)
      .where(and(eq(seriesEvents.id, opts.fillEventId), eq(seriesEvents.series_id, seriesId))).for('update');
    if (!planned) throw new SeriesError('Event not found in this series', 404);
    if (planned.status !== 'planned') throw new SeriesError('This event is no longer a placeholder (it was already filled)', 409);
    await tx.update(seriesEvents).set({
      status: 'live', event_type: input.eventType, match_id: input.matchId ?? null, tournament_id: input.tournamentId ?? null,
      entrant_ids: input.entrantIds, event_date: input.eventDate ?? planned.event_date, match_template: null,
    }).where(eq(seriesEvents.id, planned.id));
    return planned.id;
  }

  const id = newSeriesEventId();
  await tx.insert(seriesEvents).values({
    id, series_id: seriesId, event_type: input.eventType, match_id: input.matchId ?? null, tournament_id: input.tournamentId ?? null,
    event_order: opts.eventOrder ?? (await nextEventOrder(tx, seriesId)),
    event_date: input.eventDate,
    points_multiplier: placement.points_multiplier ?? 1.0,
    stage_id: placement.stage_id ?? null,
    role,
    week: placement.week ?? null,
    counts_for_standings: countsForStandings(placement, role),
    batch_id: opts.batchId ?? null,
    status: 'live',
    entrant_ids: input.entrantIds,
  });
  return id;
}

function normalLayoutName(series: SeriesRow, entrants: readonly ResolvedEntrant[], eventOrder: number, week: number | null | undefined): string {
  if (entrants.length === 2) return `${entrants[0].name} vs ${entrants[1].name}`;
  return `${series.name} - Round ${week ?? eventOrder}`;
}

// ─── matches ─────────────────────────────────────────────────────────────────

/** Normal, or a team-endurance Position mode: one `match_teams` row per entrant. Everything else: one row per participant. */
function usesEntrantTeams(scoring: SeriesScoringType, mode: GameModeRow | undefined): boolean {
  return scoring === 'Normal' || (scoring === 'Position' && (mode?.team_size ?? 1) > 1);
}

/** Tag every participant's own team row with their entrant (individual layouts); solo entrants lend their name / colour. */
async function tagIndividualTeams(tx: Executor, matchId: string, entrants: readonly ResolvedEntrant[]): Promise<void> {
  const entrantOf = new Map<string, ResolvedEntrant>();
  for (const e of entrants) for (const m of e.members) entrantOf.set(m.user_id, e);
  const rows = await tx.select({ user_id: matchParticipants.user_id, team_id: matchParticipants.team_id }).from(matchParticipants)
    .where(eq(matchParticipants.match_id, matchId));
  for (const row of rows) {
    const entrant = entrantOf.get(row.user_id);
    if (!entrant || !row.team_id) continue;
    const solo = entrant.members.length === 1;
    await tx.update(matchTeams).set({
      series_entrant_id: entrant.id,
      ...(solo ? { team_name: entrant.name, team_color: entrant.color } : {}),
    }).where(eq(matchTeams.id, row.team_id));
  }
}

/**
 * Create a match for the series with its entrants' rosters preset (status `assign`, so signups are skipped): one named
 * `match_teams` row per entrant for Normal and team-endurance Position matches, one row per participant (tagged with
 * their entrant) for FFA / individual Position. Queues the standard announcement; voice channels are created later, shortly before
 * the match starts. Runs inside the caller's transaction.
 */
export async function createSeriesMatchEventTx(
  tx: Executor, seriesId: string, input: CreateSeriesMatchInput, after: AfterCommit, opts: CreateEventOptions = {},
): Promise<CreatedMatchEvent> {
  const ctx = opts.context ?? (await loadBuilderContext(tx, seriesId));
  const { series } = ctx;
  const tpl = input.match;
  const defaults = series.match_defaults ?? {};

  const gameId = await resolveGameId(tx, series, tpl.game_id);
  await assertStage(tx, seriesId, input.stage_id);
  const entrants = selectEntrants(ctx.entrants, input.entrant_ids);

  // default maps belong to the series' primary game
  const maps = tpl.maps ?? (gameId === series.game_id || allowedGameIds(series)?.length === 1 ? defaults.maps : undefined);
  const resolvedMode = await resolveModeFromMaps(tx, gameId, maps);
  if (resolvedMode.error) throw new SeriesError(resolvedMode.error, 400);
  const mode = resolvedMode.modeId ? await getMode(tx, gameId, resolvedMode.modeId) : undefined;
  const scoring: SeriesScoringType = (mode?.scoring_type as SeriesScoringType | undefined) ?? (resolvedMode.modeId ? 'Normal' : (series.scoring_type ?? 'Normal'));
  if (!mode && scoring !== 'Normal') {
    throw new SeriesError(`Select maps for the match (or set default maps on the series): the ${scoring} match's mode comes from its maps`, 400);
  }
  assertScoringType(series, scoring, 'match');

  const entrantTeams = usesEntrantTeams(scoring, mode);
  if (entrants.length < 2) throw new SeriesError('A match needs at least 2 entrants', 400);
  if (scoring === 'Normal') await assertCountableInH2h(tx, series, input.stage_id, entrants.length, countsForStandings(input, input.role ?? 'regular'));
  if (scoring === 'Normal' && entrants.length > 16) throw new SeriesError(`A Normal match takes 2 to 16 entrants (got ${entrants.length})`, 400);
  assertRosters(series, entrants, entrantTeams && series.entrant_type !== 'solo' ? 0 : 1);

  const eventOrder = opts.eventOrder ?? (await nextEventOrder(tx, seriesId));
  const body: MatchRequestBody = {
    name: tpl.name?.trim() || normalLayoutName(series, entrants, eventOrder, input.week),
    description: tpl.description ?? undefined,
    gameId,
    startDate: tpl.start_date,
    livestreamLink: tpl.livestream_link ?? defaults.livestream_link ?? series.livestream_link ?? undefined,
    rules: tpl.rules ?? defaults.rules,
    rounds: maps && maps.length > 0 ? maps.length : undefined, // one game per map
    maps,
    eventImageUrl: tpl.event_image_url ?? defaults.event_image_url ?? series.event_image_url ?? undefined,
    playerNotifications: tpl.player_notifications ?? defaults.player_notifications ?? series.player_notifications,
    announcements: defaults.announcements,
    statsEnabled: tpl.stats_enabled ?? defaults.stats_enabled,
    teamCount: scoring === 'Normal' ? entrants.length : undefined,
  };
  const validation = validateMatchRequest(body);
  if (!validation.valid) throw new SeriesError(validation.error ?? 'Invalid match', 400);

  const created = await createMatchFromRequest(tx, body);
  if ('error' in created) throw new SeriesError(created.error, 400);
  const matchId = created.match.id;

  if (entrantTeams) {
    const teamIds = await createNamedMatchTeams(tx, matchId, entrants.map((e) => ({ name: e.name, color: e.color })));
    for (const [i, entrant] of entrants.entries()) {
      await tx.update(matchTeams).set({ series_entrant_id: entrant.id }).where(eq(matchTeams.id, teamIds[i]));
      await addParticipantsBulk(tx, matchId, rosterAsParticipants(entrant), teamIds[i]);
    }
  } else {
    for (const entrant of entrants) await addParticipantsBulk(tx, matchId, rosterAsParticipants(entrant));
    await createMatchTeams(tx, matchId); // one team row per participant
    await tagIndividualTeams(tx, matchId, entrants);
  }

  if (!(await casMatchStatus(tx, matchId, 'created', 'assign'))) throw new SeriesError('Match status changed while it was being created', 409);
  if (series.announcements && opts.announce !== false) {
    await bestEffort(tx, `Failed to queue announcement for match ${matchId}`, (sp) => enqueueAnnouncement(sp, { matchId, type: 'standard' }), null);
  }

  const eventId = await writeEventRow(tx, ctx, {
    placement: input, eventType: 'match', matchId, entrantIds: entrants.map((e) => e.id),
    eventDate: validDate(input.event_date, 'event_date') ?? validDate(tpl.start_date, 'start_date'),
  }, { ...opts, eventOrder });

  after.add(() => logFeedEvent({
    eventType: 'match_created', priority: 3, title: 'Match Created', description: `"${body.name}" was added to ${series.name}`,
    matchId, metadata: { gameName: created.match.game_name, seriesId },
  }));
  logger.debug(`Series ${seriesId}: created match ${matchId} (${entrants.length} entrants, ${scoring})`);
  return { event_id: eventId, match_id: matchId };
}

/** `createSeriesMatchEventTx` in its own transaction; the side effects run after the commit. */
export async function createSeriesMatchEvent(db: Db, seriesId: string, input: CreateSeriesMatchInput, opts: CreateEventOptions = {}): Promise<CreatedMatchEvent> {
  const after = new AfterCommit();
  const result = await db.transaction((tx) => createSeriesMatchEventTx(tx, seriesId, input, after, opts));
  await after.run();
  return result;
}

// ─── tournaments ─────────────────────────────────────────────────────────────

/** Preset-team tournament: one `tournament_teams` row per entrant (tagged), its roster copied in. Returns the team ids in seed order. */
async function createPresetTeams(tx: Executor, tournamentId: string, seeded: readonly ResolvedEntrant[]): Promise<string[]> {
  const base = Date.now(); // explicit created_at: now() is the same for the whole transaction and teams are read back in this order
  const teamIds: string[] = [];
  for (const [i, entrant] of seeded.entries()) {
    const teamId = genId('team');
    teamIds.push(teamId);
    await tx.insert(tournamentTeams).values({
      id: teamId, tournament_id: tournamentId, team_name: entrant.name, series_entrant_id: entrant.id, created_at: new Date(base + i),
    });
    for (const m of rosterAsParticipants(entrant)) {
      const discordId = m.discord_user_id ?? m.user_id;
      await tx.insert(tournamentParticipants).values({
        id: genId('participant'), tournament_id: tournamentId, user_id: m.user_id, discord_user_id: discordId, username: m.username, team_assignment: teamId,
      });
      await tx.insert(tournamentTeamMembers).values({
        id: genId('member'), team_id: teamId, user_id: m.user_id, discord_user_id: m.discord_user_id, username: m.username, is_captain: !!m.receives_map_codes,
      });
    }
  }
  return teamIds;
}

function seedOrderEntrants(entrants: readonly ResolvedEntrant[], requested: readonly string[] | undefined): ResolvedEntrant[] {
  if (!requested) return orderBySeed(entrants);
  const byId = new Map(entrants.map((e) => [e.id, e]));
  if (requested.length !== entrants.length || new Set(requested).size !== requested.length || requested.some((id) => !byId.has(id))) {
    throw new SeriesError('seed_order must list every entrant of the tournament exactly once', 400);
  }
  return requested.map((id) => byId.get(id)!);
}

/**
 * Create a tournament for the series with its entrants as pre-assigned teams (status `assign`) and generate the bracket
 * with the seeds mapped onto bracket positions (`seedOrder`); cumulative-points tournaments get the same teams and the
 * single group match. Runs inside the caller's transaction (E's playoff seeding calls this one).
 */
export async function createSeriesTournamentEventTx(
  tx: Executor, seriesId: string, input: CreateSeriesTournamentInput, after: AfterCommit, opts: CreateEventOptions = {},
): Promise<CreatedTournamentEvent> {
  const ctx = opts.context ?? (await loadBuilderContext(tx, seriesId));
  const { series } = ctx;
  const tpl = input.tournament;
  const defaults = series.match_defaults ?? {};

  const gameId = await resolveGameId(tx, series, tpl.game_id);
  await assertStage(tx, seriesId, input.stage_id);
  const gameModeId = await resolveTournamentModeId(tx, series, gameId, tpl.game_mode_id);
  if (!gameModeId) throw new SeriesError(`game_mode_id is required (the series has no default mode and ${gameId} has no mode for ${series.scoring_type ?? 'this'} scoring)`, 400);
  const ow2Option = gameId === 'overwatch2' && gameModeId.startsWith('ow2-');
  const scoring = ow2Option ? 'Normal' : await getModeScoringType(tx, gameId, gameModeId);
  if (!scoring) throw new SeriesError('Invalid game mode ID or game mode does not belong to the selected game', 400);
  assertScoringType(series, scoring, 'tournament');
  const bracket = (BRACKET_FORMATS as readonly string[]).includes(input.format);
  if (scoring === 'Normal' && !bracket) throw new SeriesError('Normal (team vs team) modes require single-elimination or double-elimination format', 400);
  if (scoring !== 'Normal' && bracket) throw new SeriesError(`${scoring} modes don't support brackets: use cumulative-points format`, 400);

  const entrants = selectEntrants(ctx.entrants, input.entrant_ids);
  if (entrants.length < 2) throw new SeriesError('A tournament needs at least 2 entrants', 400);
  if (entrants.length > MAX_BRACKET_ENTRANTS) throw new SeriesError(`A tournament takes at most ${MAX_BRACKET_ENTRANTS} entrants`, 400);
  assertRosters(series, entrants, 1);
  const seeded = seedOrderEntrants(entrants, input.seed_order);

  const startTime = validDate(tpl.start_time, 'start_time');
  const tournament = await createTournament(tx, {
    name: tpl.name.trim(),
    description: tpl.description,
    gameId,
    gameModeId,
    format: input.format,
    roundsPerMatch: tpl.rounds_per_match ?? defaults.rounds_per_match ?? 3,
    ruleset: tpl.ruleset ?? defaults.rules,
    startDate: startTime,
    startTime,
    eventImageUrl: tpl.event_image_url ?? defaults.event_image_url ?? series.event_image_url,
    statsEnabled: tpl.stats_enabled ?? defaults.stats_enabled,
    announcements: defaults.announcements as unknown as AnnouncementConfig,
    playerNotifications: tpl.player_notifications ?? defaults.player_notifications ?? series.player_notifications,
    livestreamLink: tpl.livestream_link ?? defaults.livestream_link ?? series.livestream_link,
  });
  const tournamentId = tournament.id;

  const teamIds = await createPresetTeams(tx, tournamentId, seeded);
  if (!(await casTournamentStatus(tx, tournamentId, 'created' as TournamentRow['status'], 'assign'))) {
    throw new SeriesError('Tournament status changed while it was being created', 409);
  }

  const assignments = bracket ? seedOrder(teamIds.length).map((seed, position) => ({ position, teamId: teamIds[seed - 1] })) : undefined;
  try {
    await generateTournamentMatchesInTx(tx, tournamentId, assignments, after, { announce: series.announcements && opts.announce !== false });
  } catch (error) {
    if (error instanceof TournamentError) throw new SeriesError(error.message, error.status);
    throw error;
  }

  const eventId = await writeEventRow(tx, ctx, {
    placement: input, eventType: 'tournament', tournamentId, entrantIds: entrants.map((e) => e.id),
    eventDate: validDate(input.event_date, 'event_date') ?? startTime,
  }, opts);

  after.add(() => logFeedEvent({
    eventType: 'tournament_created', priority: 3, title: 'Tournament Created', description: `"${tpl.name}" was added to ${series.name}`,
    tournamentId, metadata: { format: input.format, seriesId },
  }));
  logger.debug(`Series ${seriesId}: created tournament ${tournamentId} (${entrants.length} entrants, ${input.format})`);
  return { event_id: eventId, tournament_id: tournamentId };
}

/** `createSeriesTournamentEventTx` in its own transaction; the side effects run after the commit. */
export async function createSeriesTournamentEvent(db: Db, seriesId: string, input: CreateSeriesTournamentInput, opts: CreateEventOptions = {}): Promise<CreatedTournamentEvent> {
  const after = new AfterCommit();
  const result = await db.transaction((tx) => createSeriesTournamentEventTx(tx, seriesId, input, after, opts));
  await after.run();
  return result;
}

// ─── planned events ──────────────────────────────────────────────────────────

/** Create a playoff placeholder: no match / tournament yet, just the seeding rule (E seeds it once its source is decided). */
export async function createSeriesPlannedEvent(ex: Executor, seriesId: string, input: CreateSeriesPlannedEventInput): Promise<string> {
  return ex.transaction(async (tx) => {
    const ctx = await loadBuilderContext(tx, seriesId);
    const { series } = ctx;
    const rule = input.seeding_rule;
    await assertStage(tx, seriesId, input.stage_id);
    if (rule.source === 'stage') {
      if (!rule.stage_id) throw new SeriesError('seeding_rule.stage_id is required when the source is a stage', 400);
      if (!(await getStage(tx, seriesId, rule.stage_id))) throw new SeriesError('seeding_rule.stage_id does not match a stage of this series', 400);
    }
    const bracket = (BRACKET_FORMATS as readonly string[]).includes(rule.format);
    if (series.scoring_type === 'Normal' && !bracket) throw new SeriesError('A Normal series needs a single- or double-elimination playoff format', 400);
    if (series.scoring_type && series.scoring_type !== 'Normal' && bracket) throw new SeriesError(`${series.scoring_type} series playoffs use the cumulative-points format`, 400);
    if (rule.template.game_id) await resolveGameId(tx, series, rule.template.game_id);

    const id = newSeriesEventId();
    await tx.insert(seriesEvents).values({
      id, series_id: seriesId, event_type: 'tournament', match_id: null, tournament_id: null,
      event_order: await nextEventOrder(tx, seriesId),
      event_date: toDateOrNull(input.event_date) ?? validDate(rule.template.start_time, 'seeding_rule.template.start_time'),
      points_multiplier: input.points_multiplier ?? 1.0,
      stage_id: input.stage_id ?? null,
      role: input.role,
      week: input.week ?? null,
      counts_for_standings: countsForStandings(input, input.role),
      batch_id: null,
      status: 'planned',
      entrant_ids: null,
      seeding_rule: rule,
    });
    logger.debug(`Series ${seriesId}: planned event ${id} (${input.role})`);
    return id;
  });
}
