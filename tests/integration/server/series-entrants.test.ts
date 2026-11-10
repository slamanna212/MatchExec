// @vitest-environment node
/** `/api/series/:id/entrants|stages`, `/api/series/players/search` and the reworked series / event routes (Hono + Postgres). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createMatch, createMatchParticipant } from '../../utils/pg-fixtures';
import { addEventApi, createSeriesWithEntrants, insertSeries, insertStage, linkEvent, transitionSeriesApi, uid } from '../../utils/pg-series-fixtures';
import { DiscordBotService } from '../../../lib/discord-bot-service';
import { matchTeams, matches, seriesEntrants, seriesEvents } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();
const api = (path: string, method = 'GET', json?: unknown) => appRequest(`/api/series${path}`, { method, ...(json === undefined ? {} : { json }) });

describe('series create / edit with the new fields', () => {
  async function racing() {
    const game = await createGame({ name: 'Kart' });
    await createGameMode(game.id, { scoring_type: 'Position' });
    return game;
  }

  it('creates a team series with scoring type, games and defaults; GET returns them', async () => {
    const game = await racing();
    const res = await api('', 'POST', {
      name: 'Endurance', entrant_type: 'team', roster_min: 2, roster_max: 4, scoring_type: 'Position', game_id: game.id, game_ids: [game.id],
      scoring_config: { mode: 'points', position_points: [25, 18] }, match_defaults: { rounds_per_match: 4 }, discord_config: { standings_posts: false },
    });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    const { data } = await api(`/${res.data.id}`);
    expect(data.series).toMatchObject({
      entrant_type: 'team', roster_min: 2, roster_max: 4, scoring_type: 'Position', game_ids: [game.id], status: 'created',
      scoring_config: { mode: 'points', position_points: [25, 18] }, match_defaults: { rounds_per_match: 4 }, discord_config: { standings_posts: false },
      previous_series_id: null, game_mode_id: null,
    });
  });

  it('answers 400 for an inconsistent setup and keeps the old behaviour for legacy bodies', async () => {
    const game = await racing();
    expect((await api('', 'POST', { name: 'X', scoring_type: 'Normal', game_id: game.id })).status).toBe(400);
    expect((await api('', 'POST', { name: 'X', game_id: 'nope' })).status).toBe(400);
    expect((await api('', 'POST', { name: 'X', entrant_type: 'solo', roster_max: 3 })).status).toBe(400);
    expect((await api('', 'POST', { name: 'X', previous_series_id: 'nope' })).status).toBe(400);
    expect((await api('', 'POST', { name: 'X', scoring_config: { mode: 'weird' } })).status).toBe(400);
    expect((await api('', 'POST', { name: 'Legacy', scoring_config: { match_win_points: 5 } })).status).toBe(201);
  });

  it('PATCH validates against the stored setup and answers 409 for entrant_type once entrants exist', async () => {
    const game = await racing();
    const id = (await api('', 'POST', { name: 'S', entrant_type: 'team', scoring_type: 'Position', game_id: game.id })).data.id;
    expect((await api(`/${id}`, 'PATCH', { game_ids: [game.id, 'ghost'] })).status).toBe(400);
    expect((await api(`/${id}`, 'PATCH', { roster_max: 6, discord_config: { weekly_schedule: false } })).status).toBe(200);
    await api(`/${id}/entrants`, 'POST', { name: 'A' });
    const res = await api(`/${id}`, 'PATCH', { entrant_type: 'solo', roster_max: null });
    expect(res.status).toBe(409);
  });

  it('the series list/summary carries the new fields', async () => {
    await insertSeries({ id: 's_new', entrant_type: 'team', game_ids: ['x'], discord_config: { standings_posts: true } });
    const { data } = await api('');
    expect(data.series.find((s: any) => s.id === 's_new')).toMatchObject({ entrant_type: 'team', game_ids: ['x'], discord_config: { standings_posts: true } });
  });
});

describe('POST /transition with registration', () => {
  it('walks created -> registration -> active -> complete and refuses skipping', async () => {
    const s = await insertSeries({ status: 'created' });
    expect((await transitionSeriesApi(s.id, 'registration')).data.series.status).toBe('registration');
    expect((await transitionSeriesApi(s.id, 'complete')).status).toBe(400);
    expect((await transitionSeriesApi(s.id, 'active')).status).toBe(200);
    expect((await transitionSeriesApi(s.id, 'complete')).status).toBe(200);
    expect((await transitionSeriesApi(s.id, 'registration')).status).toBe(400);
    expect((await transitionSeriesApi('nope', 'active')).status).toBe(404);
    const reg = await insertSeries({ status: 'registration' });
    expect((await transitionSeriesApi(reg.id, 'cancelled')).status).toBe(200);
  });
});

describe('entrants', () => {
  it('create / list / get-with-roster / edit / delete', async () => {
    const s = await insertSeries({ entrant_type: 'team', status: 'registration' });
    const created = await api(`/${s.id}/entrants`, 'POST', {
      name: 'Atlas', tag: 'ATL', color: '#123456', division: 'East', seed: 2,
      members: [{ user_id: 'u1', discord_user_id: 'd1', username: 'one', role: 'captain' }, { user_id: 'u2', username: 'two' }],
    });
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    expect(created.data.entrant).toMatchObject({ name: 'Atlas', tag: 'ATL', division: 'East', seed: 2, status: 'active', series_id: s.id });
    expect(created.data.entrant.members.map((m: any) => `${m.username}:${m.role}`)).toEqual(['one:captain', 'two:player']);
    const id = created.data.entrant.id;

    expect((await api(`/${s.id}/entrants`, 'POST', { name: 'Atlas' })).status).toBe(409);
    expect((await api(`/${s.id}/entrants`, 'POST', { name: '' })).status).toBe(400);
    expect((await api(`/${s.id}/entrants`, 'POST', { name: 'Dup player', members: [{ user_id: 'u1', username: 'one' }] })).status).toBe(409);

    const list = await api(`/${s.id}/entrants`);
    expect(list.data.entrants).toHaveLength(1);
    expect(list.data.entrants[0].members).toHaveLength(2);

    const patched = await api(`/${s.id}/entrants/${id}`, 'PATCH', { name: 'Atlas FC', seed: null, status: 'pending' });
    expect(patched.status).toBe(200);
    expect(patched.data.entrant).toMatchObject({ name: 'Atlas FC', seed: null, status: 'pending' });
    expect((await api(`/${s.id}/entrants/${id}`, 'PATCH', { status: 'withdrawn' })).status).toBe(400);
    expect((await api(`/${s.id}/entrants/${id}`, 'PATCH', {})).status).toBe(400);
    expect((await api(`/${s.id}/entrants/nope`, 'PATCH', { seed: 1 })).status).toBe(404);

    expect((await api(`/${s.id}/entrants/${id}`, 'DELETE')).data).toEqual({ success: true });
    expect((await api(`/${s.id}/entrants`)).data.entrants).toEqual([]);
    expect((await api(`/${s.id}/entrants/${id}`, 'DELETE')).status).toBe(404);
  });

  it('404s for an unknown series everywhere', async () => {
    expect((await api('/nope/entrants')).status).toBe(404);
    expect((await api('/nope/entrants', 'POST', { name: 'A' })).status).toBe(404);
    expect((await api('/nope/stages')).status).toBe(404);
    expect((await api('/nope/entrants/copy', 'POST', { from_series_id: 'x' })).status).toBe(404);
  });

  it('include_left=true returns history', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'T', members: ['a', { username: 'b', left: true }] }] });
    expect((await api(`/${f.seriesId}/entrants`)).data.entrants[0].members).toHaveLength(1);
    const all = (await api(`/${f.seriesId}/entrants?include_left=true`)).data.entrants[0].members;
    expect(all).toHaveLength(2);
    expect(all.find((m: any) => m.username === 'b').left_at).toBeTruthy();
  });

  it('409 when deleting an entrant that played', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'T' }] });
    const m = await createMatch(game.id, mode.id, { status: 'complete' });
    await pg().insert(matchTeams).values({ id: uid('mt_'), match_id: m.id, team_name: 'T', team_order: 0, series_entrant_id: f.entrants[0].id });
    const res = await api(`/${f.seriesId}/entrants/${f.entrants[0].id}`, 'DELETE');
    expect(res.status).toBe(409);
    expect(res.data.error).toMatch(/withdraw/);
    expect(await pg().select().from(seriesEntrants).where(eq(seriesEntrants.id, f.entrants[0].id))).toHaveLength(1);
  });

  it('refuses changes once the series is complete', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'solo', status: 'complete', entrants: [{ name: 'A' }] });
    expect((await api(`/${f.seriesId}/entrants`, 'POST', { name: 'B' })).status).toBe(409);
    expect((await api(`/${f.seriesId}/entrants/${f.entrants[0].id}`, 'PATCH', { seed: 1 })).status).toBe(409);
  });
});

describe('members', () => {
  it('add, change role, leave (soft), and the rules around them', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', rosterMax: 2, entrants: [{ name: 'T', members: [{ username: 'cap', role: 'captain' }] }, { name: 'U', members: ['other'] }] });
    const [t, u] = f.entrants;
    const base = `/${f.seriesId}/entrants/${t.id}/members`;

    const added = await api(base, 'POST', { user_id: 'new', discord_user_id: 'dn', username: 'newbie' });
    expect(added.status, JSON.stringify(added.data)).toBe(201);
    expect(added.data.member).toMatchObject({ entrant_id: t.id, series_id: f.seriesId, user_id: 'new', role: 'player', left_at: null });
    expect((await api(base, 'POST', { user_id: 'third', username: 'third' })).status).toBe(409); // roster full
    expect((await api(`/${f.seriesId}/entrants/${u.id}/members`, 'POST', { user_id: 'new', username: 'newbie' })).status).toBe(409); // on another roster
    expect((await api(base, 'POST', { username: 'no id' })).status).toBe(400);

    const promoted = await api(`${base}/${added.data.member.id}`, 'PATCH', { role: 'captain' });
    expect(promoted.data.member.role).toBe('captain');
    const roles = (await api(`/${f.seriesId}/entrants`)).data.entrants.find((e: any) => e.id === t.id).members.map((m: any) => `${m.username}:${m.role}`);
    expect(roles).toEqual(['newbie:captain', 'cap:player']);
    expect((await api(`${base}/${added.data.member.id}`, 'PATCH', { role: 'coach' })).status).toBe(400);
    expect((await api(`${base}/${added.data.member.id}`, 'PATCH', {})).status).toBe(400);

    expect((await api(`${base}/${added.data.member.id}`, 'DELETE')).data).toEqual({ success: true });
    expect((await api(`${base}/${added.data.member.id}`, 'DELETE')).status).toBe(409);
    expect((await api(`${base}/nope`, 'DELETE')).status).toBe(404);
    // the player is free again (history keeps the old row) and can join the other entrant
    expect((await api(`/${f.seriesId}/entrants/${u.id}/members`, 'POST', { user_id: 'new', username: 'newbie' })).status).toBe(201);
    expect((await api(`/${f.seriesId}/entrants?include_left=true`)).data.entrants.find((e: any) => e.id === t.id).members.some((m: any) => m.left_at)).toBe(true);
  });
});

describe('POST /entrants/copy', () => {
  it('seeds a new season from a previous one and reports skips', async () => {
    const src = await createSeriesWithEntrants(pg(), { entrantType: 'team', status: 'complete', entrants: [{ name: 'Alpha', seed: 1, members: ['a1', 'a2'] }, { name: 'Beta', members: ['b1'] }] });
    const target = await insertSeries({ entrant_type: 'team', status: 'created', previous_series_id: src.seriesId });
    await api(`/${target.id}/entrants`, 'POST', { name: 'Beta' });
    const res = await api(`/${target.id}/entrants/copy`, 'POST', { from_series_id: src.seriesId });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    expect(res.data.entrants.map((e: any) => e.name)).toEqual(['Alpha']);
    expect(res.data.entrants[0]).toMatchObject({ source_entrant_id: src.entrants[0].id, seed: 1 });
    expect(res.data.entrants[0].members).toHaveLength(2);
    expect(res.data.skipped).toEqual([{ name: 'Beta', reason: expect.any(String) }]);

    const solo = await api(`/${target.id}/entrants/copy`, 'POST', { from_series_id: src.seriesId, entrant_ids: [src.entrants[0].id], include_members: false });
    expect(solo.data.entrants).toEqual([]); // already copied: skipped by name
    expect((await api(`/${target.id}/entrants/copy`, 'POST', {})).status).toBe(400);
    expect((await api(`/${target.id}/entrants/copy`, 'POST', { from_series_id: 'nope' })).status).toBe(400);
    expect((await api(`/${target.id}/entrants/copy`, 'POST', { from_series_id: src.seriesId, entrant_ids: 'x' })).status).toBe(400);
    expect((await api(`/${target.id}/entrants/copy`, 'POST', { from_series_id: src.seriesId, entrant_ids: ['nope'] })).status).toBe(400);
    expect((await api(`/${target.id}/entrants/copy`, 'POST', { from_series_id: target.id })).status).toBe(400);
  });
});

describe('GET /players/search (not captured by /:seriesId)', () => {
  const guildSearch = vi.spyOn(DiscordBotService.prototype, 'searchGuildMembers');
  beforeEach(() => { guildSearch.mockReset().mockResolvedValue([]); });

  it('adds server members from the bot, de-duplicated against known players', async () => {
    await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'S', members: [{ username: 'Zed', user_id: 'zu', discord_user_id: 'zd' }] }] });
    guildSearch.mockResolvedValue([
      { id: 'zd', username: 'Zed (server)', avatar_url: null },
      { id: 'g1', username: 'Zoe', avatar_url: 'http://a/z.png' },
    ]);
    const res = await api('/players/search?q=z');
    expect(res.data.players.map((p: any) => p.username)).toEqual(['Zed', 'Zoe']);
    expect(res.data.players[1]).toEqual({ user_id: 'g1', discord_user_id: 'g1', username: 'Zoe', avatar_url: 'http://a/z.png' });
    expect(guildSearch).toHaveBeenCalledWith('z', 20);
  });

  it('falls back to known players when the bot search fails, and skips it with guild=false', async () => {
    await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'S', members: [{ username: 'Zed', user_id: 'zu', discord_user_id: 'zd' }] }] });
    guildSearch.mockRejectedValue(new Error('bot down'));
    expect((await api('/players/search?q=z')).data.players.map((p: any) => p.username)).toEqual(['Zed']);
    guildSearch.mockClear();
    await api('/players/search?q=z&guild=false');
    expect(guildSearch).not.toHaveBeenCalled();
  });

  it('returns distinct players and validates limit', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const m = await createMatch(game.id, mode.id);
    await createMatchParticipant(m.id, 'd9', 'Zephyr', { user_id: 'd9' });
    await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'S', members: [{ username: 'Zed', user_id: 'zu', discord_user_id: 'zd' }] }] });
    const res = await api('/players/search?q=ze');
    expect(res.status).toBe(200);
    expect(res.data.players.map((p: any) => p.username)).toEqual(['Zed', 'Zephyr']);
    expect(res.data.players[0]).toEqual({ user_id: 'zu', discord_user_id: 'zd', username: 'Zed', avatar_url: null });
    expect((await api('/players/search')).data.players).toEqual([]);
    expect((await api('/players/search?q=z&limit=0')).status).toBe(400);
    expect((await api('/players/search?q=z&limit=1')).data.players).toHaveLength(1);
  });
});

describe('member avatars', () => {
  it('stores the avatar sent when adding a player and returns it with the roster', async () => {
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'T', members: ['cap'] }] });
    const t = f.entrants[0];
    const added = await api(`/${f.seriesId}/entrants/${t.id}/members`, 'POST', { user_id: 'new', discord_user_id: 'new', username: 'newbie', avatar_url: 'http://a/new.png' });
    expect(added.status).toBe(201);
    expect(added.data.member.avatar_url).toBe('http://a/new.png');
    const listed = (await api(`/${f.seriesId}/entrants`)).data.entrants[0].members.find((m: any) => m.user_id === 'new');
    expect(listed.avatar_url).toBe('http://a/new.png');
    expect((await api(`/${f.seriesId}/entrants/${t.id}/members`, 'POST', { user_id: 'bad', username: 'x', avatar_url: 5 })).status).toBe(400);
  });

  it('falls back to a participant avatar for roster rows saved without one', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const m = await createMatch(game.id, mode.id);
    await createMatchParticipant(m.id, 'u-old', 'Old', { avatar_url: 'http://a/old.png' });
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'T', members: ['old', 'nobody'] }] });
    const members = (await api(`/${f.seriesId}/entrants`)).data.entrants[0].members;
    expect(members.find((x: any) => x.user_id === 'u-old').avatar_url).toBe('http://a/old.png');
    expect(members.find((x: any) => x.user_id === 'u-nobody').avatar_url).toBeNull();
  });
});

describe('stages', () => {
  it('create / list / reorder / status / delete', async () => {
    const s = await insertSeries();
    const a = (await api(`/${s.id}/stages`, 'POST', { name: 'Stage 1' })).data.stage;
    const b = (await api(`/${s.id}/stages`, 'POST', { name: 'Stage 2', counts_toward_season: true })).data.stage;
    const p = (await api(`/${s.id}/stages`, 'POST', { name: 'Playoffs', counts_toward_season: false, scoring_config: { mode: 'points' } })).data.stage;
    expect([a.stage_order, b.stage_order, p.stage_order]).toEqual([1, 2, 3]);
    expect(p).toMatchObject({ counts_toward_season: false, scoring_config: { mode: 'points' }, status: 'upcoming' });

    expect((await api(`/${s.id}/stages/${p.id}`, 'PATCH', { stage_order: 1 })).data.stage.stage_order).toBe(1);
    expect((await api(`/${s.id}/stages`)).data.stages.map((x: any) => x.name)).toEqual(['Playoffs', 'Stage 1', 'Stage 2']);
    expect((await api(`/${s.id}/stages/${a.id}`, 'PATCH', { status: 'active' })).data.stage.status).toBe('active');
    expect((await api(`/${s.id}/stages/${a.id}`, 'PATCH', { status: 'upcoming' })).status).toBe(400);
    expect((await api(`/${s.id}/stages/${a.id}`, 'PATCH', {})).status).toBe(400);
    expect((await api(`/${s.id}/stages/nope`, 'PATCH', { name: 'x' })).status).toBe(404);
    expect((await api(`/${s.id}/stages`, 'POST', { name: '' })).status).toBe(400);
    expect((await api(`/${s.id}/stages`, 'POST', { name: 'S', scoring_config: { drop_worst: -2 } })).status).toBe(400);

    expect((await api(`/${s.id}/stages/${b.id}`, 'DELETE')).data).toEqual({ success: true });
    expect((await api(`/${s.id}/stages`)).data.stages.map((x: any) => `${x.stage_order}${x.name}`)).toEqual(['1Playoffs', '2Stage 1']);
    expect((await api(`/${s.id}/stages/${b.id}`, 'DELETE')).status).toBe(404);
  });
});

describe('events: placement fields and the SeriesEventDto list', () => {
  it('attach with stage / role / week, defaults counts_for_standings, and list returns the DTO', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const s = await insertSeries();
    const st = await insertStage(s.id);
    const m1 = await createMatch(game.id, mode.id, { name: 'Opener' });
    const m2 = await createMatch(game.id, mode.id, { name: 'Showcase' });
    expect((await addEventApi(s.id, { event_type: 'match', match_id: m1.id, stage_id: st.id, week: 1 })).status).toBe(201);
    expect((await addEventApi(s.id, { event_type: 'match', match_id: m2.id, role: 'exhibition' })).status).toBe(201);
    expect((await addEventApi(s.id, { event_type: 'match', match_id: 'x', role: 'bogus' })).status).toBe(400);
    expect((await addEventApi(s.id, { event_type: 'match', match_id: m1.id, week: 0 })).status).toBe(400);
    expect((await addEventApi(s.id, { event_type: 'match', match_id: (await createMatch(game.id, mode.id)).id, stage_id: 'ghost' })).status).toBe(400);

    const { data } = await api(`/${s.id}/events`);
    expect(data.events.map((e: any) => [e.name, e.stage_id, e.week, e.role, e.counts_for_standings, e.status, e.target_status])).toEqual([
      ['Opener', st.id, 1, 'regular', true, 'live', 'created'],
      ['Showcase', null, null, 'exhibition', false, 'live', 'created'],
    ]);
    expect(data.events[0]).toMatchObject({ batch_id: null, entrant_ids: null, seeding_rule: null, game_id: game.id });
  });

  it('attaching to a typed series checks the scoring type and game', async () => {
    const g1 = await createGame();
    const g2 = await createGame();
    const normal = await createGameMode(g1.id, { scoring_type: 'Normal' });
    await createGameMode(g2.id, { scoring_type: 'Normal' });
    const ffa = await createGameMode(g1.id, { scoring_type: 'FFA' });
    const s = await insertSeries({ scoring_type: 'Normal', game_id: g1.id });
    expect((await addEventApi(s.id, { event_type: 'match', match_id: (await createMatch(g1.id, ffa.id)).id })).status).toBe(400);
    expect((await addEventApi(s.id, { event_type: 'match', match_id: (await createMatch(g2.id, normal.id)).id })).status).toBe(400);
    expect((await addEventApi(s.id, { event_type: 'match', match_id: (await createMatch(g1.id, normal.id)).id })).status).toBe(201);
  });

  it('PATCH: placement is editable while active, standings-affecting fields only before the series starts', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const s = await insertSeries({ status: 'active' });
    const st = await insertStage(s.id);
    const ev = await linkEvent(s.id, 'match', (await createMatch(game.id, mode.id)).id);

    const moved = await api(`/${s.id}/events/${ev.id}`, 'PATCH', { stage_id: st.id, week: 4, event_date: '2031-01-01T10:00:00.000Z' });
    expect(moved.status, JSON.stringify(moved.data)).toBe(200);
    expect(moved.data.event).toMatchObject({ stage_id: st.id, week: 4, event_date: '2031-01-01T10:00:00.000Z', status: 'live' });
    for (const body of [{ points_multiplier: 2 }, { event_order: 5 }, { role: 'exhibition' }, { counts_for_standings: false }]) {
      const res = await api(`/${s.id}/events/${ev.id}`, 'PATCH', body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect(res.data.error).toMatch(/before the series starts/);
    }
    expect((await api(`/${s.id}/events/${ev.id}`, 'PATCH', { stage_id: 'ghost' })).status).toBe(400);
    expect((await api(`/${s.id}/events/${ev.id}`, 'PATCH', { stage_id: null })).data.event.stage_id).toBeNull();

    const reg = await insertSeries({ status: 'registration' });
    const ev2 = await linkEvent(reg.id, 'match', (await createMatch(game.id, mode.id)).id);
    const ok = await api(`/${reg.id}/events/${ev2.id}`, 'PATCH', { points_multiplier: 2, role: 'stage_playoff', counts_for_standings: false });
    expect(ok.status).toBe(200);
    expect(ok.data.event).toMatchObject({ points_multiplier: 2, role: 'stage_playoff', counts_for_standings: false });

    const done = await insertSeries({ status: 'complete' });
    const ev3 = await linkEvent(done.id, 'match', (await createMatch(game.id, mode.id)).id);
    expect((await api(`/${done.id}/events/${ev3.id}`, 'PATCH', { week: 1 })).status).toBe(409);
  });

  it('DELETE of a series-created event removes its unstarted match; an attached one survives', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const f = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'A' }, { name: 'B' }] });
    const made = await createMatch(game.id, mode.id, { status: 'assign' });
    for (const [i, e] of f.entrants.entries()) await pg().insert(matchTeams).values({ id: uid('mt_'), match_id: made.id, team_name: e.name, team_order: i, series_entrant_id: e.id });
    const evMade = await linkEvent(f.seriesId, 'match', made.id);
    const attached = await createMatch(game.id, mode.id, { status: 'created' });
    const evAttached = await linkEvent(f.seriesId, 'match', attached.id);

    const res = await api(`/${f.seriesId}/events/${evMade.id}`, 'DELETE');
    expect(res.data).toEqual({ success: true, deleted_target: true });
    expect(await pg().select().from(matches).where(eq(matches.id, made.id))).toEqual([]);
    expect((await api(`/${f.seriesId}/events/${evAttached.id}`, 'DELETE')).data).toEqual({ success: true, deleted_target: false });
    expect(await pg().select().from(matches).where(eq(matches.id, attached.id))).toHaveLength(1);
    expect(await pg().select().from(seriesEvents).where(eq(seriesEvents.series_id, f.seriesId))).toEqual([]);
  });

  it('the stub routers are mounted without capturing anything', async () => {
    const s = await insertSeries();
    expect((await api(`/${s.id}`)).status).toBe(200);
    expect((await api(`/${s.id}/events`)).status).toBe(200);
  });
});
