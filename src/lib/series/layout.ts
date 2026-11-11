/**
 * Season layouts: a series can be laid out completely before anyone has signed up. Stages, PLANNED round robins / race
 * calendars (a `series_event_batches` row with only its config), single match placeholders (a planned `series_events`
 * row with a `match_template`) and playoff placeholders (planned events with a seeding rule, see playoffs.ts).
 *
 * When the entrants are known, `closeRegistration` turns the layout into real events in ONE transaction: divisions are
 * saved, every match placeholder becomes a match with the entrants assigned to it, every planned batch is generated with
 * the active entrants, and the series becomes `active`. Single placeholders can also be filled / generated on their own.
 *
 * Lock order is the builder's: series -> tournament -> matches.
 */
import { and, asc, count, eq, gte, isNotNull, lt, ne, sql } from 'drizzle-orm';
import type { Db, Executor } from '../../../lib/db';
import { seriesEntrants, seriesEventBatches, seriesEvents } from '../../../lib/db/schema';
import type {
  CloseRegistrationInput, CloseRegistrationResult, CreatePlannedBatchInput, CreateSeriesMatchInput, CreateSeriesPlannedMatchInput,
  GeneratePlannedBatchInput, GeneratedFixture, GeneratorPreview, RaceCalendarConfig, RoundRobinConfig, SeriesBatchDto, SeriesBatchKind,
  SeriesLayoutInput, SeriesMatchTemplate,
} from '../../../shared/series-types';
import { getGame } from '../games';
import { logger } from '../logger';
import { AfterCommit } from '../matches/effects';
import { genId } from '../matches/ids';
import {
  createSeriesMatchEventTx, createSeriesPlannedEvent, loadBuilderContext, nextEventOrder, type BuilderContext, type CreatedMatchEvent,
} from './builder';
import {
  asBadRequest, createBatchEvents, getBatch, rosterWarnings, seriesDateWarnings, toPairingEntrants,
} from './generators/commit';
import { assertRaceCalendarConfig, planRaceCalendar } from './generators/race-calendar';
import { planRoundRobin } from './generators/round-robin';
import { assertScheduleConfig } from './generators/schedule';
import { loadSeriesEntrants, selectEntrants, type ResolvedEntrant } from './rosters';
import {
  SeriesError, afterSeriesTransition, allowedGameIds, createSeriesChecked, getSeriesById, lockSeries, newSeriesEventId,
  transitionSeriesStatus, type CreateSeriesInput, type SeriesRow,
} from './series';
import { createStage, getStage } from './stages';

export type SeriesBatchRow = typeof seriesEventBatches.$inferSelect;
type SeriesEventRow = typeof seriesEvents.$inferSelect;
type GeneratorConfig = RoundRobinConfig | RaceCalendarConfig;

const MAX_FIXTURES = 1000;
const CLOSABLE: readonly string[] = ['created', 'registration'];

// ─── read model ──────────────────────────────────────────────────────────────

export function toBatchDto(row: SeriesBatchRow, eventCount: number): SeriesBatchDto {
  return {
    id: row.id, series_id: row.series_id, stage_id: row.stage_id, kind: row.kind, status: row.status,
    config: row.config as unknown as GeneratorConfig, position: row.position, created_at: row.created_at.toISOString(), event_count: eventCount,
  };
}

/** Every batch of a series (planned and generated) with its current event count, in series order. */
export async function listBatches(ex: Executor, seriesId: string): Promise<SeriesBatchDto[]> {
  const rows = await ex.select().from(seriesEventBatches).where(eq(seriesEventBatches.series_id, seriesId))
    .orderBy(asc(seriesEventBatches.created_at), asc(seriesEventBatches.id));
  const counts = await ex.select({ batch_id: seriesEvents.batch_id, n: count() }).from(seriesEvents)
    .where(and(eq(seriesEvents.series_id, seriesId), isNotNull(seriesEvents.batch_id))).groupBy(seriesEvents.batch_id);
  const byBatch = new Map(counts.map((c) => [c.batch_id, c.n]));
  return rows.map((r) => toBatchDto(r, byBatch.get(r.id) ?? 0));
}

// ─── shared checks ───────────────────────────────────────────────────────────

/** Locks the series and refuses (409) a finished one. */
async function lockLayoutSeries(tx: Executor, seriesId: string): Promise<SeriesRow> {
  const row = await lockSeries(tx, seriesId);
  if (!row) throw new SeriesError('Series not found', 404);
  if (row.status === 'complete' || row.status === 'cancelled') throw new SeriesError(`Cannot change the schedule of a ${row.status} series`, 409);
  return row;
}

async function assertStage(tx: Executor, seriesId: string, stageId: string | null | undefined): Promise<void> {
  if (stageId && !(await getStage(tx, seriesId, stageId))) throw new SeriesError('stage_id does not match a stage of this series', 400);
}

/** A planned config takes every active entrant (they are not known yet): `entrant_ids` must be empty. Validates the schedule part. */
export function normalisePlannedConfig(kind: SeriesBatchKind, config: GeneratorConfig): GeneratorConfig {
  if (config.entrant_ids && config.entrant_ids.length > 0) {
    throw new SeriesError('A planned schedule uses every approved entrant: leave entrant_ids empty', 400);
  }
  const { entrant_ids: _unused, ...rest } = config;
  asBadRequest(() => (kind === 'round_robin' ? assertScheduleConfig(rest as RoundRobinConfig) : assertRaceCalendarConfig(rest as RaceCalendarConfig)));
  return rest as GeneratorConfig;
}

async function assertTemplateGame(tx: Executor, series: SeriesRow, gameId: string | null | undefined): Promise<void> {
  const id = gameId || series.game_id;
  if (!id) throw new SeriesError('match.game_id is required (the series has no default game)', 400);
  const allowed = allowedGameIds(series);
  if (allowed && !allowed.includes(id)) throw new SeriesError(`Game ${id} is not one of this series' games`, 400);
  if (!(await getGame(tx, id))) throw new SeriesError(`Unknown game "${id}"`, 400);
}

function validDate(value: string | null | undefined, field: string): Date {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) throw new SeriesError(`${field} must be a valid date`, 400);
  return d;
}

// ─── planned batches ─────────────────────────────────────────────────────────

/** Inserts a planned batch at the end of the series order. Runs in the caller's transaction (series locked). */
export async function createPlannedBatchTx(tx: Executor, series: SeriesRow, input: CreatePlannedBatchInput): Promise<string> {
  const config = normalisePlannedConfig(input.kind, input.config);
  await assertStage(tx, series.id, config.stage_id);
  const id = genId('sbat');
  await tx.insert(seriesEventBatches).values({
    id, series_id: series.id, stage_id: config.stage_id ?? null, kind: input.kind, config: config as unknown as Record<string, unknown>,
    status: 'planned', position: await nextEventOrder(tx, series.id),
  });
  logger.debug(`Series ${series.id}: planned ${input.kind} ${id}`);
  return id;
}

export async function createPlannedBatch(ex: Executor, seriesId: string, input: CreatePlannedBatchInput): Promise<string> {
  return ex.transaction(async (tx) => createPlannedBatchTx(tx, await lockLayoutSeries(tx, seriesId), input));
}

/** Edits a planned batch: its config and / or its stage. 409 once it was generated (regenerate that one instead). */
export async function updatePlannedBatch(
  ex: Executor, seriesId: string, batchId: string, input: { config?: GeneratorConfig; stage_id?: string | null },
): Promise<void> {
  await ex.transaction(async (tx) => {
    await lockLayoutSeries(tx, seriesId);
    const batch = await getBatch(tx, seriesId, batchId);
    if (batch.status !== 'planned') throw new SeriesError('Only a planned schedule can be edited; regenerate a generated one instead', 409);
    const config = input.config ? normalisePlannedConfig(batch.kind, input.config) : (batch.config as unknown as GeneratorConfig);
    let stageId: string | null;
    if (input.stage_id !== undefined) stageId = input.stage_id;
    else stageId = input.config ? (config.stage_id ?? null) : batch.stage_id;
    await assertStage(tx, seriesId, stageId);
    await tx.update(seriesEventBatches).set({ config: { ...config, stage_id: stageId } as unknown as Record<string, unknown>, stage_id: stageId })
      .where(eq(seriesEventBatches.id, batchId));
  });
}

/** The batch's config as it is generated: every active entrant, the stage it sits in, the chosen division mode. */
function generationConfig(batch: SeriesBatchRow, input: GeneratePlannedBatchInput): GeneratorConfig {
  const config = { ...(batch.config as unknown as GeneratorConfig), entrant_ids: null, stage_id: batch.stage_id };
  if (batch.kind === 'round_robin' && input.divisions) (config as RoundRobinConfig).divisions = input.divisions;
  if (batch.kind === 'round_robin' && !(config as RoundRobinConfig).divisions) (config as RoundRobinConfig).divisions = 'none';
  return config;
}

interface PlannedFixtures {
  fixtures: GeneratedFixture[];
  byes: GeneratorPreview['byes'];
  warnings: string[];
}

function planFixtures(kind: SeriesBatchKind, config: GeneratorConfig, entrants: readonly ResolvedEntrant[]): PlannedFixtures {
  if (kind === 'round_robin') {
    if (entrants.length < 2) throw new SeriesError('A round robin needs at least 2 approved entrants', 400);
    const cfg = config as RoundRobinConfig;
    return asBadRequest(() => planRoundRobin(toPairingEntrants(entrants), cfg, cfg.match?.name_template));
  }
  if (entrants.length < 2) throw new SeriesError('A race calendar needs at least 2 approved entrants', 400);
  return { fixtures: asBadRequest(() => planRaceCalendar(config as RaceCalendarConfig, entrants.map((e) => e.id))), byes: [], warnings: [] };
}

/**
 * What generating a planned batch would create right now (writes nothing). `division_overrides` previews divisions that
 * are only chosen in the close dialog and not saved yet.
 */
export async function previewPlannedBatch(ex: Executor, seriesId: string, batchId: string, input: GeneratePlannedBatchInput = {}): Promise<GeneratorPreview> {
  const series = await getSeriesById(ex, seriesId);
  if (!series) throw new SeriesError('Series not found', 404);
  const batch = await getBatch(ex, seriesId, batchId);
  if (batch.status !== 'planned') throw new SeriesError('This schedule was already generated', 409);
  const overrides = input.division_overrides ?? {};
  const entrants = selectEntrants(await loadSeriesEntrants(ex, seriesId), null)
    .map((e) => (Object.hasOwn(overrides, e.id) ? { ...e, division: overrides[e.id] || null } : e));
  const plan = planFixtures(batch.kind, generationConfig(batch, input), entrants);
  return {
    fixtures: plan.fixtures, byes: plan.byes,
    warnings: [...rosterWarnings(series, entrants), ...plan.warnings, ...seriesDateWarnings(series, plan.fixtures)],
  };
}

/** Moves every event at or after `position` down by `n` (two phases, so the (series, event_order) unique never trips). */
async function makeRoom(tx: Executor, seriesId: string, position: number, n: number, exceptBatch: string): Promise<void> {
  if (n <= 0) return;
  await tx.update(seriesEvents).set({ event_order: sql`-(${seriesEvents.event_order} + ${n}::int)` })
    .where(and(eq(seriesEvents.series_id, seriesId), gte(seriesEvents.event_order, position)));
  await tx.update(seriesEvents).set({ event_order: sql`-${seriesEvents.event_order}` })
    .where(and(eq(seriesEvents.series_id, seriesId), lt(seriesEvents.event_order, 0)));
  await tx.update(seriesEventBatches).set({ position: sql`${seriesEventBatches.position} + ${n}::int` })
    .where(and(eq(seriesEventBatches.series_id, seriesId), gte(seriesEventBatches.position, position), ne(seriesEventBatches.id, exceptBatch)));
}

/**
 * Generates a planned batch inside the caller's transaction (builder context loaded, so the series is locked): plans the
 * fixtures with every active entrant, inserts them at the batch's slot in the series order and marks it generated.
 */
export async function generatePlannedBatchTx(
  tx: Executor, ctx: BuilderContext, batchId: string, input: GeneratePlannedBatchInput, after: AfterCommit,
): Promise<{ batch_id: string; event_ids: string[] }> {
  const seriesId = ctx.series.id;
  const [batch] = await tx.select().from(seriesEventBatches)
    .where(and(eq(seriesEventBatches.id, batchId), eq(seriesEventBatches.series_id, seriesId))).for('update');
  if (!batch) throw new SeriesError('Batch not found in this series', 404);
  if (batch.status !== 'planned') throw new SeriesError('This schedule was already generated', 409);

  const config = generationConfig(batch, input);
  const { fixtures } = planFixtures(batch.kind, config, selectEntrants(ctx.entrants, null));
  if (fixtures.length === 0) throw new SeriesError('The generator produced no fixtures', 400);
  if (fixtures.length > MAX_FIXTURES) throw new SeriesError(`A batch may hold at most ${MAX_FIXTURES} events`, 400);

  const position = batch.position ?? (await nextEventOrder(tx, seriesId));
  // The slot itself takes the first fixture, unless an event was moved onto that order number meanwhile.
  const [occupant] = await tx.select({ id: seriesEvents.id }).from(seriesEvents)
    .where(and(eq(seriesEvents.series_id, seriesId), eq(seriesEvents.event_order, position))).limit(1);
  await makeRoom(tx, seriesId, position, occupant ? fixtures.length : fixtures.length - 1, batch.id);
  const eventIds = await createBatchEvents(tx, seriesId, batch.kind, config, fixtures, batch.id, ctx, after, position);
  await tx.update(seriesEventBatches).set({ status: 'generated', position: null, config: config as unknown as Record<string, unknown> })
    .where(eq(seriesEventBatches.id, batch.id));
  logger.debug(`Series ${seriesId}: generated planned ${batch.kind} ${batch.id} (${eventIds.length} events)`);
  return { batch_id: batch.id, event_ids: eventIds };
}

export async function generatePlannedBatch(
  db: Db, seriesId: string, batchId: string, input: GeneratePlannedBatchInput = {},
): Promise<{ batch_id: string; event_ids: string[] }> {
  const after = new AfterCommit();
  const result = await db.transaction(async (tx) => generatePlannedBatchTx(tx, await loadBuilderContext(tx, seriesId), batchId, input, after));
  await after.run();
  return result;
}

// ─── single match placeholders ───────────────────────────────────────────────

function cleanTemplate(match: CreateSeriesPlannedMatchInput['match']): SeriesMatchTemplate & { name: string; start_date: string } {
  const name = typeof match.name === 'string' ? match.name.trim() : '';
  if (!name) throw new SeriesError('match.name is required for a match placeholder', 400);
  validDate(match.start_date, 'match.start_date');
  return { ...match, name };
}

/** Inserts a single match placeholder at the end of the series order. Runs in the caller's transaction (series locked). */
export async function createPlannedMatchTx(tx: Executor, series: SeriesRow, input: CreateSeriesPlannedMatchInput): Promise<string> {
  const template = cleanTemplate(input.match);
  await assertTemplateGame(tx, series, template.game_id);
  await assertStage(tx, series.id, input.stage_id);
  const role = input.role ?? 'regular';
  const id = newSeriesEventId();
  await tx.insert(seriesEvents).values({
    id, series_id: series.id, event_type: 'match', match_id: null, tournament_id: null,
    event_order: await nextEventOrder(tx, series.id),
    event_date: validDate(template.start_date, 'match.start_date'),
    points_multiplier: input.points_multiplier ?? 1.0,
    stage_id: input.stage_id ?? null,
    role,
    week: input.week ?? null,
    counts_for_standings: input.counts_for_standings ?? role === 'regular',
    batch_id: null,
    status: 'planned',
    entrant_ids: null,
    match_template: template,
  });
  logger.debug(`Series ${series.id}: planned match ${id}`);
  return id;
}

export async function createPlannedMatch(ex: Executor, seriesId: string, input: CreateSeriesPlannedMatchInput): Promise<string> {
  return ex.transaction(async (tx) => createPlannedMatchTx(tx, await lockLayoutSeries(tx, seriesId), input));
}

async function lockPlannedMatch(tx: Executor, seriesId: string, eventId: string): Promise<SeriesEventRow> {
  const [event] = await tx.select().from(seriesEvents).where(and(eq(seriesEvents.id, eventId), eq(seriesEvents.series_id, seriesId))).for('update');
  if (!event) throw new SeriesError('Event not found in this series', 404);
  if (event.status !== 'planned') throw new SeriesError('This event is no longer a placeholder (it was already filled)', 409);
  if (!event.match_template) throw new SeriesError('This placeholder is a playoff: seed it instead', 400);
  return event;
}

/** Edits a match placeholder's template (name, start, game, maps, rules); its date follows the start. */
export async function updatePlannedMatch(ex: Executor, seriesId: string, eventId: string, match: CreateSeriesPlannedMatchInput['match']): Promise<void> {
  await ex.transaction(async (tx) => {
    const series = await lockLayoutSeries(tx, seriesId);
    await lockPlannedMatch(tx, seriesId, eventId);
    const template = cleanTemplate(match);
    await assertTemplateGame(tx, series, template.game_id);
    await tx.update(seriesEvents).set({ match_template: template, event_date: validDate(template.start_date, 'match.start_date') })
      .where(eq(seriesEvents.id, eventId));
  });
}

/** Turns a match placeholder into its match with the given entrants (the placeholder row becomes the live event). */
export async function fillPlannedMatchTx(
  tx: Executor, ctx: BuilderContext, event: SeriesEventRow, entrantIds: readonly string[], after: AfterCommit,
): Promise<CreatedMatchEvent> {
  const template = event.match_template;
  if (!template) throw new SeriesError('This placeholder is a playoff: seed it instead', 400);
  if (entrantIds.length === 0) throw new SeriesError(`Pick the entrants of "${template.name ?? 'the match'}"`, 400);
  const startDate = template.start_date ?? event.event_date?.toISOString();
  if (!startDate) throw new SeriesError(`"${template.name ?? 'The match'}" has no start date`, 400);
  const input: CreateSeriesMatchInput = {
    entrant_ids: [...entrantIds], stage_id: event.stage_id, role: event.role, week: event.week,
    points_multiplier: event.points_multiplier, counts_for_standings: event.counts_for_standings,
    match: { ...template, start_date: startDate },
  };
  return createSeriesMatchEventTx(tx, ctx.series.id, input, after, { context: ctx, fillEventId: event.id });
}

export async function fillPlannedMatch(db: Db, seriesId: string, eventId: string, entrantIds: readonly string[]): Promise<CreatedMatchEvent> {
  const after = new AfterCommit();
  const result = await db.transaction(async (tx) => {
    const ctx = await loadBuilderContext(tx, seriesId);
    return fillPlannedMatchTx(tx, ctx, await lockPlannedMatch(tx, seriesId, eventId), entrantIds, after);
  });
  await after.run();
  return result;
}

// ─── closing registration ────────────────────────────────────────────────────

/**
 * Closes registration (from `registration`, or starts a draft from `created`) and builds the schedule in ONE transaction:
 * divisions saved, every match placeholder filled with its assigned entrants (all must be assigned), every planned batch
 * generated with the approved entrants, then the series moves to `active` (with the usual follow-ups: the first stage
 * starts). Pending entrants are left out. Errors: 404, 409 (wrong status), 400 (fewer than 2 approved entrants, missing
 * assignments, an unsatisfiable generator config).
 */
export async function closeRegistration(db: Db, seriesId: string, input: CloseRegistrationInput = {}): Promise<CloseRegistrationResult> {
  const after = new AfterCommit();
  const result = await db.transaction(async (tx) => {
    const locked = await lockSeries(tx, seriesId);
    if (!locked) throw new SeriesError('Series not found', 404);
    if (!CLOSABLE.includes(locked.status)) {
      throw new SeriesError(`Registration can only be closed for a draft series or one taking registrations (it is ${locked.status})`, 409);
    }

    if (input.divisions) {
      const own = new Set((await tx.select({ id: seriesEntrants.id }).from(seriesEntrants).where(eq(seriesEntrants.series_id, seriesId))).map((r) => r.id));
      for (const [entrantId, division] of Object.entries(input.divisions)) {
        if (!own.has(entrantId)) throw new SeriesError(`Entrant ${entrantId} does not belong to this series`, 400);
        const value = typeof division === 'string' && division.trim() ? division.trim() : null;
        await tx.update(seriesEntrants).set({ division: value }).where(eq(seriesEntrants.id, entrantId));
      }
    }

    const ctx = await loadBuilderContext(tx, seriesId);
    const active = selectEntrants(ctx.entrants, null);
    if (active.length < 2) throw new SeriesError('At least two approved entrants are needed to close registration', 400);

    const placeholders = (await tx.select().from(seriesEvents)
      .where(and(eq(seriesEvents.series_id, seriesId), eq(seriesEvents.status, 'planned'), isNotNull(seriesEvents.match_template)))
      .orderBy(asc(seriesEvents.event_order)).for('update'));
    const assigned = input.matches ?? {};
    for (const id of Object.keys(assigned)) {
      if (!placeholders.some((p) => p.id === id)) throw new SeriesError(`Event ${id} is not a match placeholder of this series`, 400);
    }
    const missing = placeholders.filter((p) => !(assigned[p.id]?.length));
    if (missing.length > 0) {
      throw new SeriesError(`Assign entrants to every match placeholder first: ${missing.map((p) => `"${p.match_template?.name ?? p.id}"`).join(', ')}`, 400);
    }
    const filled: string[] = [];
    for (const p of placeholders) {
      await fillPlannedMatchTx(tx, ctx, p, assigned[p.id], after);
      filled.push(p.id);
    }

    const planned = await tx.select({ id: seriesEventBatches.id, position: seriesEventBatches.position }).from(seriesEventBatches)
      .where(and(eq(seriesEventBatches.series_id, seriesId), eq(seriesEventBatches.status, 'planned')))
      .orderBy(asc(seriesEventBatches.position), asc(seriesEventBatches.created_at));
    for (const id of Object.keys(input.batches ?? {})) {
      if (!planned.some((b) => b.id === id)) throw new SeriesError(`Batch ${id} is not a planned schedule of this series`, 400);
    }
    const generated: CloseRegistrationResult['generated'] = [];
    for (const b of planned) {
      const r = await generatePlannedBatchTx(tx, ctx, b.id, input.batches?.[b.id] ?? {}, after);
      generated.push({ batch_id: b.id, event_count: r.event_ids.length });
    }

    if (!(await transitionSeriesStatus(tx, seriesId, locked.status, 'active'))) {
      throw new SeriesError('Series status changed concurrently, please refresh and retry', 409);
    }
    await afterSeriesTransition(tx, (await getSeriesById(tx, seriesId))!, locked.status, 'active');
    logger.info(`Series ${seriesId}: registration closed, ${filled.length} placeholder match(es) filled, ${generated.length} schedule(s) generated`);
    return { generated, filled };
  });
  await after.run();
  return result;
}

// ─── creating a series with its layout ───────────────────────────────────────

/**
 * Creates a series together with its whole layout (the create flow's Schedule step) in one transaction. Stage keys of the
 * layout are mapped to the new stage ids; items are created in order, so their order is the series order.
 */
export async function createSeriesWithLayout(db: Db, input: CreateSeriesInput, layout?: SeriesLayoutInput | null): Promise<string> {
  return db.transaction(async (tx) => {
    const id = await createSeriesChecked(tx, input);
    if (!layout || (layout.stages.length === 0 && layout.items.length === 0)) return id;
    const series = (await lockSeries(tx, id))!;

    const stageIds = new Map<string, string>();
    for (const stage of layout.stages) {
      if (stageIds.has(stage.key)) throw new SeriesError(`Stage key "${stage.key}" is used twice`, 400);
      const row = await createStage(tx, id, { name: stage.name, counts_toward_season: stage.counts_toward_season, scoring_config: stage.scoring_config ?? null });
      stageIds.set(stage.key, row.id);
    }
    const stageOf = (key: string | null | undefined): string | null => {
      if (!key) return null;
      const stageId = stageIds.get(key);
      if (!stageId) throw new SeriesError(`Unknown stage "${key}" in the layout`, 400);
      return stageId;
    };

    for (const item of layout.items) {
      if (item.type === 'batch') {
        await createPlannedBatchTx(tx, series, { kind: item.kind, config: { ...item.config, stage_id: stageOf(item.config.stage_id) } });
      } else if (item.type === 'match') {
        const { type: _t, ...rest } = item;
        await createPlannedMatchTx(tx, series, { ...rest, stage_id: stageOf(rest.stage_id) });
      } else {
        const { type: _t, ...rest } = item;
        const rule = rest.seeding_rule;
        await createSeriesPlannedEvent(tx, id, {
          ...rest, stage_id: stageOf(rest.stage_id),
          seeding_rule: { ...rule, stage_id: rule.source === 'stage' ? stageOf(rule.stage_id) : null },
        });
      }
    }
    logger.debug(`Series ${id}: created with ${layout.stages.length} stage(s) and ${layout.items.length} placeholder(s)`);
    return id;
  });
}
