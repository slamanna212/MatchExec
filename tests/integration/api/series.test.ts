import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData } from '../../utils/fixtures';
import { GET as listSeries, POST as createSeries } from '@/app/api/series/route';
import {
  GET as getSeries,
  PATCH as updateSeries,
  DELETE as deleteSeries,
} from '@/app/api/series/[seriesId]/route';
import {
  GET as listEvents,
  POST as addEvent,
} from '@/app/api/series/[seriesId]/events/route';
import { GET as getStandings } from '@/app/api/series/[seriesId]/standings/route';
import { POST as transitionSeries } from '@/app/api/series/[seriesId]/transition/route';

describe('Series API', () => {
  describe('GET /api/series', () => {
    it('returns empty array when no series exist', async () => {
      const req = createMockRequest('GET', '/api/series');
      const { status, data } = await parseResponse(await listSeries(req));

      expect(status).toBe(200);
      expect(Array.isArray(data.series)).toBe(true);
    });

    it('returns all series', async () => {
      // Create two series directly in DB
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES ('s_list1', 'List One', 'created', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          (err) => err ? rej(err) : res()
        );
      });
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES ('s_list2', 'List Two', 'active', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          (err) => err ? rej(err) : res()
        );
      });

      const req = createMockRequest('GET', '/api/series');
      const { status, data } = await parseResponse(await listSeries(req));

      expect(status).toBe(200);
      const ids = data.series.map((s: any) => s.id);
      expect(ids).toContain('s_list1');
      expect(ids).toContain('s_list2');
    });

    it('filters by status', async () => {
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES ('s_active_f', 'Active One', 'active', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          (err) => err ? rej(err) : res()
        );
      });

      const req = createMockRequest('GET', '/api/series?status=active');
      const { status, data } = await parseResponse(await listSeries(req));

      expect(status).toBe(200);
      expect(data.series.every((s: any) => s.status === 'active')).toBe(true);
    });
  });

  describe('POST /api/series', () => {
    it('creates a series and returns id and name', async () => {
      const req = createMockRequest('POST', '/api/series', { name: 'Spring Cup 2026' });
      const { status, data } = await parseResponse(await createSeries(req));

      expect(status).toBe(201);
      expect(data.id).toBeDefined();
    });

    it('returns 400 when name is missing', async () => {
      const req = createMockRequest('POST', '/api/series', { description: 'no name' });
      const { status } = await parseResponse(await createSeries(req));

      expect(status).toBe(400);
    });
  });

  describe('GET /api/series/[seriesId]', () => {
    it('returns series details', async () => {
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES ('s_detail', 'Detail Series', 'created', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          (err) => err ? rej(err) : res()
        );
      });

      const req = createMockRequest('GET', '/api/series/s_detail');
      const { status, data } = await parseResponse(
        await getSeries(req, createRouteParams({ seriesId: 's_detail' }))
      );

      expect(status).toBe(200);
      expect(data.series.id).toBe('s_detail');
      expect(data.series.name).toBe('Detail Series');
    });

    it('returns 404 for unknown series', async () => {
      const req = createMockRequest('GET', '/api/series/no-such-id');
      const { status } = await parseResponse(
        await getSeries(req, createRouteParams({ seriesId: 'no-such-id' }))
      );
      expect(status).toBe(404);
    });
  });

  describe('PATCH /api/series/[seriesId]', () => {
    it('updates series name', async () => {
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES ('s_patch', 'Before', 'created', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          (err) => err ? rej(err) : res()
        );
      });

      const req = createMockRequest('PATCH', '/api/series/s_patch', { name: 'After' });
      const { status, data } = await parseResponse(
        await updateSeries(req, createRouteParams({ seriesId: 's_patch' }))
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify DB was updated
      const getReq = createMockRequest('GET', '/api/series/s_patch');
      const { data: updated } = await parseResponse(
        await getSeries(getReq, createRouteParams({ seriesId: 's_patch' }))
      );
      expect(updated.series.name).toBe('After');
    });

    it('ignores a status field instead of applying it — status changes go through POST /transition', async () => {
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES ('s_activate', 'Activate Me', 'created', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          (err) => err ? rej(err) : res()
        );
      });

      const req = createMockRequest('PATCH', '/api/series/s_activate', { status: 'complete' });
      const { status } = await parseResponse(await updateSeries(req, createRouteParams({ seriesId: 's_activate' })));
      expect(status).toBe(200);

      const getReq = createMockRequest('GET', '/api/series/s_activate');
      const { data } = await parseResponse(
        await getSeries(getReq, createRouteParams({ seriesId: 's_activate' }))
      );
      // PATCH must not be able to jump straight to 'complete' — status is untouched.
      expect(data.series.status).toBe('created');
    });

    it('returns 404 for unknown series', async () => {
      const req = createMockRequest('PATCH', '/api/series/nope', { name: 'x' });
      const { status } = await parseResponse(
        await updateSeries(req, createRouteParams({ seriesId: 'nope' }))
      );
      expect(status).toBe(404);
    });
  });

  describe('POST /api/series/[seriesId]/transition', () => {
    async function insertSeriesWithStatus(id: string, seriesStatus: string): Promise<void> {
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES (?, 'Transition Test', ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [id, seriesStatus],
          (err: unknown) => err ? rej(err) : res()
        );
      });
    }

    it('allows created -> active', async () => {
      await insertSeriesWithStatus('s_t1', 'created');
      const req = createMockRequest('POST', '/api/series/s_t1/transition', { status: 'active' });
      const { status, data } = await parseResponse(
        await transitionSeries(req, createRouteParams({ seriesId: 's_t1' }))
      );
      expect(status).toBe(200);
      expect(data.series.status).toBe('active');
    });

    it('rejects created -> complete (skips active)', async () => {
      await insertSeriesWithStatus('s_t2', 'created');
      const req = createMockRequest('POST', '/api/series/s_t2/transition', { status: 'complete' });
      const { status } = await parseResponse(
        await transitionSeries(req, createRouteParams({ seriesId: 's_t2' }))
      );
      expect(status).toBe(400);

      const getReq = createMockRequest('GET', '/api/series/s_t2');
      const { data } = await parseResponse(await getSeries(getReq, createRouteParams({ seriesId: 's_t2' })));
      expect(data.series.status).toBe('created');
    });

    it('rejects transitioning out of a completed series', async () => {
      await insertSeriesWithStatus('s_t3', 'complete');
      const req = createMockRequest('POST', '/api/series/s_t3/transition', { status: 'active' });
      const { status } = await parseResponse(
        await transitionSeries(req, createRouteParams({ seriesId: 's_t3' }))
      );
      expect(status).toBe(400);
    });

    it('rejects an invalid status value', async () => {
      await insertSeriesWithStatus('s_t4', 'created');
      const req = createMockRequest('POST', '/api/series/s_t4/transition', { status: 'bogus' });
      const { status } = await parseResponse(
        await transitionSeries(req, createRouteParams({ seriesId: 's_t4' }))
      );
      expect(status).toBe(400);
    });

    it('returns 404 for unknown series', async () => {
      const req = createMockRequest('POST', '/api/series/nope/transition', { status: 'active' });
      const { status } = await parseResponse(
        await transitionSeries(req, createRouteParams({ seriesId: 'nope' }))
      );
      expect(status).toBe(404);
    });
  });

  describe('DELETE /api/series/[seriesId]', () => {
    it('deletes series and returns success', async () => {
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES ('s_del', 'Delete Me', 'created', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          (err) => err ? rej(err) : res()
        );
      });

      const req = createMockRequest('DELETE', '/api/series/s_del');
      const { status, data } = await parseResponse(
        await deleteSeries(req, createRouteParams({ seriesId: 's_del' }))
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Confirm gone
      const getReq = createMockRequest('GET', '/api/series/s_del');
      const { status: getStatus } = await parseResponse(
        await getSeries(getReq, createRouteParams({ seriesId: 's_del' }))
      );
      expect(getStatus).toBe(404);
    });

    it('returns 404 for unknown series', async () => {
      const req = createMockRequest('DELETE', '/api/series/nope');
      const { status } = await parseResponse(
        await deleteSeries(req, createRouteParams({ seriesId: 'nope' }))
      );
      expect(status).toBe(404);
    });
  });

  describe('Events — GET /api/series/[seriesId]/events', () => {
    it('returns empty events list for new series', async () => {
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES ('s_ev_empty', 'No Events', 'created', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          (err) => err ? rej(err) : res()
        );
      });

      const req = createMockRequest('GET', '/api/series/s_ev_empty/events');
      const { status, data } = await parseResponse(
        await listEvents(req, createRouteParams({ seriesId: 's_ev_empty' }))
      );

      expect(status).toBe(200);
      expect(data.events).toHaveLength(0);
    });
  });

  describe('Events — POST /api/series/[seriesId]/events', () => {
    let seriesId: string;
    let matchId: string;

    beforeEach(async () => {
      const { game, mode } = await seedBasicTestData();
      const db = getTestDb();
      seriesId = `s_ev_${Date.now()}`;
      matchId = `m_ev_${Date.now()}`;

      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES (?, 'Event Series', 'active', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [seriesId], (err) => err ? rej(err) : res()
        );
      });
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO matches (id, name, status, match_format, game_id, mode_id, start_date, start_time)
           VALUES (?, 'Test Match', 'complete', 'casual', ?, ?, CURRENT_TIMESTAMP, '18:00')`,
          [matchId, game.id, mode.id], (err) => err ? rej(err) : res()
        );
      });
    });

    it('adds a match event and returns its id', async () => {
      const req = createMockRequest('POST', `/api/series/${seriesId}/events`, {
        event_type: 'match',
        match_id: matchId,
        points_multiplier: 1.5,
      });
      const { status, data } = await parseResponse(
        await addEvent(req, createRouteParams({ seriesId }))
      );

      expect(status).toBe(201);
      expect(data.id).toBeDefined();
    });

    it('returns 400 when event_type is invalid', async () => {
      const req = createMockRequest('POST', `/api/series/${seriesId}/events`, {
        event_type: 'invalid',
        match_id: matchId,
      });
      const { status } = await parseResponse(
        await addEvent(req, createRouteParams({ seriesId }))
      );
      expect(status).toBe(400);
    });

    it('returns 400 when match event missing match_id', async () => {
      const req = createMockRequest('POST', `/api/series/${seriesId}/events`, {
        event_type: 'match',
      });
      const { status } = await parseResponse(
        await addEvent(req, createRouteParams({ seriesId }))
      );
      expect(status).toBe(400);
    });

    it('returns 400 when tournament event missing tournament_id', async () => {
      const req = createMockRequest('POST', `/api/series/${seriesId}/events`, {
        event_type: 'tournament',
      });
      const { status } = await parseResponse(
        await addEvent(req, createRouteParams({ seriesId }))
      );
      expect(status).toBe(400);
    });

    it('returns 404 when series does not exist', async () => {
      const req = createMockRequest('POST', '/api/series/nope/events', {
        event_type: 'match',
        match_id: matchId,
      });
      const { status } = await parseResponse(
        await addEvent(req, createRouteParams({ seriesId: 'nope' }))
      );
      expect(status).toBe(404);
    });
  });

  describe('Standings — GET /api/series/[seriesId]/standings', () => {
    it('returns 404 for unknown series', async () => {
      const req = createMockRequest('GET', '/api/series/nope/standings');
      const { status } = await parseResponse(
        await getStandings(req, createRouteParams({ seriesId: 'nope' }))
      );
      expect(status).toBe(404);
    });

    it('returns standings envelope with series metadata', async () => {
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
           VALUES ('s_stands', 'Standings Series', 'active', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          (err) => err ? rej(err) : res()
        );
      });

      const req = createMockRequest('GET', '/api/series/s_stands/standings');
      const { status, data } = await parseResponse(
        await getStandings(req, createRouteParams({ seriesId: 's_stands' }))
      );

      expect(status).toBe(200);
      expect(data.series_id).toBe('s_stands');
      expect(data.series_name).toBe('Standings Series');
      expect(Array.isArray(data.standings)).toBe(true);
    });
  });
});
