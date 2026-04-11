import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse } from '../../utils/api-helpers';
import { getTestDb } from '../../utils/test-db';
import { GET, PUT } from '@/app/api/settings/scheduler/route';

describe('Settings Scheduler API', () => {
  let db: any;

  beforeEach(async () => {
    db = getTestDb();
  });

  describe('GET /api/settings/scheduler', () => {
    it('returns default values when no settings row exists', async () => {
      const response = await GET();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.match_check_cron).toBeDefined();
      expect(data.cleanup_check_cron).toBeDefined();
      expect(data.channel_refresh_cron).toBeDefined();
    });

    it('returns stored settings when row exists', async () => {
      await db.run(`
        INSERT INTO scheduler_settings (id, match_check_cron, cleanup_check_cron, channel_refresh_cron, match_cleanup_cron, reminder_check_cron, queue_processing_cron)
        VALUES (1, '0 */5 * * * *', '0 0 2 * * *', '0 0 0 * * *', '0 0 2 * * *', '0 */5 * * * *', '*/30 * * * * *')
      `);

      const response = await GET();
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.match_check_cron).toBe('0 */5 * * * *');
    });
  });

  describe('PUT /api/settings/scheduler', () => {
    it('returns 400 when cron expression has wrong number of parts', async () => {
      await db.run(`
        INSERT INTO scheduler_settings (id, match_check_cron, cleanup_check_cron, channel_refresh_cron, match_cleanup_cron, reminder_check_cron, queue_processing_cron)
        VALUES (1, '0 */1 * * * *', '0 0 2 * * *', '0 0 0 * * *', '0 0 2 * * *', '0 */5 * * * *', '*/30 * * * * *')
      `);

      const request = createMockRequest('PUT', '/api/settings/scheduler', {
        match_check_cron: '*/5 * * *', // only 4 parts, needs 6
        cleanup_check_cron: '0 0 2 * * *',
        channel_refresh_cron: '0 0 0 * * *',
      });
      const response = await PUT(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('returns 400 when cron part is out of range', async () => {
      await db.run(`
        INSERT INTO scheduler_settings (id, match_check_cron, cleanup_check_cron, channel_refresh_cron, match_cleanup_cron, reminder_check_cron, queue_processing_cron)
        VALUES (1, '0 */1 * * * *', '0 0 2 * * *', '0 0 0 * * *', '0 0 2 * * *', '0 */5 * * * *', '*/30 * * * * *')
      `);

      const request = createMockRequest('PUT', '/api/settings/scheduler', {
        match_check_cron: '0 */1 * * * 8', // dayOfWeek 8 is out of range (0-7)
        cleanup_check_cron: '0 0 2 * * *',
        channel_refresh_cron: '0 0 0 * * *',
      });
      const response = await PUT(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(400);
    });

    it('updates settings with valid 6-part cron expressions', async () => {
      await db.run(`
        INSERT INTO scheduler_settings (id, match_check_cron, cleanup_check_cron, channel_refresh_cron, match_cleanup_cron, reminder_check_cron, queue_processing_cron)
        VALUES (1, '0 */1 * * * *', '0 0 2 * * *', '0 0 0 * * *', '0 0 2 * * *', '0 */5 * * * *', '*/30 * * * * *')
      `);

      const request = createMockRequest('PUT', '/api/settings/scheduler', {
        match_check_cron: '0 */2 * * * *',
        cleanup_check_cron: '0 0 3 * * *',
        channel_refresh_cron: '0 0 1 * * *',
      });
      const response = await PUT(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.match_check_cron).toBe('0 */2 * * * *');
    });

    it('accepts wildcard step expressions', async () => {
      await db.run(`
        INSERT INTO scheduler_settings (id, match_check_cron, cleanup_check_cron, channel_refresh_cron, match_cleanup_cron, reminder_check_cron, queue_processing_cron)
        VALUES (1, '0 */1 * * * *', '0 0 2 * * *', '0 0 0 * * *', '0 0 2 * * *', '0 */5 * * * *', '*/30 * * * * *')
      `);

      const request = createMockRequest('PUT', '/api/settings/scheduler', {
        match_check_cron: '*/30 * * * * *',
        cleanup_check_cron: '0 0 2 * * *',
        channel_refresh_cron: '0 0 0 * * *',
      });
      const response = await PUT(request);
      const { status } = await parseResponse(response);
      expect(status).toBe(200);
    });
  });
});
