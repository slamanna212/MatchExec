// @vitest-environment node
/** `/api/series/:id/events/{match,tournament,planned}`, generators, batches and entrant withdrawal (Hono + Postgres). */
import { describe, expect, it, vi } from 'vitest';
import { asc, eq, inArray } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame } from '../../utils/pg-fixtures';
import { createSeriesWithEntrants, modeWithMaps } from '../../utils/pg-series-fixtures';
import {
  discordAnnouncementQueue, matchGamePlacements, matchGames, matchParticipants, matchTeams, matches, series, seriesEntrants, seriesEventBatches, seriesEvents, tournaments,
} from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));
vi.mock('@/lib/matches/voice-channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/matches/voice-channels')>()),
  VoiceChannelService: {
    setupMatchVoiceChannels: vi.fn().mockResolvedValue(true), queueVoiceAnnouncement: vi.fn().mockResolvedValue(undefined),
    getVoiceChannelsForMatch: vi.fn().mockResolvedValue([]),
  },
  deleteMatchVoiceChannels: vi.fn().mockResolvedValue(undefined),
}));

setupPgTestFile();
const pg = () => getPgTestDb();
const api = (seriesId: string, path: string, method = 'POST', json?: unknown) =>
  appRequest(`/api/series/${seriesId}${path}`, { method, ...(json === undefined ? {} : { json }) });
const START = '2030-01-01T18:00:00.000Z';

async function teamSeries(names = ['Alpha', 'Bravo', 'Charlie', 'Delta']) {
  const game = await createGame({ max_signups: 16 });
  const { modeId, mapIds } = await modeWithMaps(game.id, 'Normal', 5, 5);
  const s = await createSeriesWithEntrants(pg(), {
    entrantType: 'team', scoringType: 'Normal', gameId: game.id,
    entrants: names.map((name) => ({ name, members: [{ username: `${name}-cap`, role: 'captain' as const }, `${name}-p1`] })),
  });
  await pg().update(series).set({ game_mode_id: modeId }).where(eq(series.id, s.seriesId));
  return { ...s, gameId: game.id, modeId, mapIds };
}

const rrConfig = (over: Record<string, unknown> = {}) => ({
  double: false, divisions: 'none', start_date: '2030-01-07', match_days: [2, 4], time_slots: ['19:00'], timezone: 'UTC', concurrent_matches: 2,
  match: { maps: [] as string[] }, ...over,
});
const eventsOf = (seriesId: string) => pg().select().from(seriesEvents).where(eq(seriesEvents.series_id, seriesId)).orderBy(asc(seriesEvents.event_order));

describe('POST /:id/events/match|tournament|planned', () => {
  it('creates a match event and returns the event DTO with the match id', async () => {
    const s = await teamSeries();
    const res = await api(s.seriesId, '/events/match', 'POST', {
      entrant_ids: [s.entrants[0].id, s.entrants[1].id], week: 2, match: { start_date: START, maps: s.mapIds.slice(0, 2) },
    });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    expect(res.data.event).toMatchObject({
      series_id: s.seriesId, event_type: 'match', match_id: res.data.match_id, status: 'live', week: 2, name: 'Alpha vs Bravo', target_status: 'assign',
      role: 'regular', counts_for_standings: true,
    });
    expect(res.data.event.entrants.map((e: { name: string }) => e.name)).toEqual(['Alpha', 'Bravo']);
    const list = await api(s.seriesId, '/events', 'GET');
    expect(list.data.events).toHaveLength(1);
  });

  it('creates a tournament event and a planned event', async () => {
    const s = await teamSeries();
    const t = await api(s.seriesId, '/events/tournament', 'POST', { format: 'single-elimination', tournament: { name: 'Cup', start_time: START } });
    expect(t.status, JSON.stringify(t.data)).toBe(201);
    expect(t.data.event).toMatchObject({ event_type: 'tournament', tournament_id: t.data.tournament_id, name: 'Cup', target_status: 'assign' });
    const [row] = await pg().select().from(tournaments).where(eq(tournaments.id, t.data.tournament_id));
    expect(row.status).toBe('assign');

    const p = await api(s.seriesId, '/events/planned', 'POST', {
      role: 'season_playoff', seeding_rule: { source: 'season', top: 4, format: 'double-elimination', template: { name: 'Finals' } },
    });
    expect(p.status, JSON.stringify(p.data)).toBe(201);
    expect(p.data.event).toMatchObject({ status: 'planned', name: 'Finals', match_id: null, tournament_id: null, role: 'season_playoff', event_order: 2 });
  });

  it('answers 400 for malformed bodies, 404 for an unknown series and 409 for a finished one', async () => {
    const s = await teamSeries();
    const m = (json: unknown) => api(s.seriesId, '/events/match', 'POST', json);
    expect((await m({})).status).toBe(400);
    expect((await m({ match: {} })).status).toBe(400);
    expect((await m({ match: { start_date: 'x' } })).status).toBe(400);
    expect((await m({ match: { start_date: START }, entrant_ids: 'all' })).status).toBe(400);
    expect((await m({ match: { start_date: START }, role: 'bogus' })).status).toBe(400);
    expect((await m({ match: { start_date: START }, points_multiplier: 0 })).status).toBe(400);
    expect((await m({ match: { start_date: START }, week: 0 })).status).toBe(400);
    expect((await m({ match: { start_date: START, rounds: 99 } })).status).toBe(400);
    expect((await m({ match: { start_date: START }, entrant_ids: ['nope', 'nada'] })).status).toBe(400);
    expect((await api(s.seriesId, '/events/match', 'POST', undefined)).status).toBe(400);
    const t = (json: unknown) => api(s.seriesId, '/events/tournament', 'POST', json);
    expect((await t({ tournament: { name: 'x' } })).status).toBe(400);
    expect((await t({ format: 'single-elimination', tournament: {} })).status).toBe(400);
    expect((await t({ format: 'cumulative-points', tournament: { name: 'x' } })).status).toBe(400); // Normal series
    const p = (json: unknown) => api(s.seriesId, '/events/planned', 'POST', json);
    expect((await p({ role: 'season_playoff' })).status).toBe(400);
    expect((await p({ role: 'season_playoff', seeding_rule: { source: 'stage', top: 4, format: 'single-elimination', template: { name: 'x' } } })).status).toBe(400);
    expect((await p({ role: 'season_playoff', seeding_rule: { source: 'season', top: 1, format: 'single-elimination', template: { name: 'x' } } })).status).toBe(400);

    expect((await api('nope', '/events/match', 'POST', { match: { start_date: START } })).status).toBe(404);
    await pg().update(series).set({ status: 'complete' }).where(eq(series.id, s.seriesId));
    expect((await m({ match: { start_date: START, maps: s.mapIds.slice(0, 1) } })).status).toBe(409);
    expect(await eventsOf(s.seriesId)).toEqual([]);
  });
});

describe('round robin generator', () => {
  it('previews without writing anything', async () => {
    const s = await teamSeries();
    const res = await api(s.seriesId, '/generators/round-robin/preview', 'POST', rrConfig());
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.fixtures).toHaveLength(6);
    expect(res.data.fixtures[0]).toMatchObject({ week: 1, name: expect.stringMatching(/^\w+ vs \w+$/) });
    expect(res.data.fixtures.every((f: { entrant_ids: string[] }) => f.entrant_ids.length === 2)).toBe(true);
    expect(await eventsOf(s.seriesId)).toEqual([]);
    expect(await pg().select().from(matches)).toEqual([]);
    expect(await pg().select().from(seriesEventBatches)).toEqual([]);
  });

  it('previews byes for an odd entrant count and warns about empty rosters', async () => {
    const s = await teamSeries(['A', 'B', 'C']);
    await pg().update(seriesEntrants).set({ name: 'A' }).where(eq(seriesEntrants.id, s.entrants[0].id));
    const res = await api(s.seriesId, '/generators/round-robin/preview', 'POST', rrConfig({ concurrent_matches: 1 }));
    expect(res.data.fixtures).toHaveLength(3);
    expect(res.data.byes.length).toBeGreaterThan(0);
    const bare = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'X' }, { name: 'Y' }] });
    const warned = await api(bare.seriesId, '/generators/round-robin/preview', 'POST', rrConfig());
    expect(warned.data.warnings.join()).toMatch(/needs at least 1/);
  });

  it('answers 400 for bad configs', async () => {
    const s = await teamSeries();
    const preview = (json: unknown) => api(s.seriesId, '/generators/round-robin/preview', 'POST', json);
    expect((await preview(rrConfig({ match_days: [] }))).status).toBe(400);
    expect((await preview(rrConfig({ time_slots: ['7pm'] }))).status).toBe(400);
    expect((await preview(rrConfig({ divisions: 'many' }))).status).toBe(400);
    expect((await preview(rrConfig({ timezone: 'Mars/Base' }))).status).toBe(400);
    expect((await preview(rrConfig({ start_date: '2030-02-31' }))).status).toBe(400);
    expect((await preview(rrConfig({ entrant_ids: [s.entrants[0].id] }))).status).toBe(400);
    expect((await preview(rrConfig({ stage_id: 'nope' }))).status).toBe(400);
    expect((await api(s.seriesId, '/generators/round-robin', 'POST', { fixtures: [] })).status).toBe(400);
    expect((await api(s.seriesId, '/generators/round-robin', 'POST', { config: rrConfig(), fixtures: [{ week: 1 }] })).status).toBe(400);
  });

  it('commits one batch with every fixture as a preset match, then regenerates and deletes it', async () => {
    const s = await teamSeries();
    const config = rrConfig({ match: { maps: s.mapIds.slice(0, 1) }, points_multiplier: 1.5 });
    const res = await api(s.seriesId, '/generators/round-robin', 'POST', { config });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    expect(res.data.events).toHaveLength(6);
    const batchId: string = res.data.batch_id;
    const rows = await eventsOf(s.seriesId);
    expect(rows.every((r) => r.batch_id === batchId && r.points_multiplier === 1.5 && r.status === 'live' && r.week !== null)).toBe(true);
    const batch = (await pg().select().from(seriesEventBatches))[0];
    expect(batch).toMatchObject({ id: batchId, series_id: s.seriesId, kind: 'round_robin' });
    expect(batch.config).toMatchObject({ double: false, divisions: 'none' });

    const matchRows = await pg().select().from(matches);
    expect(matchRows).toHaveLength(6);
    expect(matchRows.every((m) => m.status === 'assign')).toBe(true);
    // generator batches never queue per-match announcements (the weekly schedule post covers them)
    expect(await pg().select().from(discordAnnouncementQueue)).toHaveLength(0);

    // one fixture starts: it stays through a regenerate, the other five are rebuilt
    await pg().update(matches).set({ status: 'battle' }).where(eq(matches.id, rows[0].match_id as string));
    const regen = await api(s.seriesId, `/batches/${batchId}/regenerate`);
    expect(regen.status, JSON.stringify(regen.data)).toBe(200);
    expect(regen.data.removed).toBe(5);
    expect(regen.data.events).toHaveLength(5);
    const after = await eventsOf(s.seriesId);
    expect(after).toHaveLength(6);
    expect(after.some((e) => e.id === rows[0].id)).toBe(true);
    expect(await pg().select().from(matches)).toHaveLength(6);
    const pairs = after.map((e) => [...(e.entrant_ids as string[])].sort().join('|'));
    expect(new Set(pairs).size).toBe(6); // every pairing still exactly once

    const del = await api(s.seriesId, `/batches/${batchId}`, 'DELETE');
    expect(del.status, JSON.stringify(del.data)).toBe(200);
    expect(del.data).toMatchObject({ removed: 5, kept: 1 });
    const left = await eventsOf(s.seriesId);
    expect(left.map((e) => [e.id, e.batch_id])).toEqual([[rows[0].id, null]]);
    expect(await pg().select().from(matches)).toHaveLength(1);
    expect(await pg().select().from(seriesEventBatches)).toEqual([]);
    expect((await api(s.seriesId, `/batches/${batchId}`, 'DELETE')).status).toBe(404);
    expect((await api(s.seriesId, `/batches/${batchId}/regenerate`)).status).toBe(404);
  });

  it('creates the edited fixtures verbatim and fails atomically', async () => {
    const s = await teamSeries();
    const [a, b, c] = s.entrants;
    const config = rrConfig({ match: { maps: s.mapIds.slice(0, 1) } });
    const fixtures = [
      { week: 1, start: '2030-01-08T19:00:00.000Z', name: 'Opening night', entrant_ids: [a.id, b.id] },
      { week: 5, start: '2030-02-05T20:30:00.000Z', name: 'Rematch', entrant_ids: [c.id, a.id] },
    ];
    const res = await api(s.seriesId, '/generators/round-robin', 'POST', { config, fixtures });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    expect(res.data.events.map((e: { name: string; week: number; start_date: string }) => [e.name, e.week, e.start_date])).toEqual([
      ['Opening night', 1, '2030-01-08T19:00:00.000Z'], ['Rematch', 5, '2030-02-05T20:30:00.000Z'],
    ]);

    const before = (await pg().select().from(matches)).length;
    const bad = await api(s.seriesId, '/generators/round-robin', 'POST', {
      config, fixtures: [...fixtures, { week: 2, start: '2030-01-15T19:00:00.000Z', name: 'Ghost', entrant_ids: [a.id, 'nope'] }],
    });
    expect(bad.status).toBe(400);
    expect((await pg().select().from(matches)).length).toBe(before);
    expect(await pg().select().from(seriesEventBatches)).toHaveLength(1);
  });

  it('supports divisions and a double round robin', async () => {
    const s = await teamSeries(['A1', 'A2', 'B1', 'B2']);
    for (const [i, e] of s.entrants.entries()) await pg().update(seriesEntrants).set({ division: i < 2 ? 'Atlantic' : 'Pacific' }).where(eq(seriesEntrants.id, e.id));
    const within = await api(s.seriesId, '/generators/round-robin/preview', 'POST', rrConfig({ divisions: 'within' }));
    expect(within.data.fixtures).toHaveLength(2);
    const both = await api(s.seriesId, '/generators/round-robin/preview', 'POST', rrConfig({ divisions: 'within_and_cross' }));
    expect(both.data.fixtures).toHaveLength(2 * 2 + 4); // inside twice (2 pairs x 2) + cross once (4 pairs)
    const double = await api(s.seriesId, '/generators/round-robin/preview', 'POST', rrConfig({ double: true }));
    expect(double.data.fixtures).toHaveLength(12);
  });
});

describe('race calendar generator', () => {
  async function racingSeries() {
    const game = await createGame({ max_signups: 24 });
    const { modeId, mapIds } = await modeWithMaps(game.id, 'Position', null, 3);
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'solo', scoringType: 'Position', gameId: game.id,
      entrants: ['Ada', 'Bo', 'Cy'].map((name) => ({ name, members: [name.toLowerCase()] })),
    });
    await pg().update(series).set({ game_mode_id: modeId }).where(eq(series.id, s.seriesId));
    return { ...s, modeId, mapIds };
  }
  const cfg = (over: Record<string, unknown> = {}) => ({ count: 3, start_date: '2030-03-02', interval_days: 7, time: '20:00', timezone: 'Europe/Berlin', event_kind: 'match', ...over });

  it('previews and commits race matches with every entrant', async () => {
    const s = await racingSeries();
    const preview = await api(s.seriesId, '/generators/race-calendar/preview', 'POST', cfg());
    expect(preview.status, JSON.stringify(preview.data)).toBe(200);
    expect(preview.data.fixtures.map((f: { name: string; week: number; start: string }) => [f.name, f.week, f.start])).toEqual([
      ['Round 1', 1, '2030-03-02T19:00:00.000Z'], ['Round 2', 2, '2030-03-09T19:00:00.000Z'], ['Round 3', 3, '2030-03-16T19:00:00.000Z'],
    ]);
    expect(preview.data.fixtures[0].entrant_ids).toHaveLength(3);
    expect(await eventsOf(s.seriesId)).toEqual([]);

    const res = await api(s.seriesId, '/generators/race-calendar', 'POST', { config: cfg({ match: { maps: s.mapIds.slice(0, 2) } }) });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    expect(res.data.events).toHaveLength(3);
    const first = res.data.events[0];
    expect(first).toMatchObject({ name: 'Round 1', week: 1, event_type: 'match', target_status: 'assign' });
    expect(await pg().select().from(matchTeams).where(eq(matchTeams.match_id, first.match_id))).toHaveLength(3);
    expect(await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, first.match_id))).toHaveLength(3);
  });

  it('commits cumulative-points tournaments for event_kind tournament, and regenerates the unplayed weeks', async () => {
    const s = await racingSeries();
    const res = await api(s.seriesId, '/generators/race-calendar', 'POST', {
      config: cfg({ event_kind: 'tournament', name_template: 'GP {n}', start_date: '2030-05-04', tournament: { format: 'cumulative-points', rounds_per_match: 2 } }),
    });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    expect(res.data.events.map((e: { name: string; event_type: string }) => [e.name, e.event_type])).toEqual([['GP 1', 'tournament'], ['GP 2', 'tournament'], ['GP 3', 'tournament']]);
    const [t1] = await pg().select().from(tournaments).where(eq(tournaments.id, res.data.events[0].tournament_id));
    expect(t1).toMatchObject({ format: 'cumulative-points', status: 'assign', rounds_per_match: 2 });

    // week 1 gets underway: only weeks 2 and 3 are rebuilt
    await pg().update(tournaments).set({ status: 'battle' }).where(eq(tournaments.id, t1.id));
    const regen = await api(s.seriesId, `/batches/${res.data.batch_id}/regenerate`);
    expect(regen.status, JSON.stringify(regen.data)).toBe(200);
    expect(regen.data.removed).toBe(2);
    expect(regen.data.events.map((e: { name: string; week: number }) => [e.name, e.week])).toEqual([['GP 2', 2], ['GP 3', 3]]);
    expect(await pg().select().from(tournaments)).toHaveLength(3);
  });

  it('answers 400 for bad configs and a series with too few entrants', async () => {
    const s = await racingSeries();
    expect((await api(s.seriesId, '/generators/race-calendar/preview', 'POST', cfg({ count: 0 }))).status).toBe(400);
    expect((await api(s.seriesId, '/generators/race-calendar/preview', 'POST', cfg({ time: '8pm' }))).status).toBe(400);
    expect((await api(s.seriesId, '/generators/race-calendar/preview', 'POST', cfg({ event_kind: 'both' }))).status).toBe(400);
    expect((await api(s.seriesId, '/generators/race-calendar/preview', 'POST', cfg({ entrant_ids: [s.entrants[0].id] }))).status).toBe(400);
    expect((await api(s.seriesId, '/generators/race-calendar', 'POST', { config: cfg({ interval_days: 0 }) })).status).toBe(400);
    expect(await eventsOf(s.seriesId)).toEqual([]);
  });
});

describe('POST /:id/entrants/:entrantId/withdraw', () => {
  /** Alpha plays Bravo and Charlie (assign), and Delta (already in battle). */
  async function leagueWithMatches() {
    const s = await teamSeries();
    const [a, b, c, d] = s.entrants;
    const make = async (x: typeof a, y: typeof a) => {
      const res = await api(s.seriesId, '/events/match', 'POST', { entrant_ids: [x.id, y.id], match: { start_date: START, maps: s.mapIds.slice(0, 2), rounds: 2 } });
      expect(res.status, JSON.stringify(res.data)).toBe(201);
      return res.data.match_id as string;
    };
    return { ...s, ab: await make(a, b), ac: await make(a, c), ad: await make(a, d), bc: await make(b, c) };
  }
  const statusOf = async (id: string) => (await pg().select({ s: matches.status }).from(matches).where(eq(matches.id, id)))[0].s;

  it('cancels the unplayed matches and leaves the others alone', async () => {
    const s = await leagueWithMatches();
    await pg().update(matches).set({ status: 'battle' }).where(eq(matches.id, s.ad));
    const res = await api(s.seriesId, `/entrants/${s.entrants[0].id}/withdraw`, 'POST', { unplayed: 'cancel' });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data).toMatchObject({ cancelled: 2, forfeited: 0, removed_from: 0, entrant: { id: s.entrants[0].id, status: 'withdrawn' } });
    expect(await statusOf(s.ab)).toBe('cancelled');
    expect(await statusOf(s.ac)).toBe('cancelled');
    expect(await statusOf(s.ad)).toBe('battle');
    expect(await statusOf(s.bc)).toBe('assign');
    expect((await pg().select().from(seriesEntrants).where(eq(seriesEntrants.id, s.entrants[0].id)))[0].status).toBe('withdrawn');
  });

  it('forfeit completes the match with the opponent winning every map, with placements written', async () => {
    const s = await teamSeries(['Alpha', 'Bravo', 'Charlie']);
    const created = await api(s.seriesId, '/events/match', 'POST', {
      entrant_ids: [s.entrants[0].id, s.entrants[1].id], match: { start_date: START, maps: s.mapIds.slice(0, 3), rounds: 3 },
    });
    const matchId: string = created.data.match_id;
    const res = await api(s.seriesId, `/entrants/${s.entrants[0].id}/withdraw`, 'POST', { unplayed: 'forfeit' });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data).toMatchObject({ forfeited: 1, cancelled: 0 });

    const [match] = await pg().select().from(matches).where(eq(matches.id, matchId));
    const teams = await pg().select().from(matchTeams).where(eq(matchTeams.match_id, matchId)).orderBy(asc(matchTeams.team_order));
    const bravoTeam = teams.find((t) => t.series_entrant_id === s.entrants[1].id)!;
    expect(match.status).toBe('complete');
    expect(match.winner_team).toBe(bravoTeam.id);
    const games = await pg().select().from(matchGames).where(eq(matchGames.match_id, matchId));
    expect(games).toHaveLength(3);
    expect(games.every((g) => g.status === 'completed')).toBe(true);
    const placements = await pg().select().from(matchGamePlacements).where(inArray(matchGamePlacements.match_game_id, games.map((g) => g.id)));
    expect(placements).toHaveLength(6);
    expect(placements.filter((p) => p.is_winner).every((p) => p.entity_id === bravoTeam.id)).toBe(true);
    expect(placements.filter((p) => p.is_winner)).toHaveLength(3);

    const dto = (await api(s.seriesId, '/events', 'GET')).data.events[0];
    expect(dto.entrants.map((e: { name: string; score: number; is_winner: boolean }) => [e.name, e.score, e.is_winner])).toEqual([['Alpha', 0, false], ['Bravo', 3, true]]);
  });

  it('removes a racer from a race and cancels the race when fewer than two entrants are left', async () => {
    const game = await createGame({ max_signups: 24 });
    const { mapIds } = await modeWithMaps(game.id, 'Position', null, 2);
    const s = await createSeriesWithEntrants(pg(), {
      entrantType: 'solo', scoringType: 'Position', gameId: game.id,
      entrants: ['Ada', 'Bo', 'Cy'].map((name) => ({ name, members: [name.toLowerCase()] })),
    });
    const race = await api(s.seriesId, '/events/match', 'POST', { match: { start_date: START, maps: mapIds } });
    expect(race.status, JSON.stringify(race.data)).toBe(201);
    const matchId: string = race.data.match_id;

    const first = await api(s.seriesId, `/entrants/${s.entrants[0].id}/withdraw`, 'POST', { unplayed: 'forfeit' });
    expect(first.data).toMatchObject({ removed_from: 1, cancelled: 0, forfeited: 0 });
    expect((await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, matchId))).map((p) => p.user_id).sort()).toEqual(['u-bo', 'u-cy']);
    const teams = await pg().select().from(matchTeams).where(eq(matchTeams.match_id, matchId));
    expect(teams.map((t) => t.team_name).sort()).toEqual(['Bo', 'Cy']);
    expect((await pg().select().from(matches).where(eq(matches.id, matchId)))[0]).toMatchObject({ status: 'assign', team_count: 2 });

    const second = await api(s.seriesId, `/entrants/${s.entrants[1].id}/withdraw`, 'POST', { unplayed: 'cancel' });
    expect(second.data).toMatchObject({ cancelled: 1, removed_from: 0 });
    expect(await statusOf(matchId)).toBe('cancelled');
  });

  it('answers 400 / 404 / 409 for bad requests', async () => {
    const s = await teamSeries();
    const id = s.entrants[0].id;
    expect((await api(s.seriesId, `/entrants/${id}/withdraw`, 'POST', { unplayed: 'ignore' })).status).toBe(400);
    expect((await api(s.seriesId, `/entrants/${id}/withdraw`, 'POST', {})).status).toBe(400);
    expect((await api(s.seriesId, '/entrants/nope/withdraw', 'POST', { unplayed: 'cancel' })).status).toBe(404);
    expect((await api('nope', `/entrants/${id}/withdraw`, 'POST', { unplayed: 'cancel' })).status).toBe(404);
    expect((await api(s.seriesId, `/entrants/${id}/withdraw`, 'POST', { unplayed: 'cancel' })).status).toBe(200);
    expect((await api(s.seriesId, `/entrants/${id}/withdraw`, 'POST', { unplayed: 'cancel' })).status).toBe(409);
    await pg().update(series).set({ status: 'complete' }).where(eq(series.id, s.seriesId));
    expect((await api(s.seriesId, `/entrants/${s.entrants[1].id}/withdraw`, 'POST', { unplayed: 'cancel' })).status).toBe(409);
    // a withdrawn entrant can no longer be put into events
    await pg().update(series).set({ status: 'active' }).where(eq(series.id, s.seriesId));
    const m = await api(s.seriesId, '/events/match', 'POST', { entrant_ids: [id, s.entrants[1].id], match: { start_date: START, maps: s.mapIds.slice(0, 1) } });
    expect(m.status).toBe(400);
  });
});
