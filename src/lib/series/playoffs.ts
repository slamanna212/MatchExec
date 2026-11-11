/**
 * Playoffs: seed a planned event (turn it into a real bracket tournament from the standings of its source stage /
 * the season), complete a stage and enqueue the champion post when the series completes.
 *
 * Seeding runs in ONE transaction: series lock (via the builder context) -> tournament -> matches, the planned event
 * row becomes the live one (`fillEventId`), and the `playoff_seeded` Discord post is queued with it.
 */
import { and, eq } from 'drizzle-orm';
import type { Db, Executor } from '../../../lib/db';
import { series as seriesTable, seriesEventBatches, seriesEvents } from '../../../lib/db/schema';
import type {
  CreateSeriesTournamentInput, ProjectedBracketResponse, SeedPreviewResponse, SeriesSeedingRule, SeriesUpdatePayload,
} from '../../../shared/series-types';
import { logger } from '../logger';
import { AfterCommit } from '../matches/effects';
import { enqueueSeriesUpdate } from '../queues/enqueue';
import { seedOrder } from '../tournaments/bracket-math';
import { createSeriesTournamentEventTx, loadBuilderContext } from './builder';
import { listEntrants, type SeriesEntrantWithMembers } from './entrants';
import { SeriesError, getSeriesById, type SeriesRow } from './series';
import { getSeriesStandingsResponse } from './standings';
import { getStage, listStages, setStageStatus, type SeriesStageRow } from './stages';
import { getSeriesEventDto, isEventFinished, listSeriesEventDetails, type SeriesEventWire } from './summary';

type SeriesEventRow = typeof seriesEvents.$inferSelect;
type Qualifier = SeedPreviewResponse['qualifiers'][number];

export interface SeedPlayoffInput {
  /** Manual seed order (1st = top seed) instead of the computed qualifiers. A manual order skips the stage-complete check. */
  entrant_ids?: string[];
  /** Seed even though the source stage / season is not complete yet (see `SeedPreviewResponse.blockers`). */
  force?: boolean;
}

export interface SeededPlayoffResult {
  event: SeriesEventWire;
  tournament_id: string;
}

export interface CompleteStageResult {
  stage: SeriesStageRow;
  seedable_event_ids: string[];
}

interface PlannedEvent {
  event: SeriesEventRow;
  rule: SeriesSeedingRule;
}

/** The event must be a planned one with a seeding rule: 404 unknown, 409 not planned, 400 without a rule. */
function requirePlanned(event: SeriesEventRow | undefined): PlannedEvent {
  if (!event) throw new SeriesError('Event not found in this series', 404);
  if (event.status !== 'planned') throw new SeriesError('Only a planned event can be seeded', 409);
  if (!event.seeding_rule) throw new SeriesError('This planned event has no seeding rule', 400);
  return { event, rule: event.seeding_rule };
}

// ─── qualifiers ──────────────────────────────────────────────────────────────

interface RankedEntrant {
  entrant: SeriesEntrantWithMembers;
  rank: number;
}

/** Division groups by name, entrants without a division last; members keep their standings order. */
function groupByDivision(ranked: RankedEntrant[]): RankedEntrant[][] {
  const groups = new Map<string, RankedEntrant[]>();
  for (const r of ranked) {
    const key = r.entrant.division ?? '';
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const named = [...groups.keys()].filter((k) => k !== '').sort((a, b) => a.localeCompare(b));
  return [...named, ...(groups.has('') ? [''] : [])].map((k) => groups.get(k)!);
}

/** Top `top` of a list plus whether the cut-off splits a tie (equal rank at the last qualifier and the first non-qualifier). */
function cut(list: RankedEntrant[], top: number): { taken: RankedEntrant[]; tiedAtCut: boolean } {
  const taken = list.slice(0, top);
  const next = list[top];
  return { taken, tiedAtCut: !!next && taken.length === top && taken[top - 1].rank === next.rank };
}

/** Per-division picks interleaved by division rank: A #1, B #1, A #2, B #2, ... */
function interleave(groups: RankedEntrant[][], top: number): RankedEntrant[] {
  const out: RankedEntrant[] = [];
  for (let i = 0; i < top; i++) {
    for (const g of groups) if (g[i]) out.push(g[i]);
  }
  return out;
}

/** Problems with the source of the standings: an unfinished stage / season (these block seeding), or a rule pointing at a deleted stage (throws). */
async function sourceBlockers(ex: Executor, seriesId: string, rule: SeriesSeedingRule): Promise<string[]> {
  const stages = await listStages(ex, seriesId);
  if (rule.source === 'stage') {
    const stage = stages.find((s) => s.id === rule.stage_id);
    if (!stage) throw new SeriesError('The seeding rule\'s stage no longer exists', 400);
    return stage.status === 'complete' ? [] : [`Stage "${stage.name}" is not complete yet: the standings may still change`];
  }
  const open = stages.filter((s) => s.counts_toward_season && s.status !== 'complete');
  return open.length > 0 ? [`The season is not finished: ${open.map((s) => `"${s.name}"`).join(', ')} not complete yet`] : [];
}

/** The top `top` overall, with the warnings about the cut-off. */
function pickOverall(ranked: RankedEntrant[], top: number): { picked: RankedEntrant[]; warnings: string[]; tied: boolean } {
  const c = cut(ranked, top);
  const warnings: string[] = [];
  if (c.tiedAtCut) warnings.push(`Tie at the cut-off: entrants ranked ${c.taken[top - 1].rank} straddle the last qualifying place (position ${top})`);
  if (c.taken.length < top) warnings.push(`Only ${c.taken.length} entrant(s) are available but ${top} qualify`);
  return { picked: c.taken, warnings, tied: c.tiedAtCut };
}

/** The top `top` of every division, interleaved by division rank, with the warnings about each division's cut-off. */
function pickPerDivision(ranked: RankedEntrant[], top: number): { picked: RankedEntrant[]; warnings: string[]; tied: boolean } {
  const groups = groupByDivision(ranked);
  const cuts = groups.map((g) => cut(g, top));
  const warnings: string[] = [];
  for (const [i, c] of cuts.entries()) {
    const label = groups[i][0].entrant.division ?? 'No division';
    if (c.tiedAtCut) warnings.push(`Tie at the cut-off in division "${label}": entrants ranked ${c.taken[top - 1].rank} straddle the last qualifying place`);
    if (c.taken.length < top) warnings.push(`Division "${label}" has only ${c.taken.length} entrant(s) but ${top} qualify per division`);
  }
  return { picked: interleave(cuts.map((c) => c.taken), top), warnings, tied: cuts.some((c) => c.tiedAtCut) };
}

type QualifierResult = SeedPreviewResponse & { tied: boolean };

async function computeQualifiers(ex: Executor, series: SeriesRow, rule: SeriesSeedingRule): Promise<SeedPreviewResponse> {
  const { tied: _tied, ...preview } = await computeQualifiersDetailed(ex, series, rule);
  return preview;
}

async function computeQualifiersDetailed(ex: Executor, series: SeriesRow, rule: SeriesSeedingRule): Promise<QualifierResult> {
  const entrants = await listEntrants(ex, series.id);
  if (entrants.length === 0) {
    return { qualifiers: [], warnings: ['This series has no entrants (legacy series): playoffs cannot be seeded'], blockers: [], tied: false };
  }
  const blockers = await sourceBlockers(ex, series.id, rule);
  const warnings = [...blockers];
  if (series.status !== 'active') warnings.push(`The series is ${series.status}: playoffs can only be seeded while it is active`);

  const standings = await getSeriesStandingsResponse(ex, series.id, { scope: rule.source === 'stage' ? (rule.stage_id ?? undefined) : 'season' });
  const active = new Map(entrants.filter((e) => e.status === 'active').map((e) => [e.id, e]));
  const ranked: RankedEntrant[] = (standings?.rows ?? [])
    .filter((r) => r.entrant_id && active.has(r.entrant_id))
    .map((r) => ({ entrant: active.get(r.entrant_id!)!, rank: r.rank }));

  const top = Math.max(1, Math.floor(rule.top));
  const { picked, warnings: pickWarnings, tied } = rule.per_division ? pickPerDivision(ranked, top) : pickOverall(ranked, top);
  warnings.push(...pickWarnings);
  if (picked.length < 2) warnings.push('At least 2 qualifiers are needed to seed a bracket');

  return {
    qualifiers: picked.map((r, i) => ({ entrant_id: r.entrant.id, name: r.entrant.name, seed: i + 1, rank: r.rank, division: r.entrant.division })),
    warnings,
    blockers,
    tied,
  };
}

/** Validates a manual seed order: distinct active entrants of this series, at least 2. Returns them as qualifiers in that order. */
async function overrideQualifiers(ex: Executor, seriesId: string, ids: readonly string[]): Promise<Qualifier[]> {
  if (new Set(ids).size !== ids.length) throw new SeriesError('entrant_ids lists an entrant more than once', 400);
  if (ids.length < 2) throw new SeriesError('At least 2 entrants are needed to seed a bracket', 400);
  const byId = new Map((await listEntrants(ex, seriesId)).map((e) => [e.id, e]));
  return ids.map((id, i) => {
    const entrant = byId.get(id);
    if (!entrant) throw new SeriesError(`Entrant ${id} does not belong to this series`, 400);
    if (entrant.status !== 'active') throw new SeriesError(`Entrant "${entrant.name}" is ${entrant.status}; only active entrants can be seeded`, 400);
    return { entrant_id: id, name: entrant.name, seed: i + 1, rank: i + 1, division: entrant.division };
  });
}

// ─── preview ─────────────────────────────────────────────────────────────────

/**
 * Who would qualify for a planned playoff event right now (standings of the rule's scope, active entrants only) and
 * what to watch out for. 404 unknown series / event, 409 when the event is not planned, 400 without a seeding rule.
 */
export async function getSeedPreview(ex: Executor, seriesId: string, eventId: string): Promise<SeedPreviewResponse> {
  const series = await getSeriesById(ex, seriesId);
  if (!series) throw new SeriesError('Series not found', 404);
  const [row] = await ex.select().from(seriesEvents).where(and(eq(seriesEvents.id, eventId), eq(seriesEvents.series_id, seriesId)));
  const { rule } = requirePlanned(row);
  return computeQualifiers(ex, series, rule);
}

// ─── seeding ─────────────────────────────────────────────────────────────────

/**
 * Seeds a planned playoff event: creates the bracket tournament from `seeding_rule.template` + `format` with the
 * qualifiers (or the manual `entrant_ids` order) as pre-assigned teams, turns the planned row into the live event and
 * queues the `playoff_seeded` post, all in one transaction. Errors: 404, 409 (not planned / series finished), 400
 * (legacy series without entrants, fewer than 2 qualifiers, invalid override), 409 also when the series is not active or
 * the source stage / season is not complete (unless `force` or a manual order is given).
 */
export async function seedPlayoffEvent(db: Db, seriesId: string, eventId: string, input: SeedPlayoffInput = {}): Promise<SeededPlayoffResult> {
  const after = new AfterCommit();
  const tournamentId = await db.transaction(async (tx) => {
    const ctx = await loadBuilderContext(tx, seriesId);
    const [row] = await tx.select().from(seriesEvents)
      .where(and(eq(seriesEvents.id, eventId), eq(seriesEvents.series_id, seriesId))).for('update');
    const { event, rule } = requirePlanned(row);
    if (ctx.entrants.size === 0) throw new SeriesError('This series has no entrants (legacy series): playoffs cannot be seeded', 400);
    if (ctx.series.status !== 'active') throw new SeriesError(`Playoffs can only be seeded while the series is active (it is ${ctx.series.status})`, 409);

    let qualifiers: Qualifier[];
    if (input.entrant_ids) {
      qualifiers = await overrideQualifiers(tx, seriesId, input.entrant_ids); // an explicit order skips the stage check
    } else {
      const computed = await computeQualifiers(tx, ctx.series, rule);
      if (computed.blockers.length > 0 && !input.force) {
        throw new SeriesError(`Cannot seed yet: ${computed.blockers.join('; ')}. Send force: true to seed anyway.`, 409);
      }
      qualifiers = computed.qualifiers;
    }
    if (qualifiers.length < 2) throw new SeriesError('At least 2 qualifiers are needed to seed a bracket', 400);
    const ids = qualifiers.map((q) => q.entrant_id);

    const tournamentInput: CreateSeriesTournamentInput = {
      entrant_ids: ids,
      seed_order: ids,
      format: rule.format,
      stage_id: event.stage_id,
      role: event.role,
      week: event.week,
      points_multiplier: event.points_multiplier,
      counts_for_standings: event.counts_for_standings,
      tournament: rule.template,
    };
    const created = await createSeriesTournamentEventTx(tx, seriesId, tournamentInput, after, { context: ctx, fillEventId: event.id });

    if (ctx.series.announcements) {
      const payload: SeriesUpdatePayload = {
        event_id: created.event_id,
        tournament_id: created.tournament_id,
        stage_id: event.stage_id,
        qualifiers: qualifiers.map((q) => ({ seed: q.seed, name: q.name, entrant_id: q.entrant_id })),
      };
      await enqueueSeriesUpdate(tx, { seriesId, kind: 'playoff_seeded', dedupeKey: `playoff:${created.event_id}`, payload });
    }
    logger.debug(`Series ${seriesId}: seeded playoff event ${eventId} with ${ids.length} entrants`);
    return created.tournament_id;
  });
  await after.run();

  const dto = await getSeriesEventDto(db, seriesId, eventId);
  if (!dto) throw new SeriesError('Event not found in this series', 404);
  return { event: dto, tournament_id: tournamentId };
}

// ─── stage completion ────────────────────────────────────────────────────────

/**
 * Completes a stage (from `active` or `upcoming`), activates the next stage by order when it is still `upcoming` and
 * lists the planned playoff events that can be seeded now: rules sourced from this stage, plus season rules once every
 * stage that counts toward the season is complete.
 */
export async function completeStage(db: Db, seriesId: string, stageId: string): Promise<CompleteStageResult> {
  return db.transaction(async (tx) => {
    // setStageStatus takes the series lock (409 for a finished series) and enforces the forward-only status rule
    const stage = await setStageStatus(tx, seriesId, stageId, 'complete');
    const stages = await listStages(tx, seriesId);
    const next = stages.find((s) => s.stage_order > stage.stage_order);
    if (next?.status === 'upcoming') await setStageStatus(tx, seriesId, next.id, 'active');

    // The season is decided once no stage that counts toward it is still open (the same rule `sourceBlockers` seeds by);
    // a later stage outside the season (the playoffs themselves) does not hold it up.
    const seasonDecided = stages.every((s) => !s.counts_toward_season || s.status === 'complete');
    const planned = await tx.select().from(seriesEvents).where(and(eq(seriesEvents.series_id, seriesId), eq(seriesEvents.status, 'planned')));
    const seedable = planned
      .filter((e) => {
        const rule = e.seeding_rule;
        if (!rule) return false;
        return rule.source === 'stage' ? rule.stage_id === stageId : seasonDecided;
      })
      .sort((a, b) => a.event_order - b.event_order)
      .map((e) => e.id);
    return { stage: (await getStage(tx, seriesId, stageId))!, seedable_event_ids: seedable };
  });
}

// ─── series completion ───────────────────────────────────────────────────────

/**
 * Called from `afterSeriesTransition` when a series becomes `complete`: queues the `champion` post (deduped, once per
 * series) when the series announces. The bot works out the champion itself when it posts.
 */
export async function onSeriesCompleted(tx: Executor, seriesId: string): Promise<void> {
  const series = await getSeriesById(tx, seriesId);
  if (!series?.announcements) return;
  await enqueueSeriesUpdate(tx, { seriesId, kind: 'champion', dedupeKey: 'champion' });
}

// ─── projected bracket ───────────────────────────────────────────────────────

/** First-round pairings of a bracket in bracket order (`seedOrder`); an odd seed out gets a bye (`b` null). */
export function projectPairings(qualifiers: SeedPreviewResponse['qualifiers']): ProjectedBracketResponse['pairings'] {
  const order = seedOrder(qualifiers.length);
  const bySeed = new Map(qualifiers.map((q) => [q.seed, q]));
  const pairings: ProjectedBracketResponse['pairings'] = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = bySeed.get(order[i]);
    if (!a) continue;
    pairings.push({ a, b: order[i + 1] === undefined ? null : (bySeed.get(order[i + 1]) ?? null) });
  }
  return pairings;
}

/**
 * Whether a seeding rule's source is decided: a stage source once the stage is complete; the season once every stage
 * that counts toward it is complete, or (a series without such stages) once every counting event is played and no
 * regular placeholder (planned schedule or match) is left.
 */
export async function isSeedingSourceDecided(
  ex: Executor, seriesId: string, rule: SeriesSeedingRule, ownStageId: string | null = null,
): Promise<boolean> {
  const stages = await listStages(ex, seriesId);
  if (rule.source === 'stage') return stages.find((s) => s.id === rule.stage_id)?.status === 'complete';
  // the playoff's own stage cannot hold it up (it is played after the season it reads)
  const counted = stages.filter((s) => s.counts_toward_season && s.id !== ownStageId);
  if (counted.length > 0) return counted.every((s) => s.status === 'complete');

  const [plannedBatch] = await ex.select({ id: seriesEventBatches.id }).from(seriesEventBatches)
    .where(and(eq(seriesEventBatches.series_id, seriesId), eq(seriesEventBatches.status, 'planned'))).limit(1);
  if (plannedBatch) return false;
  const events = await listSeriesEventDetails(ex, seriesId);
  if (events.some((e) => e.status === 'planned' && e.match_template && e.counts_for_standings)) return false;
  const counting = events.filter((e) => e.status === 'live' && e.counts_for_standings);
  return counting.length > 0 && counting.every((e) => isEventFinished(e.target_status));
}

/**
 * The playoff of a planned event as it would be seeded from the standings right now: qualifiers, first-round pairings
 * (brackets) and whether it is still provisional. Works in every series status, so a registration / running season can
 * show its playoff picture (and, later, a live Discord embed).
 */
export async function getProjectedBracket(ex: Executor, seriesId: string, eventId: string): Promise<ProjectedBracketResponse> {
  const series = await getSeriesById(ex, seriesId);
  if (!series) throw new SeriesError('Series not found', 404);
  const [row] = await ex.select().from(seriesEvents).where(and(eq(seriesEvents.id, eventId), eq(seriesEvents.series_id, seriesId)));
  const { rule } = requirePlanned(row);
  const preview = await computeQualifiers(ex, series, rule);
  return {
    event_id: eventId,
    format: rule.format,
    provisional: !(await isSeedingSourceDecided(ex, seriesId, rule, row?.stage_id ?? null)),
    qualifiers: preview.qualifiers,
    pairings: rule.format === 'cumulative-points' ? [] : projectPairings(preview.qualifiers),
    warnings: preview.warnings,
  };
}

// ─── automatic progression ───────────────────────────────────────────────────

export interface AdvanceSeriesResult {
  completed_stages: string[];
  seeded: string[];
}

/**
 * Moves a running season along without an admin: an active stage whose every event is played (and that has no
 * placeholder left) is completed (the next stage starts), then every playoff placeholder with `auto_seed` (default on)
 * whose source is decided and whose cut-off is not tied is seeded. Safe to run repeatedly; a series that is not active
 * is left alone.
 */
export async function advanceSeries(db: Db, seriesId: string): Promise<AdvanceSeriesResult> {
  const result: AdvanceSeriesResult = { completed_stages: [], seeded: [] };
  const series = await getSeriesById(db, seriesId);
  if (series?.status !== 'active') return result;

  const plannedBatches = await db.select({ stage_id: seriesEventBatches.stage_id }).from(seriesEventBatches)
    .where(and(eq(seriesEventBatches.series_id, seriesId), eq(seriesEventBatches.status, 'planned')));
  const events = await listSeriesEventDetails(db, seriesId);
  for (const stage of (await listStages(db, seriesId)).filter((s) => s.status === 'active')) {
    const inStage = events.filter((e) => e.stage_id === stage.id);
    const live = inStage.filter((e) => e.status === 'live');
    // A playoff that reads this very stage cannot hold it up (it is seeded from it).
    const waiting = inStage.some((e) => e.status === 'planned' && !(e.seeding_rule?.source === 'stage' && e.seeding_rule.stage_id === stage.id))
      || plannedBatches.some((b) => b.stage_id === stage.id);
    if (live.length === 0 || waiting || !live.every((e) => isEventFinished(e.target_status))) continue;
    await completeStage(db, seriesId, stage.id);
    result.completed_stages.push(stage.id);
    logger.info(`Series ${seriesId}: stage "${stage.name}" completed automatically (every event played)`);
  }

  const planned = await db.select().from(seriesEvents).where(and(eq(seriesEvents.series_id, seriesId), eq(seriesEvents.status, 'planned')));
  for (const event of planned.sort((a, b) => a.event_order - b.event_order)) {
    const rule = event.seeding_rule;
    if (!rule || rule.auto_seed === false) continue;
    if (!(await isSeedingSourceDecided(db, seriesId, rule, event.stage_id))) continue;
    const qualifiers = await computeQualifiersDetailed(db, series, rule);
    if (qualifiers.tied) {
      logger.info(`Series ${seriesId}: playoff ${event.id} not seeded automatically (tie at the cut-off; seed it by hand)`);
      continue;
    }
    if (qualifiers.qualifiers.length < 2) continue;
    try {
      await seedPlayoffEvent(db, seriesId, event.id, { force: true });
      result.seeded.push(event.id);
      logger.info(`Series ${seriesId}: playoff "${rule.template.name}" seeded automatically`);
    } catch (error) {
      logger.warning(`Series ${seriesId}: automatic seeding of ${event.id} failed:`, error);
    }
  }
  return result;
}

/** `advanceSeries` for every active series (the scheduler's series job). One failing series does not stop the others. */
export async function advanceActiveSeries(db: Db): Promise<{ checked: number; completed_stages: number; seeded: number }> {
  const rows = await db.select({ id: seriesTable.id }).from(seriesTable).where(eq(seriesTable.status, 'active'));
  let completed = 0;
  let seeded = 0;
  for (const row of rows) {
    try {
      const r = await advanceSeries(db, row.id);
      completed += r.completed_stages.length;
      seeded += r.seeded.length;
    } catch (error) {
      logger.error(`Series ${row.id}: automatic progression failed:`, error);
    }
  }
  return { checked: rows.length, completed_stages: completed, seeded };
}
