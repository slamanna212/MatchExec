/**
 * Playoffs: seed a planned event (turn it into a real bracket tournament from the standings of its source stage /
 * the season), complete a stage and enqueue the champion post when the series completes.
 *
 * Seeding runs in ONE transaction: series lock (via the builder context) -> tournament -> matches, the planned event
 * row becomes the live one (`fillEventId`), and the `playoff_seeded` Discord post is queued with it.
 */
import { and, eq } from 'drizzle-orm';
import type { Db, Executor } from '../../../lib/db';
import { seriesEvents } from '../../../lib/db/schema';
import type {
  CreateSeriesTournamentInput, SeedPreviewResponse, SeriesSeedingRule, SeriesUpdatePayload,
} from '../../../shared/series-types';
import { logger } from '../logger';
import { AfterCommit } from '../matches/effects';
import { enqueueSeriesUpdate } from '../queues/enqueue';
import { createSeriesTournamentEventTx, loadBuilderContext } from './builder';
import { listEntrants, type SeriesEntrantWithMembers } from './entrants';
import { SeriesError, getSeriesById, type SeriesRow } from './series';
import { getSeriesStandingsResponse } from './standings';
import { getStage, listStages, setStageStatus, type SeriesStageRow } from './stages';
import { getSeriesEventDto, type SeriesEventWire } from './summary';

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
function pickOverall(ranked: RankedEntrant[], top: number): { picked: RankedEntrant[]; warnings: string[] } {
  const c = cut(ranked, top);
  const warnings: string[] = [];
  if (c.tiedAtCut) warnings.push(`Tie at the cut-off: entrants ranked ${c.taken[top - 1].rank} straddle the last qualifying place (position ${top})`);
  if (c.taken.length < top) warnings.push(`Only ${c.taken.length} entrant(s) are available but ${top} qualify`);
  return { picked: c.taken, warnings };
}

/** The top `top` of every division, interleaved by division rank, with the warnings about each division's cut-off. */
function pickPerDivision(ranked: RankedEntrant[], top: number): { picked: RankedEntrant[]; warnings: string[] } {
  const groups = groupByDivision(ranked);
  const cuts = groups.map((g) => cut(g, top));
  const warnings: string[] = [];
  for (const [i, c] of cuts.entries()) {
    const label = groups[i][0].entrant.division ?? 'No division';
    if (c.tiedAtCut) warnings.push(`Tie at the cut-off in division "${label}": entrants ranked ${c.taken[top - 1].rank} straddle the last qualifying place`);
    if (c.taken.length < top) warnings.push(`Division "${label}" has only ${c.taken.length} entrant(s) but ${top} qualify per division`);
  }
  return { picked: interleave(cuts.map((c) => c.taken), top), warnings };
}

async function computeQualifiers(ex: Executor, series: SeriesRow, rule: SeriesSeedingRule): Promise<SeedPreviewResponse> {
  const entrants = await listEntrants(ex, series.id);
  if (entrants.length === 0) {
    return { qualifiers: [], warnings: ['This series has no entrants (legacy series): playoffs cannot be seeded'], blockers: [] };
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
  const { picked, warnings: pickWarnings } = rule.per_division ? pickPerDivision(ranked, top) : pickOverall(ranked, top);
  warnings.push(...pickWarnings);
  if (picked.length < 2) warnings.push('At least 2 qualifiers are needed to seed a bracket');

  return {
    qualifiers: picked.map((r, i) => ({ entrant_id: r.entrant.id, name: r.entrant.name, seed: i + 1, rank: r.rank, division: r.entrant.division })),
    warnings,
    blockers,
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
