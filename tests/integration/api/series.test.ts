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
import { DELETE as deleteEvent } from '@/app/api/series/[seriesId]/events/[eventId]/route';
import { DELETE as deleteMatchRoute } from '@/app/api/matches/[matchId]/route';
import { DELETE as deleteTournamentRoute } from '@/app/api/tournaments/[tournamentId]/route';
import { GET as listMatchesRoute } from '@/app/api/matches/route';
import { NextRequest } from 'next/server';

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


describe('Series API hardening', () => {
  let game: any;
  let mode: any;
  let seriesId: string;
  let n = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${n++}`;

  async function insertMatch(status = 'complete', tournamentId: string | null = null): Promise<string> {
    const db = getTestDb();
    const id = uniq('m_h');
    await db.run(
      `INSERT INTO matches (id, name, status, match_format, game_id, mode_id, tournament_id, start_date, start_time)
       VALUES (?, 'M', ?, 'casual', ?, ?, ?, CURRENT_TIMESTAMP, '18:00')`,
      [id, status, game.id, mode.id, tournamentId]
    );
    return id;
  }

  async function addEv(body: Record<string, unknown>, sid = seriesId) {
    return parseResponse(await addEvent(
      createMockRequest('POST', `/api/series/${sid}/events`, body),
      createRouteParams({ seriesId: sid })
    ));
  }

  beforeEach(async () => {
    ({ game, mode } = await seedBasicTestData());
    seriesId = uniq('s_h');
    await getTestDb().run(
      `INSERT INTO series (id, name, status, announcements, player_notifications, created_at, updated_at)
       VALUES (?, 'Hardening', 'active', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [seriesId]
    );
  });

  it('dashboard transition: activates a created series and rejects illegal moves with an error message', async () => {
    const id = uniq('s_dash');
    await getTestDb().run(
      `INSERT INTO series (id, name, status, announcements, player_notifications) VALUES (?, 'Dash', 'created', 1, 1)`, [id]
    );
    const ok = await parseResponse(await transitionSeries(
      createMockRequest('POST', `/api/series/${id}/transition`, { status: 'active' }), createRouteParams({ seriesId: id })
    ));
    expect(ok.status).toBe(200);
    expect(ok.data.series.status).toBe('active');

    const cancel = await parseResponse(await transitionSeries(
      createMockRequest('POST', `/api/series/${id}/transition`, { status: 'cancelled' }), createRouteParams({ seriesId: id })
    ));
    expect(cancel.status).toBe(200);

    const bad = await parseResponse(await transitionSeries(
      createMockRequest('POST', `/api/series/${id}/transition`, { status: 'active' }), createRouteParams({ seriesId: id })
    ));
    expect(bad.status).toBe(400);
    expect(typeof bad.data.error).toBe('string');
  });

  it('returns 400 for invalid JSON bodies', async () => {
    const req = new NextRequest(new URL('/api/series', 'http://localhost:3000'), {
      method: 'POST', body: '{not json', headers: { 'Content-Type': 'application/json' },
    } as any);
    const { status } = await parseResponse(await createSeries(req));
    expect(status).toBe(400);
  });

  it('rejects non-string / empty name on create and PATCH', async () => {
    expect((await parseResponse(await createSeries(createMockRequest('POST', '/api/series', { name: 5 })))).status).toBe(400);
    const patch = await parseResponse(await updateSeries(
      createMockRequest('PATCH', `/api/series/${seriesId}`, { name: '  ' }), createRouteParams({ seriesId })
    ));
    expect(patch.status).toBe(400);
  });

  it('PATCH can clear a field with null', async () => {
    await updateSeries(createMockRequest('PATCH', `/api/series/${seriesId}`, { description: 'hello' }), createRouteParams({ seriesId }));
    await updateSeries(createMockRequest('PATCH', `/api/series/${seriesId}`, { description: null }), createRouteParams({ seriesId }));
    const { data } = await parseResponse(await getSeries(createMockRequest('GET', `/api/series/${seriesId}`), createRouteParams({ seriesId })));
    expect(data.series.description).toBeNull();
  });

  it('rejects null / malformed scoring_config with 400', async () => {
    for (const cfg of [null, [], { match_win_points: 'x' }, { tournament_position_points: [1, 'a'] }]) {
      const { status } = await parseResponse(await createSeries(createMockRequest('POST', '/api/series', { name: 'Cfg', scoring_config: cfg } as any)));
      expect(status).toBe(400);
    }
  });

  it('rejects bad points_multiplier and event_order with 400', async () => {
    const m = await insertMatch();
    for (const mult of [0, -1, 11, 'abc']) {
      expect((await addEv({ event_type: 'match', match_id: m, points_multiplier: mult })).status).toBe(400);
    }
    expect((await addEv({ event_type: 'match', match_id: m, event_order: 0 })).status).toBe(400);
    expect((await addEv({ event_type: 'match', match_id: m, event_order: 1.5 })).status).toBe(400);
  });

  it('rejects unknown match/tournament ids with 400', async () => {
    expect((await addEv({ event_type: 'match', match_id: 'missing' })).status).toBe(400);
    expect((await addEv({ event_type: 'tournament', tournament_id: 'missing' })).status).toBe(400);
  });

  it('rejects a duplicate event with 409', async () => {
    const m = await insertMatch();
    expect((await addEv({ event_type: 'match', match_id: m })).status).toBe(201);
    expect((await addEv({ event_type: 'match', match_id: m })).status).toBe(409);
  });

  it('events GET returns 404 for a missing series; POST/DELETE rejected on complete series', async () => {
    const { status } = await parseResponse(await listEvents(createMockRequest('GET', '/api/series/x/events'), createRouteParams({ seriesId: 'x' })));
    expect(status).toBe(404);

    const m = await insertMatch();
    const created = await addEv({ event_type: 'match', match_id: m });
    await getTestDb().run(`UPDATE series SET status = 'complete' WHERE id = ?`, [seriesId]);
    expect((await addEv({ event_type: 'match', match_id: await insertMatch() })).status).toBe(409);
    const del = await parseResponse(await deleteEvent(
      createMockRequest('DELETE', `/x`), createRouteParams({ seriesId, eventId: created.data.id })
    ));
    expect(del.status).toBe(409);
  });

  it('event DELETE is scoped to the series (404 for another series)', async () => {
    const other = uniq('s_other');
    await getTestDb().run(`INSERT INTO series (id, name, status, announcements, player_notifications) VALUES (?, 'Other', 'active', 1, 1)`, [other]);
    const m = await insertMatch();
    const created = await addEv({ event_type: 'match', match_id: m });
    const wrong = await parseResponse(await deleteEvent(
      createMockRequest('DELETE', '/x'), createRouteParams({ seriesId: other, eventId: created.data.id })
    ));
    expect(wrong.status).toBe(404);
    const right = await parseResponse(await deleteEvent(
      createMockRequest('DELETE', '/x'), createRouteParams({ seriesId, eventId: created.data.id })
    ));
    expect(right.status).toBe(200);
  });

  it('standings: single-elim champion gets tournament_position_points[0]', async () => {
    const db = getTestDb();
    await db.run(`UPDATE series SET scoring_config = ? WHERE id = ?`, [JSON.stringify({ tournament_position_points: [25, 18] }), seriesId]);
    const t = uniq('t_se');
    await db.run(`INSERT INTO tournaments (id, name, game_id, format, status, rounds_per_match) VALUES (?, 'T', ?, 'single-elimination', 'complete', 1)`, [t, game.id]);
    const champ = uniq('tt'); const runner = uniq('tt');
    await db.run(`INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'C')`, [champ, t]);
    await db.run(`INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'R')`, [runner, t]);
    await db.run(`INSERT INTO tournament_team_members (id, team_id, user_id, username) VALUES (?, ?, 'uc', 'Champ')`, [uniq('ttm'), champ]);
    await db.run(`INSERT INTO tournament_team_members (id, team_id, user_id, username) VALUES (?, ?, 'ur', 'Runner')`, [uniq('ttm'), runner]);
    const fm = uniq('fm');
    await db.run(
      `INSERT INTO matches (id, name, status, match_format, game_id, mode_id, tournament_id, tournament_round, tournament_bracket_type, winner_team, blue_team_id, red_team_id, start_date, start_time)
       VALUES (?, 'Final', 'complete', 'competitive', ?, ?, ?, 1, 'winners', ?, ?, ?, CURRENT_TIMESTAMP, '18:00')`,
      [fm, game.id, mode.id, t, champ, champ, runner]
    );
    expect((await addEv({ event_type: 'tournament', tournament_id: t })).status).toBe(201);
    const { data } = await parseResponse(await getStandings(createMockRequest('GET', 'x'), createRouteParams({ seriesId })));
    expect(data.standings.find((r: any) => r.username === 'Champ').total_points).toBe(25);
    expect(data.standings.find((r: any) => r.username === 'Runner').total_points).toBe(18);
  });

  it('GET /api/matches supports multiple statuses and exclude_tournament', async () => {
    const t = uniq('t_x');
    await getTestDb().run(`INSERT INTO tournaments (id, name, game_id, format, status, rounds_per_match) VALUES (?, 'T', ?, 'single-elimination', 'battle', 1)`, [t, game.id]);
    const created = await insertMatch('created');
    const done = await insertMatch('complete');
    const tm = await insertMatch('created', t);
    const { data } = await parseResponse(await listMatchesRoute(
      createMockRequest('GET', '/api/matches?status=created&status=complete&exclude_tournament=true')
    ));
    const ids = (data.matches ?? data).map((m: any) => m.id);
    expect(ids).toContain(created);
    expect(ids).toContain(done);
    expect(ids).not.toContain(tm);
  });

  it('match DELETE removes match_teams, placements and series_events', async () => {
    const db = getTestDb();
    const m = await insertMatch();
    const mt = uniq('mt');
    await db.run(`INSERT INTO match_teams (id, match_id, team_name, team_order) VALUES (?, ?, 'Blue', 0)`, [mt, m]);
    const gid = uniq('mg');
    await db.run(`INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`, [gid, m]);
    await db.run(`INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, is_winner) VALUES (?, ?, 'team', ?, 1)`, [uniq('pl'), gid, mt]);
    await addEv({ event_type: 'match', match_id: m });

    const res = await parseResponse(await deleteMatchRoute(createMockRequest('DELETE', `/api/matches/${m}`), createRouteParams({ matchId: m })));
    expect(res.status).toBe(200);
    expect(await db.all(`SELECT * FROM match_teams WHERE match_id = ?`, [m])).toHaveLength(0);
    expect(await db.all(`SELECT * FROM match_game_placements WHERE match_game_id = ?`, [gid])).toHaveLength(0);
    expect(await db.all(`SELECT * FROM series_events WHERE match_id = ?`, [m])).toHaveLength(0);
  });

  it('tournament DELETE removes series_events and its matches\' teams/placements', async () => {
    const db = getTestDb();
    const t = uniq('t_del');
    await db.run(`INSERT INTO tournaments (id, name, game_id, format, status, rounds_per_match) VALUES (?, 'T', ?, 'single-elimination', 'complete', 1)`, [t, game.id]);
    const m = await insertMatch('complete', t);
    const mt = uniq('mt');
    await db.run(`INSERT INTO match_teams (id, match_id, team_name, team_order) VALUES (?, ?, 'Blue', 0)`, [mt, m]);
    const gid = uniq('mg');
    await db.run(`INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`, [gid, m]);
    await db.run(`INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, is_winner) VALUES (?, ?, 'team', ?, 1)`, [uniq('pl'), gid, mt]);
    expect((await addEv({ event_type: 'tournament', tournament_id: t })).status).toBe(201);

    const res = await parseResponse(await deleteTournamentRoute(createMockRequest('DELETE', `/api/tournaments/${t}`), createRouteParams({ tournamentId: t })));
    expect(res.status).toBe(200);
    expect(await db.all(`SELECT * FROM series_events WHERE tournament_id = ?`, [t])).toHaveLength(0);
    expect(await db.all(`SELECT * FROM match_teams WHERE match_id = ?`, [m])).toHaveLength(0);
    expect(await db.all(`SELECT * FROM match_game_placements WHERE match_game_id = ?`, [gid])).toHaveLength(0);
    expect(await db.all(`SELECT * FROM matches WHERE id = ?`, [m])).toHaveLength(0);
  });

  it('series DELETE removes its events', async () => {
    const m = await insertMatch();
    await addEv({ event_type: 'match', match_id: m });
    const res = await parseResponse(await deleteSeries(createMockRequest('DELETE', `/api/series/${seriesId}`), createRouteParams({ seriesId })));
    expect(res.status).toBe(200);
    expect(await getTestDb().all(`SELECT * FROM series_events WHERE series_id = ?`, [seriesId])).toHaveLength(0);
  });
});
