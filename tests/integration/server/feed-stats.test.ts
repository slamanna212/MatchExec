// @vitest-environment node
/** `GET /api/feed`, `GET /api/stats` and `/api/settings/stats` on Postgres (ported from misc-routes, settings and the stats part of scorecard-routes). */
import { describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createMatch, createTournament } from '../../utils/pg-fixtures';
import { activityFeed, discordSettings, statsSettings, tournamentParticipants } from '../../../lib/db/schema';
import { addParticipant } from '../../utils/pg-stats-fixtures';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

setupPgTestFile();
const pg = () => getPgTestDb();
const insertEvent = (id: string, extra: Partial<typeof activityFeed.$inferInsert> = {}) =>
  pg().insert(activityFeed).values({ id, event_type: 'test_event', priority: 1, title: id, ...extra });

describe('GET /api/feed', () => {
  it('returns empty events when there is no activity', async () => {
    const res = await appRequest('/api/feed');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ events: [], total: 0, limit: 20, offset: 0 });
  });

  it('returns feed events with pagination info, metadata as an object and created_at as ISO', async () => {
    await insertEvent('ev1', { event_type: 'match_created', title: 'Match Created', metadata: { a: 1 }, created_at: new Date('2026-01-02T03:04:05Z') });
    const res = await appRequest('/api/feed');
    expect(res.status).toBe(200);
    expect(res.data.total).toBe(1);
    expect(res.data.limit).toBe(20);
    expect(res.data.offset).toBe(0);
    expect(res.data.events[0]).toMatchObject({ id: 'ev1', event_type: 'match_created', priority: 1, match_id: null, metadata: { a: 1 }, created_at: '2026-01-02T03:04:05.000Z' });
  });

  it('returns null metadata when none was stored', async () => {
    await insertEvent('ev1');
    expect((await appRequest('/api/feed')).data.events[0].metadata).toBeNull();
  });

  it('filters by event_type', async () => {
    await insertEvent('a', { event_type: 'tournament_started' });
    await insertEvent('b', { event_type: 'other' });
    const res = await appRequest('/api/feed?event_type=tournament_started');
    expect(res.data.events.map((e: any) => e.id)).toEqual(['a']);
    expect(res.data.total).toBe(1);
  });

  it('filters by match_id and tournament_id', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    await createMatch(game.id, mode.id, { id: 'm1' });
    await createTournament(game.id, { id: 't1' });
    await insertEvent('a', { match_id: 'm1' });
    await insertEvent('b', { tournament_id: 't1' });
    await insertEvent('c');
    expect((await appRequest('/api/feed?match_id=m1')).data.events.map((e: any) => e.id)).toEqual(['a']);
    expect((await appRequest('/api/feed?tournament_id=t1')).data.events.map((e: any) => e.id)).toEqual(['b']);
  });

  it('filters by date range (ISO strings)', async () => {
    await insertEvent('jan', { created_at: new Date('2026-01-10T00:00:00Z') });
    await insertEvent('feb', { created_at: new Date('2026-02-10T00:00:00Z') });
    await insertEvent('mar', { created_at: new Date('2026-03-10T00:00:00Z') });
    const res = await appRequest(`/api/feed?date_from=${encodeURIComponent('2026-02-01T00:00:00.000Z')}&date_to=${encodeURIComponent('2026-02-28T00:00:00.000Z')}`);
    expect(res.data.events.map((e: any) => e.id)).toEqual(['feb']);
    // an unparsable date is ignored instead of failing
    expect((await appRequest('/api/feed?date_from=not-a-date')).data.total).toBe(3);
  });

  it('orders newest first and respects limit (capped at 100) and offset', async () => {
    for (let i = 0; i < 5; i++) await insertEvent(`ev-${i}`, { created_at: new Date(Date.UTC(2026, 0, i + 1)) });
    const res = await appRequest('/api/feed?limit=2');
    expect(res.data.events.map((e: any) => e.id)).toEqual(['ev-4', 'ev-3']);
    expect(res.data.total).toBe(5);
    expect((await appRequest('/api/feed?limit=2&offset=4')).data.events.map((e: any) => e.id)).toEqual(['ev-0']);
    expect((await appRequest('/api/feed?limit=1000')).data.limit).toBe(100);
    expect((await appRequest('/api/feed?limit=abc&offset=-3')).data).toMatchObject({ limit: 20, offset: 0 });
  });

  it('returns 304 with an ETag for an unchanged first page and a fresh body once the feed changes', async () => {
    await insertEvent('ev1');
    const first = await appRequest('/api/feed');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const same = await appRequest('/api/feed', { headers: { 'if-none-match': etag! } });
    expect(same.status).toBe(304);
    expect(same.headers.get('etag')).toBe(etag);

    await insertEvent('ev2', { created_at: new Date(Date.now() + 1000) });
    const changed = await appRequest('/api/feed', { headers: { 'if-none-match': etag! } });
    expect(changed.status).toBe(200);
    expect(changed.data.total).toBe(2);
    expect(changed.headers.get('etag')).not.toBe(etag);
  });

  it('never answers 304 for filtered date ranges or later pages', async () => {
    await insertEvent('ev1');
    const etag = (await appRequest('/api/feed')).headers.get('etag')!;
    expect((await appRequest('/api/feed?date_from=2000-01-01', { headers: { 'if-none-match': etag } })).status).toBe(200);
    expect((await appRequest('/api/feed?offset=1', { headers: { 'if-none-match': etag } })).status).toBe(200);
  });

  it('is not cached by the browser', async () => {
    expect((await appRequest('/api/feed')).headers.get('cache-control')).toBe('no-store');
  });
});

describe('GET /api/stats', () => {
  it('returns zero totals on an empty database', async () => {
    const res = await appRequest('/api/stats');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ totalMatches: 0, totalTournaments: 0, totalSignups: 0 });
  });

  it('reflects actual database counts (match sign-ups plus tournament sign-ups)', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const match = await createMatch(game.id, mode.id);
    await addParticipant(match.id);
    await addParticipant(match.id);
    const tournament = await createTournament(game.id);
    await pg().insert(tournamentParticipants).values({ id: 'tp1', tournament_id: tournament.id, user_id: 'u1', discord_user_id: 'd1', username: 'U1' });

    const res = await appRequest('/api/stats');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ totalMatches: 1, totalTournaments: 1, totalSignups: 3 });
  });
});

describe('GET /api/settings/stats', () => {
  it('returns defaults when no stats_settings row exists (winner vote defaults on)', async () => {
    const res = await appRequest('/api/settings/stats');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ enabled: false, providers: [], winner_vote_enabled: true });
  });

  it('returns settings when the row exists, with boolean flags', async () => {
    await pg().insert(statsSettings).values({ id: 1, enabled: true, both_sides_required: true, auto_advance_on_match: false });
    const res = await appRequest('/api/settings/stats');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ enabled: true, both_sides_required: true, auto_advance_on_match: false, stats_report_dm_enabled: false, providers: [] });
    expect(typeof res.data.stats_report_dm_enabled).toBe('boolean');
  });

  it('migrates a legacy providers config on read (only enabled providers)', async () => {
    await pg().insert(statsSettings).values({
      id: 1, enabled: true, google_api_key: 'g',
      ai_providers_config: [
        { id: 'google', model: 'gemini', enabled: true, sortOrder: 0 },
        { id: 'anthropic', model: 'sonnet', enabled: false, sortOrder: 1 },
      ] as never,
    });
    const res = await appRequest('/api/settings/stats');
    expect(res.data.providers).toEqual([{ instanceId: 'google-gemini', providerId: 'google', model: 'gemini', hasKey: true }]);
  });

  it('never exposes API keys, only whether one is set', async () => {
    await pg().insert(statsSettings).values({
      id: 1, ai_api_key: 'secret-a', openrouter_api_key: 'secret-o',
      ai_providers_config: [
        { instanceId: 'a', providerId: 'anthropic', model: 'sonnet', sortOrder: 0 },
        { instanceId: 'o', providerId: 'openrouter', model: 'x', sortOrder: 1 },
        { instanceId: 'g', providerId: 'google', model: 'y', sortOrder: 2 },
      ],
    });
    const res = await appRequest('/api/settings/stats');
    expect(JSON.stringify(res.data)).not.toContain('secret');
    expect(res.data.providers.map((p: any) => p.hasKey)).toEqual([true, true, false]);
  });

  it('falls back to one Anthropic instance when only a key is stored', async () => {
    await pg().insert(statsSettings).values({ id: 1, ai_api_key: 'k', ai_model: 'opus' });
    expect((await appRequest('/api/settings/stats')).data.providers).toEqual([{ instanceId: 'anthropic-opus', providerId: 'anthropic', model: 'opus', hasKey: true }]);
  });

  it('reads winner_vote_enabled from the discord settings', async () => {
    await pg().insert(discordSettings).values({ id: 1, guild_id: '', bot_token: '', winner_vote_enabled: false });
    expect((await appRequest('/api/settings/stats')).data.winner_vote_enabled).toBe(false);
  });
});

describe('PUT /api/settings/stats', () => {
  const put = (json: unknown) => appRequest('/api/settings/stats', { method: 'PUT', json });

  it('enables stats (creating the row)', async () => {
    const res = await put({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true });
    expect((await pg().select().from(statsSettings))[0].enabled).toBe(true);
    expect((await appRequest('/api/settings/stats')).data.enabled).toBe(true);
  });

  it('accepts both_sides_required (success; the flag is not persisted by this endpoint, as before)', async () => {
    const res = await put({ both_sides_required: true });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect((await pg().select().from(statsSettings))[0].both_sides_required).toBe(false);
  });

  it('updates the providers config, keeps keys out of it and mirrors the first provider', async () => {
    const res = await put({ providers: [
      { instanceId: 'anthropic-claude', providerId: 'anthropic', model: 'claude-3', sortOrder: 0, apiKey: 'sk-1' },
      { instanceId: 'google-g', providerId: 'google', model: 'gemini', sortOrder: 1, apiKey: 'gk' },
    ] });
    expect(res.status).toBe(200);
    const [row] = await pg().select().from(statsSettings);
    expect(row.ai_providers_config).toEqual([
      { instanceId: 'anthropic-claude', providerId: 'anthropic', model: 'claude-3', sortOrder: 0 },
      { instanceId: 'google-g', providerId: 'google', model: 'gemini', sortOrder: 1 },
    ]);
    expect(row).toMatchObject({ ai_api_key: 'sk-1', google_api_key: 'gk', ai_provider: 'anthropic', ai_model: 'claude-3' });
  });

  it('persists stats_report_dm_enabled true and false', async () => {
    await pg().insert(statsSettings).values({ id: 1 });
    expect((await appRequest('/api/settings/stats')).data).toHaveProperty('stats_report_dm_enabled');
    expect((await put({ stats_report_dm_enabled: true })).data).toHaveProperty('success', true);
    expect((await appRequest('/api/settings/stats')).data.stats_report_dm_enabled).toBe(true);
    expect((await put({ stats_report_dm_enabled: false })).status).toBe(200);
    expect((await appRequest('/api/settings/stats')).data.stats_report_dm_enabled).toBe(false);
  });

  it('updates winner_vote_enabled on the discord settings (creating the row)', async () => {
    expect((await put({ winner_vote_enabled: false })).status).toBe(200);
    expect((await pg().select().from(discordSettings))[0].winner_vote_enabled).toBe(false);
    expect((await appRequest('/api/settings/stats')).data.winner_vote_enabled).toBe(false);
    await put({ winner_vote_enabled: true });
    expect((await pg().select().from(discordSettings))[0].winner_vote_enabled).toBe(true);
  });

  it('a body with nothing to change still succeeds', async () => {
    expect((await put({})).data).toEqual({ success: true });
  });

  it('answers 500 for a malformed JSON body (as the old route did) and changes nothing', async () => {
    const res = await appRequest('/api/settings/stats', { method: 'PUT', body: '{nope', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(500);
    expect(res.data.error).toBe('Failed to update stats settings');
    expect(await pg().select().from(statsSettings)).toHaveLength(0);
  });
});
