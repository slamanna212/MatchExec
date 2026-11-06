// @vitest-environment node
/** GET /api/series/:id/standings (scope + view), and the champion on GET /api/series/:id and the list. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createSeriesWithEntrants, insertSeries, insertStage } from '../../utils/pg-series-fixtures';
import { normalMatch, positionMatch, setupStandingsWorld, type StandingsWorld } from '../../utils/pg-standings-fixtures';
import { series } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();

let w: StandingsWorld;
beforeEach(async () => {
  w = await setupStandingsWorld();
});

const standings = (id: string, query = '') => appRequest(`/api/series/${id}/standings${query}`);

async function leagueSeries(config: Record<string, unknown> = { mode: 'head_to_head' }) {
  const s = await createSeriesWithEntrants(pg(), {
    entrantType: 'team', scoringType: 'Normal', scoringConfig: config,
    entrants: [{ name: 'Alpha', members: ['a1'], division: 'East' }, { name: 'Bravo', members: ['b1'], division: 'West' }],
  });
  const [A, B] = s.entrants.map((e) => e.id);
  return { ...s, A, B };
}

describe('GET /api/series/:id/standings', () => {
  it('returns the SeriesStandingsResponse for the season by default', async () => {
    const s = await leagueSeries();
    await normalMatch(w, s.seriesId, { entrant: s.A, players: ['a1'], name: 'Alpha' }, { entrant: s.B, players: ['b1'], name: 'Bravo' }, ['a', 'a']);
    const res = await standings(s.seriesId);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ series_id: s.seriesId, series_name: 'Season', mode: 'head_to_head', scope: { type: 'season' }, view: 'entrant', divisions: ['East', 'West'] });
    expect(res.data.events).toHaveLength(1);
    expect(res.data.rows).toEqual(res.data.standings);
    expect(res.data.rows[0]).toMatchObject({
      rank: 1, name: 'Alpha', username: 'Alpha', entrant_id: s.A, user_id: s.A, key: s.A, division: 'East', match_wins: 1, map_wins: 2, map_diff: 2, events_played: 1,
    });
    expect(res.data.rows[1]).toMatchObject({ rank: 2, name: 'Bravo', match_losses: 1 });
  });

  it('accepts a stage scope and 404s for an unknown stage or a stage of another series', async () => {
    const s = await leagueSeries({ mode: 'points', match_win_points: 3 });
    const stage = await insertStage(s.seriesId);
    await normalMatch(w, s.seriesId, { entrant: s.A, name: 'Alpha' }, { entrant: s.B, name: 'Bravo' }, ['a'], { stage_id: stage.id });
    await normalMatch(w, s.seriesId, { entrant: s.A, name: 'Alpha' }, { entrant: s.B, name: 'Bravo' }, ['a']);

    const staged = await standings(s.seriesId, `?scope=${stage.id}`);
    expect(staged.status).toBe(200);
    expect(staged.data.scope).toEqual({ type: 'stage', stage_id: stage.id });
    expect(staged.data.rows[0]).toMatchObject({ name: 'Alpha', total_points: 3 });
    expect(staged.data.events).toHaveLength(1);
    expect((await standings(s.seriesId, '?scope=season')).data.rows[0].total_points).toBe(6);

    expect((await standings(s.seriesId, '?scope=nope')).status).toBe(404);
    const other = await insertSeries();
    const foreign = await insertStage(other.id);
    expect((await standings(s.seriesId, `?scope=${foreign.id}`)).status).toBe(404);
    expect((await standings('missing')).status).toBe(404);
  });

  it('serves the individual view and rejects an unknown view', async () => {
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'team', scoringType: 'Position', scoringConfig: { mode: 'points' },
      entrants: [{ name: 'Red', members: ['r1', 'r2'] }, { name: 'Blue', members: ['b1', 'b2'] }],
    });
    const [R, B] = s.entrants.map((e) => e.id);
    await positionMatch(w, s.seriesId, [
      { player: 'r1', team: 'Red', entrant: R }, { player: 'b1', team: 'Blue', entrant: B }, { player: 'r2', team: 'Red', entrant: R }, { player: 'b2', team: 'Blue', entrant: B },
    ]);
    const entrant = await standings(s.seriesId);
    expect(entrant.data.rows.map((r: any) => [r.name, r.total_points])).toEqual([['Red', 40], ['Blue', 30]]);

    const individual = await standings(s.seriesId, '?view=individual');
    expect(individual.status).toBe(200);
    expect(individual.data.view).toBe('individual');
    expect(individual.data.rows).toHaveLength(4);
    expect(individual.data.rows[0]).toMatchObject({ entrant_id: null, entrant_name: 'Red', total_points: 40 });

    const bad = await standings(s.seriesId, '?view=teams');
    expect(bad.status).toBe(400);
    expect(bad.data.error).toMatch(/view/);
  });

  it('keeps the legacy fields for a series without entrants', async () => {
    const legacy = await insertSeries({ scoring_config: { match_win_points: 3, match_loss_points: 1 } });
    await normalMatch(w, legacy.id, { players: ['ann'], name: 'A' }, { players: ['bob'], name: 'B' }, ['a']);
    const res = await standings(legacy.id);
    expect(res.status).toBe(200);
    expect(res.data.standings.map((r: any) => [r.username, r.user_id, r.total_points, r.rank])).toEqual([['ann', 'u-ann', 3, 1], ['bob', 'u-bob', 1, 2]]);
    expect(res.data.standings[0].events).toEqual([{ series_event_id: expect.any(String), points: 3 }]);
  });
});

describe('champion on the series read models', () => {
  it('is null while active and carried on GET /:id and the list once complete', async () => {
    const s = await leagueSeries();
    await normalMatch(w, s.seriesId, { entrant: s.A, name: 'Alpha' }, { entrant: s.B, name: 'Bravo' }, ['b']);
    expect((await appRequest(`/api/series/${s.seriesId}`)).data.series.champion).toBeNull();

    await pg().update(series).set({ status: 'complete' }).where(eq(series.id, s.seriesId));
    const one = await appRequest(`/api/series/${s.seriesId}`);
    expect(one.data.series.champion).toEqual({ entrant_id: s.B, name: 'Bravo', source: 'standings' });
    const list = await appRequest('/api/series?status=complete');
    expect(list.data.series.find((x: any) => x.id === s.seriesId).champion).toEqual({ entrant_id: s.B, name: 'Bravo', source: 'standings' });
  });
});
