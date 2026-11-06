// @vitest-environment node
/** Series stages: create / reorder / status / delete (domain level), and events moving between stages. */
import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import { insertSeries, insertStage, linkEvent } from '../../utils/pg-series-fixtures';
import {
  addSeriesEvent, createStage, deleteStage, listStages, setStageStatus, updateSeriesEvent, updateStage, validateStageStatusTransition,
} from '@/lib/series';
import { seriesEvents } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();
const names = async (seriesId: string) => (await listStages(pg(), seriesId)).map((s) => `${s.stage_order}:${s.name}`);
const rejects = (p: Promise<unknown>, status: number) => expect(p).rejects.toMatchObject({ name: 'SeriesError', status });

describe('createStage', () => {
  it('appends by default and inserts at a position, shifting the others', async () => {
    const s = await insertSeries();
    await createStage(pg(), s.id, { name: 'Stage 1' });
    await createStage(pg(), s.id, { name: 'Stage 2' });
    const playoffs = await createStage(pg(), s.id, { name: 'Playoffs', counts_toward_season: false });
    expect(playoffs).toMatchObject({ stage_order: 3, status: 'upcoming', counts_toward_season: false, scoring_config: null });
    await createStage(pg(), s.id, { name: 'Preseason', stage_order: 1 });
    expect(await names(s.id)).toEqual(['1:Preseason', '2:Stage 1', '3:Stage 2', '4:Playoffs']);
  });

  it('stores a scoring_config override and rejects finished or unknown series', async () => {
    const s = await insertSeries();
    const st = await createStage(pg(), s.id, { name: 'S', scoring_config: { mode: 'head_to_head', win_points: 3 } });
    expect(st.scoring_config).toEqual({ mode: 'head_to_head', win_points: 3 });
    await rejects(createStage(pg(), (await insertSeries({ status: 'cancelled' })).id, { name: 'X' }), 409);
    await rejects(createStage(pg(), 'nope', { name: 'X' }), 404);
  });
});

describe('updateStage', () => {
  it('renames, flags and moves a stage with the others shifting', async () => {
    const s = await insertSeries();
    const [a, , c] = [await createStage(pg(), s.id, { name: 'A' }), await createStage(pg(), s.id, { name: 'B' }), await createStage(pg(), s.id, { name: 'C' })];
    await updateStage(pg(), s.id, c.id, { stage_order: 1 });
    expect(await names(s.id)).toEqual(['1:C', '2:A', '3:B']);
    await updateStage(pg(), s.id, a.id, { stage_order: 99 }); // clamped to the end
    expect(await names(s.id)).toEqual(['1:C', '2:B', '3:A']);
    const renamed = await updateStage(pg(), s.id, a.id, { name: ' Final ', counts_toward_season: false, scoring_config: { drop_worst: 1 } });
    expect(renamed).toMatchObject({ name: 'Final', counts_toward_season: false, scoring_config: { drop_worst: 1 }, stage_order: 3 });
  });

  it('statuses only move forward', async () => {
    const s = await insertSeries();
    const st = await createStage(pg(), s.id, { name: 'A' });
    expect((await setStageStatus(pg(), s.id, st.id, 'active')).status).toBe('active');
    await rejects(updateStage(pg(), s.id, st.id, { status: 'upcoming' }), 400);
    expect((await setStageStatus(pg(), s.id, st.id, 'complete')).status).toBe('complete');
    await rejects(setStageStatus(pg(), s.id, st.id, 'active'), 400);
    await rejects(updateStage(pg(), s.id, 'nope', { name: 'x' }), 404);
  });

  it('validateStageStatusTransition', () => {
    expect(validateStageStatusTransition('upcoming', 'active')).toBeNull();
    expect(validateStageStatusTransition('upcoming', 'complete')).toBeNull();
    expect(validateStageStatusTransition('active', 'active')).toBeNull();
    expect(validateStageStatusTransition('complete', 'active')).not.toBeNull();
    expect(validateStageStatusTransition('active', 'bogus')).not.toBeNull();
  });
});

describe('deleteStage', () => {
  it('compacts the order and leaves its events in the series without a stage', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const s = await insertSeries();
    const [a, b] = [await createStage(pg(), s.id, { name: 'A' }), await createStage(pg(), s.id, { name: 'B' })];
    await createStage(pg(), s.id, { name: 'C' });
    const m = await createMatch(game.id, mode.id);
    const ev = await linkEvent(s.id, 'match', m.id, { stage_id: a.id });
    await deleteStage(pg(), s.id, a.id);
    expect(await names(s.id)).toEqual(['1:B', '2:C']);
    const [row] = await pg().select().from(seriesEvents).where(eq(seriesEvents.id, ev.id));
    expect(row.stage_id).toBeNull();
    await rejects(deleteStage(pg(), s.id, a.id), 404);
    expect(b.id).toBeTruthy();
  });
});

describe('events and stages', () => {
  it('attach and edit take a stage of the same series only', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const s = await insertSeries();
    const other = await insertSeries();
    const mine = await insertStage(s.id);
    const theirs = await insertStage(other.id);
    const m1 = await createMatch(game.id, mode.id);
    const m2 = await createMatch(game.id, mode.id);

    await rejects(addSeriesEvent(pg(), s.id, { event_type: 'match', match_id: m1.id, stage_id: theirs.id }), 400);
    const id = await addSeriesEvent(pg(), s.id, { event_type: 'match', match_id: m1.id, stage_id: mine.id, week: 2, role: 'stage_playoff' });
    const [row] = await pg().select().from(seriesEvents).where(eq(seriesEvents.id, id));
    expect(row).toMatchObject({ stage_id: mine.id, week: 2, role: 'stage_playoff', counts_for_standings: false, status: 'live' });

    const id2 = await addSeriesEvent(pg(), s.id, { event_type: 'match', match_id: m2.id });
    const [plain] = await pg().select().from(seriesEvents).where(eq(seriesEvents.id, id2));
    expect(plain).toMatchObject({ stage_id: null, week: null, role: 'regular', counts_for_standings: true });

    await rejects(updateSeriesEvent(pg(), s.id, id2, { stage_id: theirs.id }), 400);
    const moved = await updateSeriesEvent(pg(), s.id, id2, { stage_id: mine.id, week: 5, counts_for_standings: false, role: 'exhibition' });
    expect(moved.event).toMatchObject({ stage_id: mine.id, week: 5, counts_for_standings: false, role: 'exhibition' });
    const cleared = await updateSeriesEvent(pg(), s.id, id2, { stage_id: null, week: null });
    expect(cleared.event).toMatchObject({ stage_id: null, week: null });
  });
});
