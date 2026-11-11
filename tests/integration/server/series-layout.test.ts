// @vitest-environment node
/**
 * Season layout routes (Hono + Postgres): POST /api/series with a layout, planned batches, match placeholders,
 * close-registration and the projected playoff bracket.
 */
import { describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame } from '../../utils/pg-fixtures';
import { createSeriesWithEntrants, modeWithMaps } from '../../utils/pg-series-fixtures';
import { series, seriesEvents, seriesStages } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();
const api = (seriesId: string, path: string, method = 'POST', json?: unknown) =>
  appRequest(`/api/series/${seriesId}${path}`, { method, ...(json === undefined ? {} : { json }) });

const RR = {
  double: false, divisions: 'none', start_date: '2030-01-01', match_days: [2], time_slots: ['19:00'], timezone: 'UTC',
  concurrent_matches: 4, max_per_entrant_per_week: 1, match: {},
};
const OPENER = { name: 'Opener', start_date: '2029-12-25T19:00:00.000Z' };

async function registrationSeries(names = ['A', 'B', 'C', 'D']) {
  const game = await createGame({ max_signups: 16 });
  const { modeId } = await modeWithMaps(game.id, 'Normal', 5, 3);
  const s = await createSeriesWithEntrants(pg(), {
    entrantType: 'team', scoringType: 'Normal', gameId: game.id, status: 'registration',
    entrants: names.map((name) => ({ name, members: [{ username: `${name}-cap`, role: 'captain' as const }] })),
  });
  await pg().update(series).set({ game_mode_id: modeId }).where(eq(series.id, s.seriesId));
  return { ...s, gameId: game.id };
}

describe('POST /api/series with a layout', () => {
  it('creates the series, its stages and placeholders', async () => {
    const game = await createGame({ max_signups: 16 });
    await modeWithMaps(game.id, 'Normal', 5, 3);
    const res = await appRequest('/api/series', {
      method: 'POST',
      json: {
        name: 'Spring League', entrant_type: 'team', scoring_type: 'Normal', game_id: game.id,
        layout: {
          stages: [{ key: 'k1', name: 'Regular season' }],
          items: [
            { type: 'match', stage_id: 'k1', match: OPENER },
            { type: 'batch', kind: 'round_robin', config: { ...RR, stage_id: 'k1' } },
            { type: 'playoff', role: 'season_playoff', seeding_rule: { source: 'season', top: 4, format: 'single-elimination', template: { name: 'Finals' } } },
          ],
        },
      },
    });
    expect(res.status).toBe(201);
    const id = (res.data as { id: string }).id;
    const stages = await pg().select().from(seriesStages).where(eq(seriesStages.series_id, id));
    expect(stages.map((s) => s.name)).toEqual(['Regular season']);
    const batches = await api(id, '/batches', 'GET');
    expect(batches.data).toMatchObject({ batches: [{ kind: 'round_robin', status: 'planned', stage_id: stages[0].id, event_count: 0 }] });
    const events = await api(id, '/events', 'GET');
    expect((events.data as { events: Array<{ name: string; status: string }> }).events.map((e) => [e.name, e.status]))
      .toEqual([['Opener', 'planned'], ['Finals', 'planned']]);
  });

  it('rejects a malformed layout with 400 and creates nothing', async () => {
    const before = (await pg().select().from(series)).length;
    const res = await appRequest('/api/series', { method: 'POST', json: { name: 'Bad', layout: { stages: [], items: [{ type: 'party' }] } } });
    expect(res.status).toBe(400);
    expect((res.data as { error: string }).error).toMatch(/layout.items\[0\]/);
    expect((await pg().select().from(series)).length).toBe(before);
  });
});

describe('placeholders and close-registration', () => {
  it('builds the layout, previews, closes and returns the active series', async () => {
    const s = await registrationSeries();
    const batch = await api(s.seriesId, '/batches', 'POST', { kind: 'round_robin', config: RR });
    expect(batch.status).toBe(201);
    const batchId = (batch.data as { batch: { id: string } }).batch.id;
    const opener = await api(s.seriesId, '/events/planned-match', 'POST', { match: OPENER });
    expect(opener.status).toBe(201);
    const openerId = (opener.data as { event: { id: string } }).event.id;

    const preview = await api(s.seriesId, `/batches/${batchId}/preview`, 'POST', {});
    expect(preview.status).toBe(200);
    expect((preview.data as { fixtures: unknown[] }).fixtures).toHaveLength(6);

    const missing = await api(s.seriesId, '/close-registration', 'POST', {});
    expect(missing.status).toBe(400);

    const closed = await api(s.seriesId, '/close-registration', 'POST', { matches: { [openerId]: [s.entrants[0].id, s.entrants[1].id] } });
    expect(closed.status).toBe(200);
    expect(closed.data).toMatchObject({ filled: [openerId], generated: [{ batch_id: batchId, event_count: 6 }], series: { status: 'active' } });
    const events = await pg().select().from(seriesEvents).where(eq(seriesEvents.series_id, s.seriesId)).orderBy(asc(seriesEvents.event_order));
    expect(events.map((e) => e.status)).toEqual(Array(7).fill('live'));
  });

  it('validates bodies', async () => {
    const s = await registrationSeries(['A', 'B']);
    expect((await api(s.seriesId, '/batches', 'POST', { kind: 'league', config: RR })).status).toBe(400);
    expect((await api(s.seriesId, '/events/planned-match', 'POST', { match: { start_date: OPENER.start_date } })).status).toBe(400);
    expect((await api(s.seriesId, '/close-registration', 'POST', { batches: { x: { divisions: 'sideways' } } })).status).toBe(400);
    expect((await api(s.seriesId, '/close-registration', 'POST', { batches: { x: {} } })).status).toBe(400); // unknown batch (domain)
  });

  it('fills a single placeholder and generates a single batch on demand', async () => {
    const s = await registrationSeries(['A', 'B', 'C']);
    const openerId = ((await api(s.seriesId, '/events/planned-match', 'POST', { match: OPENER })).data as { event: { id: string } }).event.id;
    const filled = await api(s.seriesId, `/events/${openerId}/fill`, 'POST', { entrant_ids: [s.entrants[0].id, s.entrants[2].id] });
    expect(filled.status).toBe(201);
    expect(filled.data).toMatchObject({ event: { status: 'live', target_status: 'assign' } });

    const batchId = ((await api(s.seriesId, '/batches', 'POST', { kind: 'round_robin', config: RR })).data as { batch: { id: string } }).batch.id;
    const generated = await api(s.seriesId, `/batches/${batchId}/generate`, 'POST', {});
    expect(generated.status).toBe(201);
    expect((generated.data as { events: unknown[] }).events).toHaveLength(3);
    expect((await api(s.seriesId, `/batches/${batchId}`, 'PATCH', { config: RR })).status).toBe(409);
  });

  it('projects the playoff bracket', async () => {
    const s = await registrationSeries();
    const created = await api(s.seriesId, '/events/planned', 'POST', {
      role: 'season_playoff', seeding_rule: { source: 'season', top: 4, format: 'single-elimination', template: { name: 'Finals' } },
    });
    const eventId = (created.data as { event: { id: string } }).event.id;
    const res = await api(s.seriesId, `/events/${eventId}/projected-bracket`, 'GET');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ event_id: eventId, provisional: true, format: 'single-elimination' });
    expect((res.data as { pairings: unknown[] }).pairings).toHaveLength(2);
  });
});
