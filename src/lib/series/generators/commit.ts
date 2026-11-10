/**
 * Round robin / race calendar generators as a service: preview (pure: reads entrants, writes nothing), commit (a batch row
 * plus every fixture through the event builder, ONE transaction), regenerate and delete of a batch.
 */
import { and, asc, eq } from 'drizzle-orm';
import type { Db, Executor } from '../../../../lib/db';
import { matches, seriesEventBatches, seriesEvents, tournaments } from '../../../../lib/db/schema';
import type {
  CreateSeriesMatchInput, CreateSeriesTournamentInput, GeneratedFixture, GeneratorCommitInput, GeneratorPreview, RaceCalendarConfig,
  RoundRobinConfig, SeriesBatchKind,
} from '../../../../shared/series-types';
import { logger } from '../../logger';
import { AfterCommit } from '../../matches/effects';
import { genId } from '../../matches/ids';
import {
  createSeriesMatchEventTx, createSeriesTournamentEventTx, loadBuilderContext, type BuilderContext, type CreateEventOptions,
} from '../builder';
import { removeSeriesEvent } from '../events';
import { loadSeriesEntrants, selectEntrants, type ResolvedEntrant } from '../rosters';
import { SeriesError, getSeriesById, lockSeries } from '../series';
import { getStage } from '../stages';
import { planRaceCalendar } from './race-calendar';
import { flattenRounds, generatePairingRounds, planRoundRobin, type PairingEntrant, type RoundRobinPairing } from './round-robin';
import { GeneratorConfigError, defaultTimezone, firstMatchDay, localYmd, zonedTimeToUtc, dayNumber, ymdOf } from './schedule';

const UNSTARTED = ['created', 'gather', 'assign'];
const PLAYED = ['battle', 'complete'];
const MAX_FIXTURES = 1000;

/** Run pure generator code; an unsatisfiable config becomes a 400. */
function asBadRequest<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof GeneratorConfigError) throw new SeriesError(error.message, 400);
    throw error;
  }
}

const toPairingEntrants = (entrants: readonly ResolvedEntrant[]): PairingEntrant[] => entrants.map((e) => ({ id: e.id, name: e.name, division: e.division }));

/** Entrants the generator works with: the configured ones (or all active), must be active entrants of the series. */
function generatorEntrants(all: BuilderContext['entrants'], configured: readonly string[] | null | undefined): ResolvedEntrant[] {
  return selectEntrants(all, configured);
}

async function assertStageOk(ex: Executor, seriesId: string, stageId: string | null | undefined): Promise<void> {
  if (stageId && !(await getStage(ex, seriesId, stageId))) throw new SeriesError('stage_id does not match a stage of this series', 400);
}

function rosterWarnings(series: { roster_min: number | null }, entrants: readonly ResolvedEntrant[]): string[] {
  const need = Math.max(series.roster_min ?? 0, 1);
  return entrants.filter((e) => e.members.length < need).map((e) => `Entrant "${e.name}" has ${e.members.length} player(s) on its roster but needs at least ${need}`);
}

/** Warnings for fixtures that fall outside the series' start / end dates (both inclusive), compared as UTC calendar days. */
export function seriesDateWarnings(
  series: { start_date: Date | null; end_date: Date | null }, fixtures: ReadonlyArray<{ start: string }>,
): string[] {
  const days = fixtures.map((f) => new Date(f.start).toISOString().slice(0, 10)).sort();
  if (days.length === 0) return [];
  const warnings: string[] = [];
  const plural = (n: number) => `${n} fixture${n === 1 ? '' : 's'}`;
  if (series.start_date) {
    const start = series.start_date.toISOString().slice(0, 10);
    const early = days.filter((d) => d < start);
    if (early.length > 0) warnings.push(`${plural(early.length)} start before the series start date (${start}); the earliest is on ${early[0]}`);
  }
  if (series.end_date) {
    const end = series.end_date.toISOString().slice(0, 10);
    const late = days.filter((d) => d > end);
    if (late.length > 0) warnings.push(`${plural(late.length)} fall after the series end date (${end}); the last is on ${late[late.length - 1]}. Extend the end date or shorten the schedule`);
  }
  return warnings;
}

// ─── previews ────────────────────────────────────────────────────────────────

async function previewContext(ex: Executor, seriesId: string, stageId: string | null | undefined, configured: readonly string[] | null | undefined) {
  const series = await getSeriesById(ex, seriesId);
  if (!series) throw new SeriesError('Series not found', 404);
  await assertStageOk(ex, seriesId, stageId);
  return { series, entrants: generatorEntrants(await loadSeriesEntrants(ex, seriesId), configured) };
}

export async function previewRoundRobin(ex: Executor, seriesId: string, config: RoundRobinConfig): Promise<GeneratorPreview> {
  const { series, entrants } = await previewContext(ex, seriesId, config.stage_id, config.entrant_ids);
  const plan = asBadRequest(() => planRoundRobin(toPairingEntrants(entrants), config, config.match?.name_template));
  const warnings = [...rosterWarnings(series, entrants), ...plan.warnings, ...seriesDateWarnings(series, plan.fixtures)];
  return { fixtures: plan.fixtures, byes: plan.byes, warnings };
}

export async function previewRaceCalendar(ex: Executor, seriesId: string, config: RaceCalendarConfig): Promise<GeneratorPreview> {
  const { series, entrants } = await previewContext(ex, seriesId, config.stage_id, config.entrant_ids);
  if (entrants.length < 2) throw new SeriesError('A race calendar needs at least 2 entrants', 400);
  const fixtures = asBadRequest(() => planRaceCalendar(config, entrants.map((e) => e.id)));
  return { fixtures, byes: [], warnings: [...rosterWarnings(series, entrants), ...seriesDateWarnings(series, fixtures)] };
}

// ─── creating a batch's events ───────────────────────────────────────────────

function matchInputFor(
  f: GeneratedFixture, template: Omit<NonNullable<RoundRobinConfig['match']>, 'name_template'> | undefined,
  placement: { stage_id?: string | null; points_multiplier?: number },
): CreateSeriesMatchInput {
  const { name_template: _unused, ...rest } = (template ?? {}) as NonNullable<RoundRobinConfig['match']>;
  return {
    entrant_ids: f.entrant_ids, stage_id: placement.stage_id ?? null, role: 'regular', week: f.week,
    ...(placement.points_multiplier !== undefined ? { points_multiplier: placement.points_multiplier } : {}),
    match: { ...rest, name: f.name, start_date: f.start },
  };
}

function tournamentInputFor(f: GeneratedFixture, config: RaceCalendarConfig): CreateSeriesTournamentInput {
  const { format, ...template } = config.tournament ?? {};
  return {
    entrant_ids: f.entrant_ids, stage_id: config.stage_id ?? null, role: 'regular', week: f.week,
    ...(config.points_multiplier !== undefined ? { points_multiplier: config.points_multiplier } : {}),
    format: format ?? 'cumulative-points',
    tournament: { ...template, name: f.name, start_time: f.start },
  };
}

async function createBatchEvents(
  tx: Executor, seriesId: string, kind: SeriesBatchKind, config: RoundRobinConfig | RaceCalendarConfig, fixtures: readonly GeneratedFixture[],
  batchId: string, ctx: BuilderContext, after: AfterCommit,
): Promise<string[]> {
  const eventIds: string[] = [];
  const opts: CreateEventOptions = { batchId, context: ctx, announce: false };
  for (const f of fixtures) {
    if (kind === 'round_robin') {
      const cfg = config as RoundRobinConfig;
      eventIds.push((await createSeriesMatchEventTx(tx, seriesId, matchInputFor(f, cfg.match, cfg), after, opts)).event_id);
    } else if ((config as RaceCalendarConfig).event_kind === 'tournament') {
      eventIds.push((await createSeriesTournamentEventTx(tx, seriesId, tournamentInputFor(f, config as RaceCalendarConfig), after, opts)).event_id);
    } else {
      const cfg = config as RaceCalendarConfig;
      eventIds.push((await createSeriesMatchEventTx(tx, seriesId, matchInputFor(f, cfg.match, cfg), after, opts)).event_id);
    }
  }
  return eventIds;
}

async function commitBatch(
  db: Db, seriesId: string, kind: SeriesBatchKind, config: RoundRobinConfig | RaceCalendarConfig, given: readonly GeneratedFixture[] | undefined,
  plan: (entrants: ResolvedEntrant[]) => GeneratedFixture[],
): Promise<{ batch_id: string; event_ids: string[] }> {
  const after = new AfterCommit();
  const result = await db.transaction(async (tx) => {
    const ctx = await loadBuilderContext(tx, seriesId);
    await assertStageOk(tx, seriesId, config.stage_id);
    const entrants = generatorEntrants(ctx.entrants, config.entrant_ids);
    const fixtures = given ?? plan(entrants);
    if (fixtures.length === 0) throw new SeriesError('The generator produced no fixtures', 400);
    if (fixtures.length > MAX_FIXTURES) throw new SeriesError(`A batch may hold at most ${MAX_FIXTURES} events`, 400);

    const batchId = genId('sbat');
    await tx.insert(seriesEventBatches).values({
      id: batchId, series_id: seriesId, stage_id: config.stage_id ?? null, kind, config: config as unknown as Record<string, unknown>,
    });
    const eventIds = await createBatchEvents(tx, seriesId, kind, config, fixtures, batchId, ctx, after);
    logger.debug(`Series ${seriesId}: ${kind} batch ${batchId} created ${eventIds.length} event(s)`);
    return { batch_id: batchId, event_ids: eventIds };
  });
  await after.run();
  return result;
}

/** Create the round robin's matches (the fixtures given, e.g. the edited preview, or the freshly planned ones). */
export function commitRoundRobin(db: Db, seriesId: string, input: GeneratorCommitInput<RoundRobinConfig>): Promise<{ batch_id: string; event_ids: string[] }> {
  const { config } = input;
  return commitBatch(db, seriesId, 'round_robin', config, input.fixtures, (entrants) =>
    asBadRequest(() => planRoundRobin(toPairingEntrants(entrants), config, config.match?.name_template)).fixtures);
}

export function commitRaceCalendar(db: Db, seriesId: string, input: GeneratorCommitInput<RaceCalendarConfig>): Promise<{ batch_id: string; event_ids: string[] }> {
  const { config } = input;
  return commitBatch(db, seriesId, 'race_calendar', config, input.fixtures, (entrants) => {
    if (entrants.length < 2) throw new SeriesError('A race calendar needs at least 2 entrants', 400);
    return asBadRequest(() => planRaceCalendar(config, entrants.map((e) => e.id)));
  });
}

// ─── regenerate / delete ─────────────────────────────────────────────────────

interface BatchEvent {
  id: string;
  match_id: string | null;
  tournament_id: string | null;
  target_status: string | null;
  entrant_ids: string[] | null;
  event_date: Date | null;
  week: number | null;
}

async function getBatch(tx: Executor, seriesId: string, batchId: string) {
  const [batch] = await tx.select().from(seriesEventBatches).where(and(eq(seriesEventBatches.id, batchId), eq(seriesEventBatches.series_id, seriesId)));
  if (!batch) throw new SeriesError('Batch not found in this series', 404);
  return batch;
}

async function listBatchEvents(tx: Executor, batchId: string): Promise<BatchEvent[]> {
  const rows = await tx.select({
    id: seriesEvents.id, match_id: seriesEvents.match_id, tournament_id: seriesEvents.tournament_id, entrant_ids: seriesEvents.entrant_ids,
    event_date: seriesEvents.event_date, week: seriesEvents.week, match_status: matches.status, tournament_status: tournaments.status,
  }).from(seriesEvents)
    .leftJoin(matches, eq(matches.id, seriesEvents.match_id))
    .leftJoin(tournaments, eq(tournaments.id, seriesEvents.tournament_id))
    .where(eq(seriesEvents.batch_id, batchId)).orderBy(asc(seriesEvents.event_order));
  return rows.map(({ match_status, tournament_status, ...r }) => ({ ...r, target_status: match_status ?? tournament_status ?? null }));
}

const isUnstarted = (e: BatchEvent): boolean => e.target_status !== null && UNSTARTED.includes(e.target_status);
const isPlayed = (e: BatchEvent): boolean => e.target_status !== null && PLAYED.includes(e.target_status);
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Remove the batch's events whose target has not started (their matches / tournaments go with them). */
async function removeUnstarted(tx: Executor, seriesId: string, events: readonly BatchEvent[]): Promise<number> {
  let removed = 0;
  for (const e of events.filter(isUnstarted)) {
    await removeSeriesEvent(tx, seriesId, e.id);
    removed++;
  }
  return removed;
}

/** The round robin fixtures still owed: pairings not covered by a kept (in progress / played) event, scheduled from the next slot. */
function planOwedRoundRobin(config: RoundRobinConfig, entrants: readonly ResolvedEntrant[], kept: readonly BatchEvent[], now: Date): GeneratedFixture[] {
  const timeZone = config.timezone ?? defaultTimezone();
  const rounds = generatePairingRounds(toPairingEntrants(entrants), config).rounds;
  const played = new Map<string, number>();
  for (const e of kept.filter(isPlayed)) {
    if (e.entrant_ids?.length === 2) played.set(pairKey(e.entrant_ids[0], e.entrant_ids[1]), (played.get(pairKey(e.entrant_ids[0], e.entrant_ids[1])) ?? 0) + 1);
  }
  const owed: RoundRobinPairing[] = flattenRounds(rounds).filter((p) => {
    const key = pairKey(p.home, p.away);
    const n = played.get(key) ?? 0;
    if (n > 0) {
      played.set(key, n - 1);
      return false;
    }
    return true;
  });
  const today = localYmd(now, timeZone);
  const startDate = dayNumber(config.start_date) > dayNumber(today) ? config.start_date : today;
  const occupied = kept.filter((e) => e.event_date && e.entrant_ids && e.target_status !== 'cancelled')
    .map((e) => ({ entrant_ids: e.entrant_ids as string[], start: e.event_date as Date }));
  return planRoundRobin(toPairingEntrants(entrants), { ...config, start_date: startDate }, config.match?.name_template, {
    pairings: owed, notBefore: now, weekOrigin: firstMatchDay(config), occupied,
  }).fixtures;
}

/** The race events still owed (weeks without a kept event); past slots move to the next free interval after now. */
function planOwedRaceCalendar(config: RaceCalendarConfig, entrants: readonly ResolvedEntrant[], kept: readonly BatchEvent[], now: Date): GeneratedFixture[] {
  const timeZone = config.timezone ?? defaultTimezone();
  const playedWeeks = new Set(kept.filter((e) => isPlayed(e) && e.week !== null).map((e) => e.week as number));
  const owed = planRaceCalendar(config, entrants.map((e) => e.id)).filter((f) => !playedWeeks.has(f.week));
  let previous: Date | null = null;
  return owed.map((f) => {
    let start = new Date(f.start);
    if (start.getTime() <= now.getTime() || (previous && start.getTime() <= previous.getTime())) {
      const base: number = previous ? dayNumber(localYmd(previous, timeZone)) + config.interval_days : dayNumber(localYmd(now, timeZone));
      start = zonedTimeToUtc(ymdOf(base), config.time, timeZone);
      if (!previous && start.getTime() <= now.getTime()) start = zonedTimeToUtc(ymdOf(base + 1), config.time, timeZone);
    }
    previous = start;
    return { ...f, start: start.toISOString() };
  });
}

/**
 * Recompute a batch: its events whose match / tournament has not started are removed (with their targets), then the
 * fixtures still owed are scheduled from the next slot and created in the same batch. Played and in-progress events stay.
 * Round robin: the pairings not already played or in progress; race calendar: the weeks without a played event.
 */
export async function regenerateBatch(db: Db, seriesId: string, batchId: string): Promise<{ removed: number; event_ids: string[] }> {
  const after = new AfterCommit();
  const result = await db.transaction(async (tx) => {
    const ctx = await loadBuilderContext(tx, seriesId);
    const batch = await getBatch(tx, seriesId, batchId);
    const events = await listBatchEvents(tx, batchId);
    const removed = await removeUnstarted(tx, seriesId, events);
    const kept = events.filter((e) => !isUnstarted(e));

    // entrants may have changed since the batch was made: drop withdrawn / pending ones, keep the configured subset
    const config = batch.config as unknown as RoundRobinConfig | RaceCalendarConfig;
    const configured = config.entrant_ids ?? null;
    const activeIds = [...ctx.entrants.values()].filter((e) => e.status === 'active').map((e) => e.id);
    const ids = (configured ?? activeIds).filter((id) => activeIds.includes(id));
    const entrants = generatorEntrants(ctx.entrants, ids);
    const now = new Date();

    let fixtures: GeneratedFixture[];
    if (batch.kind === 'round_robin') {
      fixtures = entrants.length < 2 ? [] : asBadRequest(() => planOwedRoundRobin(config as RoundRobinConfig, entrants, kept, now));
    } else {
      fixtures = entrants.length < 2 ? [] : asBadRequest(() => planOwedRaceCalendar(config as RaceCalendarConfig, entrants, kept, now));
    }
    const eventIds = fixtures.length === 0 ? [] : await createBatchEvents(tx, seriesId, batch.kind, config, fixtures, batchId, ctx, after);
    return { removed, event_ids: eventIds };
  });
  await after.run();
  return result;
}

/** Delete a batch: unplayed events and their matches / tournaments go; played ones stay with `batch_id = null`. */
export async function deleteBatch(db: Db, seriesId: string, batchId: string): Promise<{ removed: number; kept: number }> {
  return db.transaction(async (tx) => {
    const series = await lockSeries(tx, seriesId);
    if (!series) throw new SeriesError('Series not found', 404);
    await getBatch(tx, seriesId, batchId);
    const events = await listBatchEvents(tx, batchId);
    const removed = await removeUnstarted(tx, seriesId, events);
    const kept = events.length - removed;
    await tx.update(seriesEvents).set({ batch_id: null }).where(eq(seriesEvents.batch_id, batchId));
    await tx.delete(seriesEventBatches).where(eq(seriesEventBatches.id, batchId));
    return { removed, kept };
  });
}
