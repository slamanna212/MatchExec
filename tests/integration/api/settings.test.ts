import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse } from '../../utils/api-helpers';
import { getTestDb } from '../../utils/test-db';
import { GET as getStatsSettings, PUT as updateStatsSettings } from '@/app/api/settings/stats/route';

// Discord/announcer/ui/scheduler/log-level settings moved to tests/integration/server/settings.test.ts.
// Stats settings stay on the old harness until the Stats domain is ported.
describe('Stats Settings API', () => {
  describe('Stats Settings', () => {
    beforeEach(async () => {
      const db = getTestDb();
      await db.run('INSERT OR IGNORE INTO stats_settings (id) VALUES (1)');
    });

    it('should return stats_report_dm_enabled in GET response', async () => {
      const response = await getStatsSettings();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('stats_report_dm_enabled');
      expect(typeof data.stats_report_dm_enabled).toBe('boolean');
    });

    it('should persist stats_report_dm_enabled via PUT', async () => {
      const request = createMockRequest('PUT', '/api/settings/stats', {
        stats_report_dm_enabled: true,
      });

      const response = await updateStatsSettings(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data).toHaveProperty('success', true);

      const getResponse = await getStatsSettings();
      const { data: savedData } = await parseResponse(getResponse);
      expect(savedData.stats_report_dm_enabled).toBe(true);
    });

    it('should persist stats_report_dm_enabled=false via PUT', async () => {
      const request = createMockRequest('PUT', '/api/settings/stats', {
        stats_report_dm_enabled: false,
      });

      const putResponse = await updateStatsSettings(request);
      const { status } = await parseResponse(putResponse);
      expect(status).toBe(200);

      const getResponse = await getStatsSettings();
      const { data } = await parseResponse(getResponse);
      expect(data.stats_report_dm_enabled).toBe(false);
    });
  });
});
