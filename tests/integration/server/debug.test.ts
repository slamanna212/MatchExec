// @vitest-environment node
/** `/api/debug/*` on Postgres (ported from debug-routes.test.ts): gated by ENABLE_DEBUG_ROUTES. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame } from '../../utils/pg-fixtures';
import { activityFeed, discordSettings, gameStatDefinitions, statsSettings } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

// Mock the AI providers so scoring-ai-test never makes real HTTP calls
const providerCalls = vi.hoisted(() => ({ anthropic: vi.fn(), google: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>));
vi.mock('../../../processes/stats-processor/modules/providers', () => ({ AI_PROVIDER_CALLS: providerCalls }));

setupPgTestFile();
const pg = () => getPgTestDb();
const saved = process.env.ENABLE_DEBUG_ROUTES;

beforeEach(() => {
  delete process.env.ENABLE_DEBUG_ROUTES;
  providerCalls.anthropic.mockReset();
  providerCalls.google.mockReset();
});
afterEach(() => {
  if (saved !== undefined) process.env.ENABLE_DEBUG_ROUTES = saved;
  else delete process.env.ENABLE_DEBUG_ROUTES;
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
function aiTest(fields: { game?: string; image?: { type: string; bytes: Uint8Array; name?: string } }) {
  const form = new FormData();
  if (fields.game !== undefined) form.append('game', fields.game);
  if (fields.image) form.append('image', new Blob([fields.image.bytes as BlobPart], { type: fields.image.type }), fields.image.name ?? 'x.png');
  return appRequest('/api/debug/scoring-ai-test', { method: 'POST', body: form });
}

describe('Debug routes: gated by ENABLE_DEBUG_ROUTES', () => {
  it.each([
    ['GET', '/api/debug/scoring-ai-test'],
    ['POST', '/api/debug/scoring-ai-test'],
    ['POST', '/api/debug/test-voice'],
    ['POST', '/api/debug/trigger-update-event'],
  ])('%s %s returns 404 when the flag is not set', async (method, path) => {
    const res = await appRequest(path, { method });
    expect(res.status).toBe(404);
    expect(res.data).toEqual({ error: 'Not found' });
  });

  it('stays 404 when the flag is set to anything but "true"', async () => {
    process.env.ENABLE_DEBUG_ROUTES = '1';
    expect((await appRequest('/api/debug/scoring-ai-test')).status).toBe(404);
  });
});

describe('Debug routes: enabled', () => {
  beforeEach(() => { process.env.ENABLE_DEBUG_ROUTES = 'true'; });

  describe('GET /api/debug/scoring-ai-test', () => {
    it('returns 200 with an array when no games have stat definitions', async () => {
      const res = await appRequest('/api/debug/scoring-ai-test');
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });

    it('lists games that have stat definitions', async () => {
      const game = await createGame({ name: 'Statty' });
      await pg().insert(gameStatDefinitions).values({ id: 'kills', game_id: game.id, name: 'kills', display_name: 'Kills' });
      const res = await appRequest('/api/debug/scoring-ai-test');
      expect(res.status).toBe(200);
      expect(res.data.map((g: any) => g.id)).toEqual([game.id]);
    });
  });

  describe('POST /api/debug/scoring-ai-test', () => {
    it('returns 400 when the game ID is missing', async () => {
      const res = await aiTest({ image: { type: 'image/png', bytes: PNG } });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/game/i);
    });

    it('returns 400 when the image file is missing', async () => {
      const res = await aiTest({ game: 'game1' });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/image/i);
    });

    it('returns 400 when the image has an invalid MIME type', async () => {
      const res = await aiTest({ game: 'game1', image: { type: 'application/pdf', bytes: new Uint8Array(10) } });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/invalid file type/i);
    });

    it('returns 400 when the image exceeds 10 MB', async () => {
      const res = await aiTest({ game: 'game1', image: { type: 'image/png', bytes: new Uint8Array(10 * 1024 * 1024 + 1) } });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/too large/i);
    });

    it('returns 400 when the game has no stat definitions', async () => {
      const game = await createGame();
      const res = await aiTest({ game: game.id, image: { type: 'image/png', bytes: PNG } });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/no stat definitions/i);
    });

    it('returns 400 when no provider is configured', async () => {
      const game = await createGame();
      await pg().insert(gameStatDefinitions).values({ id: 'kills', game_id: game.id, name: 'kills', display_name: 'Kills' });
      const res = await aiTest({ game: game.id, image: { type: 'image/png', bytes: PNG } });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/no providers enabled/i);
    });

    it('runs every configured provider and reports raw responses, missing keys and failures per provider', async () => {
      const game = await createGame();
      await pg().insert(gameStatDefinitions).values({ id: 'kills', game_id: game.id, name: 'kills', display_name: 'Kills' });
      await pg().insert(statsSettings).values({
        id: 1, ai_api_key: 'ak',
        ai_providers_config: [
          { instanceId: 'a', providerId: 'anthropic', model: 'sonnet', sortOrder: 1 },
          { instanceId: 'g', providerId: 'google', model: 'gemini', sortOrder: 0 },
          { instanceId: 'x', providerId: 'mystery', model: 'm', sortOrder: 2 },
        ],
      });
      providerCalls.anthropic.mockResolvedValue('{"players":[]}');

      const res = await aiTest({ game: game.id, image: { type: 'image/png', bytes: PNG } });
      expect(res.status).toBe(200);
      // ordered by sortOrder: google (no key), anthropic (ok), mystery (no key set for it -> uses the OpenRouter key slot)
      expect(res.data.results).toEqual([
        { provider: 'google', model: 'gemini', error: 'API key not configured' },
        { provider: 'anthropic', model: 'sonnet', rawResponse: '{"players":[]}' },
        { provider: 'mystery', model: 'm', error: 'API key not configured' },
      ]);
      expect(providerCalls.anthropic).toHaveBeenCalledTimes(1);
      expect(providerCalls.anthropic.mock.calls[0][0]).toBe('ak');
      expect(providerCalls.anthropic.mock.calls[0][4]).toContain(game.name);
    });

    it('reports a provider error message and unknown providers with a key', async () => {
      const game = await createGame();
      await pg().insert(gameStatDefinitions).values({ id: 'kills', game_id: game.id, name: 'kills', display_name: 'Kills' });
      await pg().insert(statsSettings).values({
        id: 1, ai_api_key: 'ak', openrouter_api_key: 'ok',
        ai_providers_config: [
          { instanceId: 'a', providerId: 'anthropic', model: 'sonnet', sortOrder: 0 },
          { instanceId: 'x', providerId: 'mystery', model: 'm', sortOrder: 1 },
        ],
      });
      providerCalls.anthropic.mockRejectedValue(new Error('rate limited'));
      const res = await aiTest({ game: game.id, image: { type: 'image/png', bytes: PNG } });
      expect(res.data.results).toEqual([
        { provider: 'anthropic', model: 'sonnet', error: 'rate limited' },
        { provider: 'mystery', model: 'm', error: 'Unknown provider: mystery' },
      ]);
    });

    it('falls back to one Anthropic instance when only a legacy key is stored', async () => {
      const game = await createGame();
      await pg().insert(gameStatDefinitions).values({ id: 'kills', game_id: game.id, name: 'kills', display_name: 'Kills' });
      await pg().insert(statsSettings).values({ id: 1, ai_api_key: 'ak', ai_model: 'opus' });
      providerCalls.anthropic.mockResolvedValue('ok');
      const res = await aiTest({ game: game.id, image: { type: 'image/png', bytes: PNG } });
      expect(res.data.results).toEqual([{ provider: 'anthropic', model: 'opus', rawResponse: 'ok' }]);
    });
  });

  describe('POST /api/debug/test-voice', () => {
    it('returns 400 when voice announcements are disabled', async () => {
      await pg().insert(discordSettings).values({ id: 1, guild_id: 'test-guild', bot_token: 'test-token', voice_announcements_enabled: false });
      const res = await appRequest('/api/debug/test-voice', { method: 'POST' });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/disabled/i);
    });

    it('returns 400 when there are no discord settings at all', async () => {
      expect((await appRequest('/api/debug/test-voice', { method: 'POST' })).status).toBe(400);
    });
  });

  describe('POST /api/debug/trigger-update-event', () => {
    it('returns 200 and inserts an update_available feed event', async () => {
      const res = await appRequest('/api/debug/trigger-update-event', { method: 'POST' });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const [row] = await pg().select().from(activityFeed).where(eq(activityFeed.event_type, 'update_available'));
      expect(row.priority).toBe(2);
      expect(row.metadata).toMatchObject({ latestVersion: 'v9.9.9' });
    });
  });
});
