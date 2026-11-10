// @vitest-environment node
/** Series setup (scoring type, allowed games, roster bounds, previous series), status transitions and the series update queue. */
import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import { createSeriesWithEntrants, insertSeries, linkEvent } from '../../utils/pg-series-fixtures';
import {
  afterSeriesTransition, allowedGameIds, createSeriesChecked, editSeries, getSeriesById, transitionSeries, validateSeriesSetup,
} from '@/lib/series';
import { enqueueSeriesUpdate } from '@/lib/queues/enqueue';
import { discordSeriesUpdateQueue } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();
const rejects = (p: Promise<unknown>, status: number, message?: RegExp) =>
  expect(p).rejects.toMatchObject({ name: 'SeriesError', status, ...(message ? { message: expect.stringMatching(message) } : {}) });

async function games() {
  const ow = await createGame({ name: 'OW' });
  const mr = await createGame({ name: 'MR' });
  const kart = await createGame({ name: 'Kart' });
  const owNormal = await createGameMode(ow.id, { scoring_type: 'Normal' });
  const mrNormal = await createGameMode(mr.id, { scoring_type: 'Normal' });
  const kartPos = await createGameMode(kart.id, { scoring_type: 'Position' });
  return { ow, mr, kart, owNormal, mrNormal, kartPos };
}
const base = { entrant_type: 'team' as const, roster_min: null, roster_max: null, scoring_type: null, game_id: null, game_ids: [], game_mode_id: null, previous_series_id: null };

describe('validateSeriesSetup', () => {
  it('accepts games that all have a mode of the scoring type, and a matching default mode', async () => {
    const g = await games();
    expect(await validateSeriesSetup(pg(), { ...base, scoring_type: 'Normal', game_id: g.ow.id, game_ids: [g.ow.id, g.mr.id], game_mode_id: g.owNormal.id })).toBeNull();
    expect(await validateSeriesSetup(pg(), { ...base, scoring_type: 'Position', game_id: g.kart.id })).toBeNull();
    expect(await validateSeriesSetup(pg(), base)).toBeNull(); // legacy: nothing to check
  });

  it('rejects a game without a mode of the scoring type', async () => {
    const g = await games();
    expect(await validateSeriesSetup(pg(), { ...base, scoring_type: 'Normal', game_id: g.ow.id, game_ids: [g.ow.id, g.kart.id] })).toMatch(/no Normal mode/);
    expect(await validateSeriesSetup(pg(), { ...base, scoring_type: 'FFA', game_id: g.ow.id })).toMatch(/no FFA mode/);
  });

  it('game_id must be in a non-empty game_ids; unknown games are rejected', async () => {
    const g = await games();
    expect(await validateSeriesSetup(pg(), { ...base, game_id: g.ow.id, game_ids: [g.mr.id] })).toMatch(/game_id must be one of game_ids/);
    expect(await validateSeriesSetup(pg(), { ...base, game_id: 'nope' })).toMatch(/game_id/);
    expect(await validateSeriesSetup(pg(), { ...base, game_id: g.ow.id, game_ids: [g.ow.id, 'ghost'] })).toMatch(/unknown game: ghost/);
    // game_ids with no primary is fine
    expect(await validateSeriesSetup(pg(), { ...base, game_ids: [g.ow.id, g.mr.id] })).toBeNull();
  });

  it('game_mode_id must belong to an allowed game and have the scoring type', async () => {
    const g = await games();
    expect(await validateSeriesSetup(pg(), { ...base, scoring_type: 'Normal', game_id: g.ow.id, game_mode_id: g.mrNormal.id })).toMatch(/game_mode_id/);
    expect(await validateSeriesSetup(pg(), { ...base, game_mode_id: 'ghost' })).toMatch(/game_mode_id/);
    const ow = g.ow;
    const ffa = await createGameMode(ow.id, { scoring_type: 'FFA' });
    expect(await validateSeriesSetup(pg(), { ...base, scoring_type: 'Normal', game_id: ow.id, game_mode_id: ffa.id })).toMatch(/not a Normal mode/);
  });

  it('checks roster bounds and previous_series_id', async () => {
    expect(await validateSeriesSetup(pg(), { ...base, roster_min: 5, roster_max: 3 })).toMatch(/roster_min/);
    expect(await validateSeriesSetup(pg(), { ...base, entrant_type: 'solo', roster_max: 4 })).toMatch(/solo/);
    expect(await validateSeriesSetup(pg(), { ...base, entrant_type: 'solo', roster_min: 1, roster_max: 1 })).toBeNull();
    expect(await validateSeriesSetup(pg(), { ...base, roster_min: 0 })).toMatch(/roster_min/);
    expect(await validateSeriesSetup(pg(), { ...base, previous_series_id: 'ghost' })).toMatch(/previous_series_id/);
    const prev = await insertSeries();
    expect(await validateSeriesSetup(pg(), { ...base, previous_series_id: prev.id })).toBeNull();
    expect(await validateSeriesSetup(pg(), { ...base, previous_series_id: prev.id }, prev.id)).toMatch(/itself/);
  });

  it('allowedGameIds', () => {
    expect(allowedGameIds({ game_id: 'a', game_ids: [] })).toEqual(['a']);
    expect(allowedGameIds({ game_id: 'a', game_ids: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(allowedGameIds({ game_id: null, game_ids: [] })).toBeNull();
  });
});

describe('createSeriesChecked / editSeries', () => {
  it('stores every new field and defaults the rest', async () => {
    const g = await games();
    const id = await createSeriesChecked(pg(), {
      name: 'Season 1', entrant_type: 'team', roster_min: 5, roster_max: 7, scoring_type: 'Normal', game_id: g.ow.id, game_ids: [g.ow.id, g.mr.id, g.ow.id],
      game_mode_id: g.owNormal.id, scoring_config: { mode: 'head_to_head', win_points: 3 }, match_defaults: { rounds_per_match: 3, rules: 'competitive' },
      discord_config: { weekly_schedule: false, schedule_lead_hours: 24 },
    });
    expect(await getSeriesById(pg(), id)).toMatchObject({
      status: 'created', entrant_type: 'team', roster_min: 5, roster_max: 7, scoring_type: 'Normal', game_ids: [g.ow.id, g.mr.id], game_mode_id: g.owNormal.id,
      scoring_config: { mode: 'head_to_head', win_points: 3 }, match_defaults: { rounds_per_match: 3, rules: 'competitive' }, discord_config: { weekly_schedule: false, schedule_lead_hours: 24 },
      previous_series_id: null,
    });
    const legacy = await createSeriesChecked(pg(), { name: 'Old style' });
    expect(await getSeriesById(pg(), legacy)).toMatchObject({ entrant_type: 'solo', scoring_type: null, game_ids: [], match_defaults: null, discord_config: null });
    await rejects(createSeriesChecked(pg(), { name: 'Bad', scoring_type: 'FFA', game_id: g.ow.id }), 400, /no FFA mode/);
  });

  it('merges an update onto the stored setup and validates the result', async () => {
    const g = await games();
    const id = await createSeriesChecked(pg(), { name: 'S', scoring_type: 'Normal', game_id: g.ow.id });
    await editSeries(pg(), id, { game_ids: [g.ow.id, g.mr.id] });
    expect((await getSeriesById(pg(), id))!.game_ids).toEqual([g.ow.id, g.mr.id]);
    await rejects(editSeries(pg(), id, { game_ids: [g.ow.id, g.kart.id] }), 400);
    await rejects(editSeries(pg(), id, { game_id: g.kart.id }), 400);
    await editSeries(pg(), id, { game_ids: [], discord_config: null, name: 'Renamed' });
    expect(await getSeriesById(pg(), id)).toMatchObject({ name: 'Renamed', game_ids: [], discord_config: null });
    await rejects(editSeries(pg(), 'nope', { name: 'x' }), 404);
  });

  it('an unrelated edit never re-validates (a legacy series stays editable)', async () => {
    const s = await insertSeries({ game_ids: ['removed-game'], scoring_type: 'FFA' });
    await editSeries(pg(), s.id, { name: 'Still editable' });
    expect((await getSeriesById(pg(), s.id))!.name).toBe('Still editable');
  });

  it('refuses to change entrant_type once entrants exist and scoring_type once events exist (409)', async () => {
    const g = await games();
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'A' }] });
    await rejects(editSeries(pg(), f.seriesId, { entrant_type: 'solo' }), 409, /entrant_type/);
    await editSeries(pg(), f.seriesId, { entrant_type: 'team' }); // unchanged is fine

    const s = await insertSeries({ scoring_type: 'Normal', game_id: g.ow.id });
    const m = await createMatch(g.ow.id, g.owNormal.id);
    await linkEvent(s.id, 'match', m.id);
    await rejects(editSeries(pg(), s.id, { scoring_type: null }), 409, /scoring_type/);
    await editSeries(pg(), s.id, { scoring_type: 'Normal' });
  });
});

describe('transitionSeries', () => {
  it('walks created -> registration -> active -> complete', async () => {
    const s = await insertSeries({ status: 'created' });
    expect((await transitionSeries(pg(), s.id, 'registration')).status).toBe('registration');
    expect((await transitionSeries(pg(), s.id, 'active')).status).toBe('active');
    expect((await transitionSeries(pg(), s.id, 'complete')).status).toBe('complete');
  });

  it('allows created -> active, cancelling from created / registration / active, and rejects the rest (400)', async () => {
    for (const from of ['created', 'registration', 'active'] as const) {
      const s = await insertSeries({ status: from });
      expect((await transitionSeries(pg(), s.id, 'cancelled')).status).toBe('cancelled');
    }
    expect((await transitionSeries(pg(), (await insertSeries({ status: 'created' })).id, 'active')).status).toBe('active');

    const created = await insertSeries({ status: 'created' });
    await rejects(transitionSeries(pg(), created.id, 'complete'), 400);
    const reg = await insertSeries({ status: 'registration' });
    await rejects(transitionSeries(pg(), reg.id, 'created'), 400);
    await rejects(transitionSeries(pg(), reg.id, 'complete'), 400);
    const active = await insertSeries({ status: 'active' });
    await rejects(transitionSeries(pg(), active.id, 'registration'), 400);
    await rejects(transitionSeries(pg(), (await insertSeries({ status: 'complete' })).id, 'cancelled'), 400);
    await rejects(transitionSeries(pg(), 'nope', 'active'), 404);
  });

  it('a same-status request is a no-op that does not run the hook', async () => {
    const s = await insertSeries({ status: 'active' });
    expect((await transitionSeries(pg(), s.id, 'active')).status).toBe('active');
    await expect(afterSeriesTransition(pg(), s, 'active', 'complete')).resolves.toBeUndefined();
  });
});

describe('enqueueSeriesUpdate', () => {
  it('inserts a pending row and returns its id', async () => {
    const s = await insertSeries();
    const id = await enqueueSeriesUpdate(pg(), { seriesId: s.id, kind: 'registration_open' });
    expect(id).toEqual(expect.any(String));
    const [row] = await pg().select().from(discordSeriesUpdateQueue).where(eq(discordSeriesUpdateQueue.id, id!));
    expect(row).toMatchObject({ series_id: s.id, kind: 'registration_open', dedupe_key: null, payload: {}, status: 'pending', attempts: 0, max_attempts: 5 });
  });

  it('drops a second post with the same (series, kind, dedupe key) and returns null; keyless posts never collide', async () => {
    const s = await insertSeries();
    const other = await insertSeries();
    const first = await enqueueSeriesUpdate(pg(), { seriesId: s.id, kind: 'weekly_schedule', dedupeKey: 'week:3', payload: { week: 3 } });
    expect(first).not.toBeNull();
    expect(await enqueueSeriesUpdate(pg(), { seriesId: s.id, kind: 'weekly_schedule', dedupeKey: 'week:3' })).toBeNull();
    expect(await enqueueSeriesUpdate(pg(), { seriesId: s.id, kind: 'weekly_schedule', dedupeKey: 'week:4' })).not.toBeNull();
    expect(await enqueueSeriesUpdate(pg(), { seriesId: s.id, kind: 'standings', dedupeKey: 'week:3' })).not.toBeNull();
    expect(await enqueueSeriesUpdate(pg(), { seriesId: other.id, kind: 'weekly_schedule', dedupeKey: 'week:3' })).not.toBeNull();
    expect(await enqueueSeriesUpdate(pg(), { seriesId: s.id, kind: 'champion' })).not.toBeNull();
    expect(await enqueueSeriesUpdate(pg(), { seriesId: s.id, kind: 'champion' })).not.toBeNull();
    const [row] = await pg().select().from(discordSeriesUpdateQueue).where(eq(discordSeriesUpdateQueue.id, first!));
    expect(row.payload).toEqual({ week: 3 });
  });

  it('rows go away with the series (FK cascade)', async () => {
    const s = await insertSeries();
    await enqueueSeriesUpdate(pg(), { seriesId: s.id, kind: 'champion' });
    await pg().execute(`delete from series where id = '${s.id}'` as never);
    expect(await pg().select().from(discordSeriesUpdateQueue).where(eq(discordSeriesUpdateQueue.series_id, s.id))).toEqual([]);
  });
});
