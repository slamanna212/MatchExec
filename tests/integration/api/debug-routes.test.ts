import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTestDb } from '../../utils/test-db';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

// Mock AI providers so scoring-ai-test doesn't make real HTTP calls
vi.mock('../../../../../processes/stats-processor/modules/providers', () => ({
  AI_PROVIDER_CALLS: {},
}));

vi.mock('../../../../../processes/stats-processor/modules/ai-extractor', () => ({
  AIExtractor: vi.fn().mockImplementation(() => ({
    buildPrompt: vi.fn().mockReturnValue('test prompt'),
  })),
}));

vi.mock('@/lib/ai-model-resolver', () => ({
  resolveModelId: vi.fn().mockImplementation((_provider: string, model: string) => model),
}));

import { GET as scoringAiGet, POST as scoringAiPost } from '@/app/api/debug/scoring-ai-test/route';
import { POST as testVoice } from '@/app/api/debug/test-voice/route';
import { POST as triggerUpdate } from '@/app/api/debug/trigger-update-event/route';

const saved = process.env.ENABLE_DEBUG_ROUTES;

beforeEach(() => {
  delete process.env.ENABLE_DEBUG_ROUTES;
});

afterEach(() => {
  if (saved !== undefined) {
    process.env.ENABLE_DEBUG_ROUTES = saved;
  } else {
    delete process.env.ENABLE_DEBUG_ROUTES;
  }
});

describe('Debug routes — gated by ENABLE_DEBUG_ROUTES', () => {
  it('scoring-ai-test GET returns 404 when flag is not set', async () => {
    const res = await scoringAiGet();
    expect(res.status).toBe(404);
  });

  it('scoring-ai-test POST returns 404 when flag is not set', async () => {
    const req = { formData: async () => ({ get: () => null }) } as any;
    const res = await scoringAiPost(req);
    expect(res.status).toBe(404);
  });

  it('test-voice POST returns 404 when flag is not set', async () => {
    const res = await testVoice();
    expect(res.status).toBe(404);
  });

  it('trigger-update-event POST returns 404 when flag is not set', async () => {
    const res = await triggerUpdate();
    expect(res.status).toBe(404);
  });
});

describe('Debug routes — enabled', () => {
  beforeEach(() => {
    process.env.ENABLE_DEBUG_ROUTES = 'true';
  });

  describe('GET /api/debug/scoring-ai-test', () => {
    it('returns 200 with empty array when no games have stat definitions', async () => {
      const res = await scoringAiGet();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('POST /api/debug/scoring-ai-test', () => {
    it('returns 400 when game ID is missing', async () => {
      const req = { formData: async () => ({ get: (k: string) => (k === 'image' ? 'img' : null) }) } as any;
      const res = await scoringAiPost(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/game/i);
    });

    it('returns 400 when image file is missing', async () => {
      const req = { formData: async () => ({ get: (k: string) => (k === 'game' ? 'game1' : null) }) } as any;
      const res = await scoringAiPost(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/image/i);
    });

    it('returns 400 when image has invalid MIME type', async () => {
      const fakeFile = { type: 'application/pdf', size: 100, arrayBuffer: async () => new ArrayBuffer(0) };
      const req = { formData: async () => ({ get: (k: string) => k === 'game' ? 'game1' : fakeFile }) } as any;
      const res = await scoringAiPost(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid file type/i);
    });

    it('returns 400 when image exceeds 10 MB', async () => {
      const fakeFile = { type: 'image/png', size: 11 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) };
      const req = { formData: async () => ({ get: (k: string) => k === 'game' ? 'game1' : fakeFile }) } as any;
      const res = await scoringAiPost(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/too large/i);
    });
  });

  describe('POST /api/debug/test-voice', () => {
    it('returns 400 when voice announcements are disabled in DB', async () => {
      const db = getTestDb();
      // Insert discord_settings row with voice disabled
      await db.run(
        `INSERT OR REPLACE INTO discord_settings (id, guild_id, bot_token, voice_announcements_enabled)
         VALUES (1, 'test-guild', 'test-token', 0)`
      );
      const res = await testVoice();
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/disabled/i);
    });
  });

  describe('POST /api/debug/trigger-update-event', () => {
    it('returns 200 and inserts a feed event', async () => {
      const res = await triggerUpdate();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const db = getTestDb();
      const row = await db.get<{ event_type: string }>(
        `SELECT event_type FROM activity_feed WHERE event_type = 'update_available' ORDER BY created_at DESC LIMIT 1`
      );
      expect(row?.event_type).toBe('update_available');
    });
  });
});
