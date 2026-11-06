/**
 * `series_stages`: ordered groups of events with their own standings. Every mutation takes the series row lock; orders
 * are kept as a gap-free 1..n sequence, renumbered in two phases so the (series_id, stage_order) unique never trips.
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { seriesStages } from '../../../lib/db/schema';
import type { SeriesScoringConfig, SeriesStageStatus } from '../../../shared/series-types';
import { genId } from '../matches/ids';
import { logger } from '../logger';
import { SeriesError, lockSeries } from './series';
import { validateStageStatusTransition } from './validation';

export type SeriesStageRow = typeof seriesStages.$inferSelect;

export const newStageId = (): string => genId('sstg');

export interface CreateStageInput {
  name: string;
  /** 1-based position; later stages shift down. Default: last. */
  stage_order?: number;
  counts_toward_season?: boolean;
  scoring_config?: SeriesScoringConfig | null;
  status?: SeriesStageStatus;
}

export interface UpdateStageInput {
  name?: string;
  /** Moves the stage to this 1-based position (others shift). */
  stage_order?: number;
  counts_toward_season?: boolean;
  scoring_config?: SeriesScoringConfig | null;
  status?: SeriesStageStatus;
}

export async function listStages(ex: Executor, seriesId: string): Promise<SeriesStageRow[]> {
  return ex.select().from(seriesStages).where(eq(seriesStages.series_id, seriesId)).orderBy(asc(seriesStages.stage_order), asc(seriesStages.id));
}

export async function getStage(ex: Executor, seriesId: string, stageId: string): Promise<SeriesStageRow | null> {
  const [row] = await ex.select().from(seriesStages).where(and(eq(seriesStages.id, stageId), eq(seriesStages.series_id, seriesId)));
  return row ?? null;
}

async function lockEditable(tx: Executor, seriesId: string): Promise<void> {
  const row = await lockSeries(tx, seriesId);
  if (!row) throw new SeriesError('Series not found', 404);
  if (row.status === 'complete' || row.status === 'cancelled') throw new SeriesError(`Cannot modify the stages of a ${row.status} series`, 409);
}

/** Renumbers the series' stages to 1..n in the given id order (two phases: park on negatives, then final). */
async function applyOrder(tx: Executor, seriesId: string, orderedIds: string[]): Promise<void> {
  await tx.update(seriesStages).set({ stage_order: sql`-${seriesStages.stage_order}` }).where(eq(seriesStages.series_id, seriesId));
  for (const [i, id] of orderedIds.entries()) {
    await tx.update(seriesStages).set({ stage_order: i + 1 }).where(eq(seriesStages.id, id));
  }
}

const clampPosition = (pos: number, n: number): number => Math.max(1, Math.min(pos, n));

/** Creates a stage. Throws `SeriesError` (404 unknown series, 409 finished series). Returns the stage. */
export async function createStage(ex: Executor, seriesId: string, input: CreateStageInput): Promise<SeriesStageRow> {
  return ex.transaction(async (tx) => {
    await lockEditable(tx, seriesId);
    const existing = await listStages(tx, seriesId);
    const id = newStageId();
    // park the new row at the end, then move it into place
    await tx.insert(seriesStages).values({
      id, series_id: seriesId, name: input.name.trim(), stage_order: existing.length + 1, status: input.status ?? 'upcoming',
      counts_toward_season: input.counts_toward_season ?? true, scoring_config: input.scoring_config ?? null,
    });
    if (input.stage_order !== undefined && input.stage_order <= existing.length) {
      const ids = existing.map((s) => s.id);
      ids.splice(clampPosition(input.stage_order, existing.length + 1) - 1, 0, id);
      await applyOrder(tx, seriesId, ids);
    }
    logger.debug(`Series stage ${id} created in ${seriesId}`);
    return (await getStage(tx, seriesId, id))!;
  });
}

/**
 * Edits a stage; changing `stage_order` moves it (the others shift), changing `status` must move forward
 * (upcoming -> active -> complete). Throws `SeriesError` (404, 400 illegal status move, 409 finished series).
 */
export async function updateStage(ex: Executor, seriesId: string, stageId: string, updates: UpdateStageInput): Promise<SeriesStageRow> {
  return ex.transaction(async (tx) => {
    await lockEditable(tx, seriesId);
    const stage = await getStage(tx, seriesId, stageId);
    if (!stage) throw new SeriesError('Stage not found in this series', 404);
    if (updates.status !== undefined) {
      const err = validateStageStatusTransition(stage.status, updates.status);
      if (err) throw new SeriesError(err, 400);
    }
    const set: Partial<typeof seriesStages.$inferInsert> = {};
    if (updates.name !== undefined) set.name = updates.name.trim();
    if (updates.counts_toward_season !== undefined) set.counts_toward_season = updates.counts_toward_season;
    if (updates.scoring_config !== undefined) set.scoring_config = updates.scoring_config;
    if (updates.status !== undefined) set.status = updates.status;
    if (Object.keys(set).length > 0) await tx.update(seriesStages).set(set).where(eq(seriesStages.id, stageId));

    if (updates.stage_order !== undefined && updates.stage_order !== stage.stage_order) {
      const ids = (await listStages(tx, seriesId)).map((s) => s.id).filter((id) => id !== stageId);
      ids.splice(clampPosition(updates.stage_order, ids.length + 1) - 1, 0, stageId);
      await applyOrder(tx, seriesId, ids);
    }
    return (await getStage(tx, seriesId, stageId))!;
  });
}

/** Sets a stage's status (the stage-complete flow of the playoffs package uses this). Same rules as `updateStage`. */
export async function setStageStatus(ex: Executor, seriesId: string, stageId: string, status: SeriesStageStatus): Promise<SeriesStageRow> {
  return updateStage(ex, seriesId, stageId, { status });
}

/** Deletes a stage; its events stay in the series with `stage_id = null` (FK set null) and the order is compacted. */
export async function deleteStage(ex: Executor, seriesId: string, stageId: string): Promise<void> {
  await ex.transaction(async (tx) => {
    await lockEditable(tx, seriesId);
    const rows = await tx.delete(seriesStages).where(and(eq(seriesStages.id, stageId), eq(seriesStages.series_id, seriesId))).returning({ id: seriesStages.id });
    if (rows.length === 0) throw new SeriesError('Stage not found in this series', 404);
    await applyOrder(tx, seriesId, (await listStages(tx, seriesId)).map((s) => s.id));
  });
}
