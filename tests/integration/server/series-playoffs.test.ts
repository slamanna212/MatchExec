// @vitest-environment node
/** `/api/series/:id/events/:eventId/{seed-preview,seed}` and `/api/series/:id/stages/:stageId/complete` (Hono + Postgres). */
import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { insertStage } from '../../utils/pg-series-fixtures';
import { bracketRule, createLeague, plannedPlayoff } from '../../utils/pg-playoffs-fixtures';
import { discordSeriesUpdateQueue, seriesEvents, tournaments } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();
const api = (seriesId: string, path: string, method = 'POST', json?: unknown) =>
  appRequest(`/api/series/${seriesId}${path}`, { method, ...(json === undefined ? {} : { json }) });

async function league() {
  const l = await createLeague([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
  await l.rankBy(['A', 'B', 'C', 'D']);
  return l;
}

describe('GET /:id/events/:eventId/seed-preview', () => {
  it('returns the qualifiers and warnings', async () => {
    const l = await league();
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 3 }));
    const res = await api(l.seriesId, `/events/${eventId}/seed-preview`, 'GET');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      qualifiers: [
        { entrant_id: l.id.A, name: 'A', seed: 1, rank: 1, division: null },
        { entrant_id: l.id.B, name: 'B', seed: 2, rank: 2, division: null },
        { entrant_id: l.id.C, name: 'C', seed: 3, rank: 3, division: null },
      ],
      warnings: [],
    });
  });

  it('answers 404 for an unknown series or event and 409 once the event is live', async () => {
    const l = await league();
    const eventId = await plannedPlayoff(l.seriesId);
    expect((await api('nope', `/events/${eventId}/seed-preview`, 'GET')).status).toBe(404);
    expect((await api(l.seriesId, '/events/nope/seed-preview', 'GET')).status).toBe(404);
    expect((await api(l.seriesId, `/events/${eventId}/seed`)).status).toBe(201);
    const res = await api(l.seriesId, `/events/${eventId}/seed-preview`, 'GET');
    expect(res.status).toBe(409);
    expect(res.data.error).toMatch(/planned/);
  });
});

describe('POST /:id/events/:eventId/seed', () => {
  it('seeds from the standings with an empty body and returns the live event', async () => {
    const l = await league();
    const eventId = await plannedPlayoff(l.seriesId, bracketRule({ top: 4 }));
    const res = await api(l.seriesId, `/events/${eventId}/seed`);
    expect(res.status).toBe(201);
    expect(res.data.event).toMatchObject({ id: eventId, status: 'live', role: 'season_playoff', entrant_ids: [l.id.A, l.id.B, l.id.C, l.id.D], tournament_id: res.data.tournament_id });
    const [t] = await pg().select().from(tournaments).where(eq(tournaments.id, res.data.tournament_id));
    expect(t.format).toBe('single-elimination');
    const posts = await pg().select().from(discordSeriesUpdateQueue).where(eq(discordSeriesUpdateQueue.series_id, l.seriesId));
    expect(posts.map((p) => p.kind)).toEqual(['playoff_seeded']);
  });

  it('accepts a manual order and an explicit empty JSON object', async () => {
    const l = await league();
    const manual = await plannedPlayoff(l.seriesId);
    const res = await api(l.seriesId, `/events/${manual}/seed`, 'POST', { entrant_ids: [l.id.C, l.id.B] });
    expect(res.status).toBe(201);
    expect(res.data.event.entrant_ids).toEqual([l.id.C, l.id.B]);
    const other = await plannedPlayoff(l.seriesId);
    expect((await api(l.seriesId, `/events/${other}/seed`, 'POST', {})).status).toBe(201);
  });

  it('validates the body and the override', async () => {
    const l = await league();
    const eventId = await plannedPlayoff(l.seriesId);
    const seed = (json: unknown) => api(l.seriesId, `/events/${eventId}/seed`, 'POST', json);
    expect((await seed([l.id.A])).status).toBe(400);
    expect((await seed({ entrant_ids: 'A' })).status).toBe(400);
    expect((await seed({ entrant_ids: [l.id.A, 3] })).status).toBe(400);
    expect((await seed({ entrant_ids: [l.id.A] })).status).toBe(400);
    expect((await seed({ entrant_ids: [l.id.A, 'ghost'] })).status).toBe(400);
    const raw = await appRequest(`/api/series/${l.seriesId}/events/${eventId}/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    expect(raw.status).toBe(400);
    expect((await pg().select().from(seriesEvents).where(eq(seriesEvents.id, eventId)))[0].status).toBe('planned');
  });

  it('answers 404 / 409 for a missing or already seeded event', async () => {
    const l = await league();
    const eventId = await plannedPlayoff(l.seriesId);
    expect((await api(l.seriesId, '/events/nope/seed')).status).toBe(404);
    expect((await api('nope', `/events/${eventId}/seed`)).status).toBe(404);
    expect((await api(l.seriesId, `/events/${eventId}/seed`)).status).toBe(201);
    expect((await api(l.seriesId, `/events/${eventId}/seed`)).status).toBe(409);
  });
});

describe('POST /:id/stages/:stageId/complete', () => {
  it('completes the stage, activates the next one and lists the seedable planned events', async () => {
    const l = await league();
    const s1 = await insertStage(l.seriesId, { status: 'active' });
    const s2 = await insertStage(l.seriesId);
    const playoff = await plannedPlayoff(l.seriesId, bracketRule({ source: 'stage', stage_id: s1.id }), { role: 'stage_playoff' });
    await plannedPlayoff(l.seriesId, bracketRule({ source: 'stage', stage_id: s2.id }), { role: 'stage_playoff' });

    const res = await api(l.seriesId, `/stages/${s1.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.data.stage).toMatchObject({ id: s1.id, status: 'complete' });
    expect(res.data.seedable_event_ids).toEqual([playoff]);
    const stages = await api(l.seriesId, '/stages', 'GET');
    expect(stages.data.stages.map((s: { status: string }) => s.status)).toEqual(['complete', 'active']);
  });

  it('answers 404 for an unknown stage or series', async () => {
    const l = await league();
    expect((await api(l.seriesId, '/stages/nope/complete')).status).toBe(404);
    expect((await api('nope', '/stages/nope/complete')).status).toBe(404);
  });
});

describe('series completion', () => {
  it('queues the champion post through the transition route', async () => {
    const l = await league();
    const res = await api(l.seriesId, '/transition', 'POST', { status: 'complete' });
    expect(res.status).toBe(200);
    const posts = await pg().select().from(discordSeriesUpdateQueue).where(eq(discordSeriesUpdateQueue.series_id, l.seriesId));
    expect(posts.map((p) => [p.kind, p.dedupe_key])).toEqual([['champion', 'champion']]);
  });
});
