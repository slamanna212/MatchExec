import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/metrics/route';

describe('Metrics API', () => {
  describe('GET /api/metrics', () => {
    it('returns prometheus text format with 200 status', async () => {
      const response = await GET();

      expect(response.status).toBe(200);
      const contentType = response.headers.get('Content-Type');
      expect(contentType).toContain('text/plain');
    });

    it('includes uptime metric', async () => {
      const response = await GET();
      const text = await response.text();

      expect(text).toContain('matchexec_uptime_seconds');
    });

    it('includes memory metrics', async () => {
      const response = await GET();
      const text = await response.text();

      expect(text).toContain('matchexec_memory_rss_bytes');
      expect(text).toContain('matchexec_memory_heap_used_bytes');
      expect(text).toContain('matchexec_memory_heap_total_bytes');
    });

    it('includes match and tournament count metrics', async () => {
      const response = await GET();
      const text = await response.text();

      expect(text).toContain('matchexec_matches_count');
      expect(text).toContain('matchexec_tournaments_count');
    });

    it('includes participant count metrics', async () => {
      const response = await GET();
      const text = await response.text();

      expect(text).toContain('matchexec_match_participants_total');
      expect(text).toContain('matchexec_tournament_participants_total');
    });

    it('uses HELP and TYPE prometheus format', async () => {
      const response = await GET();
      const text = await response.text();

      expect(text).toContain('# HELP');
      expect(text).toContain('# TYPE');
    });
  });
});
