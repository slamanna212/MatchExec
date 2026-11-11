// @vitest-environment node
/**
 * Season layouts (domain level): planned round robins / race calendars, match placeholders, creating a series with its
 * layout, closing registration (fill + generate + activate in one transaction), the projected playoff bracket and the
 * automatic stage completion / playoff seeding.
 */
import { describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame } from '../../utils/pg-fixtures';
import { createSeriesWithEntrants, insertStage, modeWithMaps } from '../../utils/pg-series-fixtures';
import {
  advanceSeries, closeRegistration, createPlannedBatch, createPlannedMatch, createSeriesPlannedEvent, createSeriesWithLayout,
  fillPlannedMatch, generatePlannedBatch, getProjectedBracket, listBatches, listSeriesEventDtos, previewPlannedBatch, projectPairings,
  regenerateBatch, removeSeriesEvent, updatePlannedBatch, updatePlannedMatch,
} from '@/lib/series';
import { matches, series, seriesEntrants, seriesEventBatches, seriesEvents, seriesStages } from '../../../lib/db/schema';
import type { RoundRobinConfig } from '../../../shared/series-types';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();
const rejects = (p: Promise<unknown>, status: number, message?: RegExp) =>
  expect(p).rejects.toMatchObject({ name: 'SeriesError', status, ...(message ? { message: expect.stringMatching(message) } : {}) });

const entrantsOf = (names: string[], divisions: Array<string | undefined> = []) => names.map((name, i) => ({
  name, division: divisions[i], members: [{ username: `${name}-cap`, role: 'captain' as const }, `${name}-p1`],
}));

async function teamSeries(names: string[], status: 'created' | 'registration' | 'active' = 'registration', divisions: Array<string | undefined> = []) {
  const game = await createGame({ max_signups: 16 });
  const { modeId, mapIds } = await modeWithMaps(game.id, 'Normal', 5, 3);
  const s = await createSeriesWithEntrants(pg(), { entrantType: 'team', scoringType: 'Normal', gameId: game.id, status, entrants: entrantsOf(names, divisions) });
  await pg().update(series).set({ game_mode_id: modeId, match_defaults: { maps: mapIds.slice(0, 1) } }).where(eq(series.id, s.seriesId));
  return { ...s, gameId: game.id, mapIds };
}

const rrConfig = (over: Partial<RoundRobinConfig> = {}): RoundRobinConfig => ({
  double: false, divisions: 'none', start_date: '2026-12-01', match_days: [2], time_slots: ['19:00'], timezone: 'UTC',
  concurrent_matches: 4, max_per_entrant_per_week: 1, match: {}, ...over,
});
const OPENER = { name: 'Season Opener', start_date: '2026-11-24T19:00:00.000Z' };

const eventsOf = (seriesId: string) => pg().select().from(seriesEvents).where(eq(seriesEvents.series_id, seriesId)).orderBy(asc(seriesEvents.event_order));
const batchRow = async (id: string) => (await pg().select().from(seriesEventBatches).where(eq(seriesEventBatches.id, id)))[0];
const seriesRow = async (id: string) => (await pg().select().from(series).where(eq(series.id, id)))[0];

describe('planned batches', () => {
  it('stores only the config, holds an order slot and lists with its status', async () => {
    const s = await teamSeries(['A', 'B', 'C', 'D'], 'created');
    const opener = await createPlannedMatch(pg(), s.seriesId, { match: OPENER });
    const batchId = await createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig() });
    const playoff = await createSeriesPlannedEvent(pg(), s.seriesId, {
      role: 'season_playoff', seeding_rule: { source: 'season', top: 4, format: 'single-elimination', template: { name: 'Finals' } },
    });

    expect(await batchRow(batchId)).toMatchObject({ status: 'planned', position: 2, kind: 'round_robin' });
    const orders = (await eventsOf(s.seriesId)).map((e) => [e.id, e.event_order]);
    expect(orders).toEqual([[opener, 1], [playoff, 3]]); // the playoff went after the batch's slot
    expect((await listBatches(pg(), s.seriesId)).map((b) => [b.id, b.status, b.event_count])).toEqual([[batchId, 'planned', 0]]);
  });

  it('refuses entrant lists (it always takes every approved entrant) and bad schedules', async () => {
    const s = await teamSeries(['A', 'B'], 'created');
    await rejects(createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig({ entrant_ids: [s.entrants[0].id] }) }), 400, /every approved entrant/);
    await rejects(createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig({ time_slots: ['7pm'] }) }), 400);
  });

  it('can be edited (config and stage) while planned, but not regenerated', async () => {
    const s = await teamSeries(['A', 'B'], 'created');
    const stage = await insertStage(s.seriesId);
    const batchId = await createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig() });
    await updatePlannedBatch(pg(), s.seriesId, batchId, { config: rrConfig({ double: true }), stage_id: stage.id });
    expect(await batchRow(batchId)).toMatchObject({ stage_id: stage.id, config: expect.objectContaining({ double: true, stage_id: stage.id }) });
    await rejects(regenerateBatch(pg(), s.seriesId, batchId), 409, /not been generated/);
  });

  it('previews with division overrides without saving them', async () => {
    const s = await teamSeries(['A', 'B', 'C', 'D'], 'registration');
    const batchId = await createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig() });
    const [a, b, c, d] = s.entrants;
    const preview = await previewPlannedBatch(pg(), s.seriesId, batchId, {
      divisions: 'within', division_overrides: { [a.id]: 'East', [b.id]: 'East', [c.id]: 'West', [d.id]: 'West' },
    });
    expect(preview.fixtures).toHaveLength(2); // one match inside each division
    const pairs = preview.fixtures.map((f) => [...f.entrant_ids].sort().join('|')).sort();
    expect(pairs).toEqual([[a.id, b.id].sort().join('|'), [c.id, d.id].sort().join('|')].sort());
    expect((await pg().select().from(seriesEntrants).where(eq(seriesEntrants.series_id, s.seriesId))).every((e) => e.division === null)).toBe(true);
  });

  it('generates into its slot: later events move down, it cannot be generated twice', async () => {
    const s = await teamSeries(['A', 'B', 'C', 'D'], 'active');
    const batchId = await createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig({ match: { maps: s.mapIds.slice(0, 1) } }) });
    const after = await createPlannedMatch(pg(), s.seriesId, { match: { name: 'All-star game', start_date: '2027-03-01T19:00:00.000Z' }, role: 'exhibition' });

    const created = await generatePlannedBatch(pg(), s.seriesId, batchId);
    expect(created.event_ids).toHaveLength(6);
    const events = await eventsOf(s.seriesId);
    expect(events.map((e) => e.event_order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(events.at(-1)?.id).toBe(after);
    expect(events.slice(0, 6).every((e) => e.batch_id === batchId && e.status === 'live')).toBe(true);
    expect(await batchRow(batchId)).toMatchObject({ status: 'generated', position: null });
    await rejects(generatePlannedBatch(pg(), s.seriesId, batchId), 409, /already generated/);
  });
});

describe('match placeholders', () => {
  it('shows as a planned match with its template, can be edited, filled and removed', async () => {
    const s = await teamSeries(['A', 'B', 'C'], 'active');
    const id = await createPlannedMatch(pg(), s.seriesId, { match: OPENER, week: 1 });
    const [dto] = await listSeriesEventDtos(pg(), s.seriesId);
    expect(dto).toMatchObject({ id, status: 'planned', event_type: 'match', name: 'Season Opener', match_id: null, week: 1, start_date: OPENER.start_date });
    expect(dto.match_template).toMatchObject({ name: 'Season Opener' });

    await updatePlannedMatch(pg(), s.seriesId, id, { name: 'Grand Opener', start_date: '2026-11-25T19:00:00.000Z' });
    const created = await fillPlannedMatch(pg(), s.seriesId, id, [s.entrants[0].id, s.entrants[2].id]);
    const [row] = await eventsOf(s.seriesId);
    expect(row).toMatchObject({ id, status: 'live', match_id: created.match_id, entrant_ids: [s.entrants[0].id, s.entrants[2].id], match_template: null, week: 1 });
    const [match] = await pg().select().from(matches).where(eq(matches.id, created.match_id));
    expect(match).toMatchObject({ name: 'Grand Opener', status: 'assign' });
    await rejects(fillPlannedMatch(pg(), s.seriesId, id, [s.entrants[0].id, s.entrants[1].id]), 409, /no longer a placeholder/);

    const other = await createPlannedMatch(pg(), s.seriesId, { match: { name: 'Showcase', start_date: OPENER.start_date } });
    await removeSeriesEvent(pg(), s.seriesId, other);
    expect((await eventsOf(s.seriesId)).map((e) => e.id)).toEqual([id]);
  });

  it('needs a name and a start date', async () => {
    const s = await teamSeries(['A', 'B'], 'created');
    await rejects(createPlannedMatch(pg(), s.seriesId, { match: { name: ' ', start_date: OPENER.start_date } }), 400, /name/);
    await rejects(createPlannedMatch(pg(), s.seriesId, { match: { name: 'X', start_date: 'soon' } }), 400, /start_date/);
  });
});

describe('closeRegistration', () => {
  async function laidOut(names = ['A', 'B', 'C', 'D']) {
    const s = await teamSeries(names, 'registration');
    const opener = await createPlannedMatch(pg(), s.seriesId, { match: OPENER });
    const batchId = await createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig() });
    const playoff = await createSeriesPlannedEvent(pg(), s.seriesId, {
      role: 'season_playoff', seeding_rule: { source: 'season', top: 2, format: 'single-elimination', template: { name: 'Final' } },
    });
    return { ...s, opener, batchId, playoff };
  }

  it('saves divisions, fills placeholders, generates every planned batch and activates the series, in order', async () => {
    const s = await laidOut();
    const [a, b, c, d] = s.entrants;
    const result = await closeRegistration(pg(), s.seriesId, {
      divisions: { [a.id]: 'East', [b.id]: 'East', [c.id]: 'West', [d.id]: 'West' },
      batches: { [s.batchId]: { divisions: 'within' } },
      matches: { [s.opener]: [a.id, d.id] },
    });
    expect(result).toEqual({ generated: [{ batch_id: s.batchId, event_count: 2 }], filled: [s.opener] });

    expect((await seriesRow(s.seriesId)).status).toBe('active');
    const divisions = await pg().select({ id: seriesEntrants.id, division: seriesEntrants.division }).from(seriesEntrants).where(eq(seriesEntrants.series_id, s.seriesId));
    expect(Object.fromEntries(divisions.map((r) => [r.id, r.division]))).toEqual({ [a.id]: 'East', [b.id]: 'East', [c.id]: 'West', [d.id]: 'West' });

    const events = await eventsOf(s.seriesId);
    expect(events.map((e) => [e.event_order, e.status, e.batch_id ? 'rr' : e.id])).toEqual([
      [1, 'live', s.opener], [2, 'live', 'rr'], [3, 'live', 'rr'], [4, 'planned', s.playoff],
    ]);
    expect(await batchRow(s.batchId)).toMatchObject({ status: 'generated', config: expect.objectContaining({ divisions: 'within' }) });
  });

  it('leaves pending entrants out', async () => {
    const game = await createGame({ max_signups: 16 });
    await modeWithMaps(game.id, 'Normal', 5, 3);
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringType: 'Normal', gameId: game.id, status: 'registration',
      entrants: [...entrantsOf(['A', 'B', 'C']), { name: 'Late', status: 'pending', members: ['late-cap'] }],
    });
    const batchId = await createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig() });
    await closeRegistration(pg(), s.seriesId, {});
    const events = await eventsOf(s.seriesId);
    expect(events.filter((e) => e.batch_id === batchId)).toHaveLength(3);
    expect(events.some((e) => e.entrant_ids?.includes(s.entrants[3].id))).toBe(false);
  });

  it('refuses unassigned placeholders and changes nothing', async () => {
    const s = await laidOut();
    await rejects(closeRegistration(pg(), s.seriesId, { divisions: { [s.entrants[0].id]: 'East' } }), 400, /Season Opener/);
    expect((await seriesRow(s.seriesId)).status).toBe('registration');
    expect(await batchRow(s.batchId)).toMatchObject({ status: 'planned' });
    const [entrant] = await pg().select().from(seriesEntrants).where(eq(seriesEntrants.id, s.entrants[0].id));
    expect(entrant.division).toBeNull(); // rolled back with the rest
  });

  it('needs two approved entrants and a draft / registration series', async () => {
    const one = await teamSeries(['Solo'], 'registration');
    await rejects(closeRegistration(pg(), one.seriesId, {}), 400, /two approved/);
    const running = await teamSeries(['A', 'B'], 'active');
    await rejects(closeRegistration(pg(), running.seriesId, {}), 409);
  });

  it('starts the first stage', async () => {
    const s = await teamSeries(['A', 'B'], 'created');
    const stage = await insertStage(s.seriesId, { stage_order: 1 });
    await createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig({ stage_id: stage.id }) });
    await closeRegistration(pg(), s.seriesId, {});
    const [row] = await pg().select().from(seriesStages).where(eq(seriesStages.id, stage.id));
    expect(row.status).toBe('active');
    const events = await eventsOf(s.seriesId);
    expect(events).toHaveLength(1);
    expect(events[0].stage_id).toBe(stage.id);
  });
});

describe('createSeriesWithLayout', () => {
  it('creates stages and placeholders in order, mapping the stage keys', async () => {
    const game = await createGame({ max_signups: 16 });
    await modeWithMaps(game.id, 'Normal', 5, 3);
    const id = await createSeriesWithLayout(pg(), { name: 'Laid out', entrant_type: 'team', scoring_type: 'Normal', game_id: game.id }, {
      stages: [{ key: 'reg', name: 'Regular season' }, { key: 'po', name: 'Playoffs', counts_toward_season: false }],
      items: [
        { type: 'match', stage_id: 'reg', match: OPENER },
        { type: 'batch', kind: 'round_robin', config: rrConfig({ stage_id: 'reg' }) },
        {
          type: 'playoff', role: 'stage_playoff', stage_id: 'po',
          seeding_rule: { source: 'stage', stage_id: 'reg', top: 4, format: 'single-elimination', template: { name: 'Playoffs' } },
        },
      ],
    });
    const stages = await pg().select().from(seriesStages).where(eq(seriesStages.series_id, id)).orderBy(asc(seriesStages.stage_order));
    expect(stages.map((st) => [st.name, st.counts_toward_season])).toEqual([['Regular season', true], ['Playoffs', false]]);
    const [reg, po] = stages;
    const events = await eventsOf(id);
    expect(events.map((e) => [e.event_order, e.stage_id, e.match_template ? 'match' : 'playoff'])).toEqual([[1, reg.id, 'match'], [3, po.id, 'playoff']]);
    expect(events[1].seeding_rule).toMatchObject({ source: 'stage', stage_id: reg.id });
    expect(await listBatches(pg(), id)).toEqual([expect.objectContaining({ stage_id: reg.id, position: 2, status: 'planned' })]);
  });

  it('rolls the whole series back when a placeholder is invalid', async () => {
    const game = await createGame({ max_signups: 16 });
    await modeWithMaps(game.id, 'Normal', 5, 3);
    const before = (await pg().select().from(series)).length;
    await rejects(createSeriesWithLayout(pg(), { name: 'Broken', scoring_type: 'Normal', game_id: game.id }, {
      stages: [], items: [{ type: 'batch', kind: 'round_robin', config: rrConfig({ stage_id: 'missing' }) }],
    }), 400, /Unknown stage/);
    expect((await pg().select().from(series)).length).toBe(before);
  });
});

describe('projected bracket and automatic progression', () => {
  it('pairs seeds in bracket order with a bye for an odd field', () => {
    const q = (seed: number) => ({ entrant_id: `e${seed}`, name: `T${seed}`, seed, rank: seed, division: null });
    expect(projectPairings([1, 2, 3, 4].map(q)).map((p) => [p.a.seed, p.b?.seed ?? null])).toEqual([[1, 4], [2, 3]]);
    expect(projectPairings([1, 2, 3].map(q)).map((p) => [p.a.seed, p.b?.seed ?? null])).toEqual([[2, 3], [1, null]]);
  });

  it('projects the playoff from the live table and flags it provisional until the season is decided', async () => {
    const s = await teamSeries(['A', 'B', 'C', 'D'], 'active');
    const playoff = await createSeriesPlannedEvent(pg(), s.seriesId, {
      role: 'season_playoff', seeding_rule: { source: 'season', top: 4, format: 'single-elimination', template: { name: 'Finals' } },
    });
    const batchId = await createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig() });
    const projected = await getProjectedBracket(pg(), s.seriesId, playoff);
    expect(projected).toMatchObject({ event_id: playoff, format: 'single-elimination', provisional: true });
    expect(projected.qualifiers).toHaveLength(4);
    expect(projected.pairings).toHaveLength(2);

    await generatePlannedBatch(pg(), s.seriesId, batchId);
    await pg().update(matches).set({ status: 'complete' });
    expect((await getProjectedBracket(pg(), s.seriesId, playoff)).provisional).toBe(false);
  });

  it('completes a finished stage, starts the next and seeds its playoff', async () => {
    const s = await teamSeries(['A', 'B', 'C'], 'created');
    const reg = await insertStage(s.seriesId, { name: 'Regular', stage_order: 1 });
    const po = await insertStage(s.seriesId, { name: 'Playoffs', stage_order: 2, counts_toward_season: false });
    await createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig({ stage_id: reg.id }) });
    const playoff = await createSeriesPlannedEvent(pg(), s.seriesId, {
      role: 'stage_playoff', stage_id: po.id,
      seeding_rule: { source: 'stage', stage_id: reg.id, top: 3, format: 'single-elimination', template: { name: 'Playoffs' } },
    });
    await closeRegistration(pg(), s.seriesId, {});

    expect(await advanceSeries(pg(), s.seriesId)).toEqual({ completed_stages: [], seeded: [] }); // nothing played yet

    const regularMatchIds = (await eventsOf(s.seriesId)).filter((e) => e.stage_id === reg.id).map((e) => e.match_id as string);
    for (const id of regularMatchIds) await pg().update(matches).set({ status: 'complete' }).where(eq(matches.id, id));
    const result = await advanceSeries(pg(), s.seriesId);
    expect(result).toEqual({ completed_stages: [reg.id], seeded: [playoff] });

    const stages = await pg().select().from(seriesStages).where(eq(seriesStages.series_id, s.seriesId)).orderBy(asc(seriesStages.stage_order));
    expect(stages.map((st) => st.status)).toEqual(['complete', 'active']);
    const [row] = await pg().select().from(seriesEvents).where(and(eq(seriesEvents.id, playoff)));
    expect(row).toMatchObject({ status: 'live', event_type: 'tournament' });
  });

  it('does not auto-seed when auto_seed is off or the cut-off is tied', async () => {
    const s = await teamSeries(['A', 'B', 'C'], 'active');
    const off = await createSeriesPlannedEvent(pg(), s.seriesId, {
      role: 'season_playoff', seeding_rule: { source: 'season', top: 3, format: 'single-elimination', template: { name: 'Manual' }, auto_seed: false },
    });
    const tied = await createSeriesPlannedEvent(pg(), s.seriesId, {
      role: 'season_playoff', seeding_rule: { source: 'season', top: 2, format: 'single-elimination', template: { name: 'Tied' } },
    });
    const batchId = await createPlannedBatch(pg(), s.seriesId, { kind: 'round_robin', config: rrConfig() });
    await generatePlannedBatch(pg(), s.seriesId, batchId);
    await pg().update(matches).set({ status: 'complete' }); // no results: everybody level on points
    expect((await advanceSeries(pg(), s.seriesId)).seeded).toEqual([]);
    const rows = await pg().select({ id: seriesEvents.id, status: seriesEvents.status }).from(seriesEvents).where(eq(seriesEvents.status, 'planned'));
    expect(rows.map((r) => r.id).sort()).toEqual([off, tied].sort());
  });
});
