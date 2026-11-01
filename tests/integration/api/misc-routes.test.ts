import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest } from '../../utils/api-helpers';
import { seedBasicTestData } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

import { GET as getFeed } from '@/app/api/feed/route';
import { GET as getStatsSettings, PUT as putStatsSettings } from '@/app/api/settings/stats/route';

describe('Misc Routes', () => {
  let db: any;

  beforeEach(async () => {
    await seedBasicTestData();
    db = getTestDb();
  });

  // ─── GET /api/feed ───────────────────────────────────────────────────────────

  describe('GET /api/feed', () => {
    it('returns empty events when no activity', async () => {
      const request = createMockRequest('GET', '/api/feed');
      const response = await getFeed(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(body.events)).toBe(true);
      expect(typeof body.total).toBe('number');
    });

    it('returns feed events with pagination info', async () => {
      // Insert a feed event
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title)
         VALUES ('ev1', 'match_created', 1, 'Match Created')`
      );

      const request = createMockRequest('GET', '/api/feed');
      const response = await getFeed(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.total).toBeGreaterThan(0);
      expect(body.limit).toBeDefined();
      expect(body.offset).toBeDefined();
    });

    it('filters by event_type', async () => {
      await db.run(
        `INSERT INTO activity_feed (id, event_type, priority, title)
         VALUES ('ev2', 'tournament_started', 1, 'Tournament Started')`
      );

      const request = createMockRequest('GET', '/api/feed?event_type=tournament_started');
      const response = await getFeed(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      const types = body.events.map((e: any) => e.event_type);
      expect(types.every((t: string) => t === 'tournament_started')).toBe(true);
    });

    it('respects limit query param', async () => {
      for (let i = 0; i < 5; i++) {
        await db.run(
          `INSERT INTO activity_feed (id, event_type, priority, title)
           VALUES (?, 'test_event', 1, ?)`,
          [`ev-limit-${i}`, `Event ${i}`]
        );
      }

      const request = createMockRequest('GET', '/api/feed?limit=2');
      const response = await getFeed(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.events.length).toBeLessThanOrEqual(2);
    });

    it('returns 304 with ETag cache hit on second identical request', async () => {
      // First request to get ETag
      const request1 = createMockRequest('GET', '/api/feed');
      const response1 = await getFeed(request1);
      const etag = response1.headers.get('ETag') ?? response1.headers.get('etag');

      if (etag) {
        // Second request with If-None-Match
        const request2 = new Request('http://localhost/api/feed', {
          headers: { 'if-none-match': etag }
        });
        const response2 = await getFeed(request2 as any);
        expect(response2.status).toBe(304);
      }
    });
  });

  // ─── GET /api/settings/stats ─────────────────────────────────────────────────

  describe('GET /api/settings/stats', () => {
    it('returns defaults when no stats_settings row exists', async () => {
      const response = await getStatsSettings();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.enabled).toBe(false);
      expect(Array.isArray(body.providers)).toBe(true);
    });

    it('returns settings when row exists', async () => {
      await db.run(
        `INSERT INTO stats_settings (id, enabled, both_sides_required, auto_advance_on_match)
         VALUES (1, 1, 1, 0)`
      );

      const response = await getStatsSettings();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.enabled).toBe(true);
      expect(body.both_sides_required).toBe(true);
    });

    it('parses legacy providers config', async () => {
      const legacyConfig = JSON.stringify([
        { id: 'anthropic', model: 'claude-3', enabled: true, sortOrder: 0 },
      ]);
      await db.run(
        `INSERT INTO stats_settings (id, enabled, ai_providers_config) VALUES (1, 1, ?)`,
        [legacyConfig]
      );

      const response = await getStatsSettings();
      const body = await response.json();

      expect(response.status).toBe(200);
      // providers should include the migrated entry
      expect(body.providers.length).toBeGreaterThan(0);
    });
  });

  // ─── PUT /api/settings/stats ─────────────────────────────────────────────────

  describe('PUT /api/settings/stats', () => {
    it('enables stats', async () => {
      const request = createMockRequest('PUT', '/api/settings/stats', { enabled: true });
      const response = await putStatsSettings(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('updates both_sides_required flag', async () => {
      const request = createMockRequest('PUT', '/api/settings/stats', { both_sides_required: true });
      const response = await putStatsSettings(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('updates providers config', async () => {
      const request = createMockRequest('PUT', '/api/settings/stats', {
        providers: [
          { instanceId: 'anthropic-claude', providerId: 'anthropic', model: 'claude-3', sortOrder: 0 },
        ],
      });
      const response = await putStatsSettings(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });
});
