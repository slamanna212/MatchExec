/**
 * List endpoints expose each item's series so match/tournament cards can link
 * back to them. A match also inherits the series of the tournament it's in.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse } from '../../utils/api-helpers';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch, createTournament } from '../../utils/fixtures';
import { forwardToApp as listMatches } from '../../utils/legacy-match-routes';
import { forwardToApp as listTournaments } from '../../utils/legacy-match-routes';

let db: ReturnType<typeof getTestDb>;
let order = 0;

async function series(id: string, name: string) {
  await db.run(`INSERT INTO series (id, name, status) VALUES (?, ?, 'active')`, [id, name]);
}
async function link(seriesId: string, kind: 'match' | 'tournament', entityId: string) {
  await db.run(
    `INSERT INTO series_events (id, series_id, event_type, match_id, tournament_id, event_order) VALUES (?, ?, ?, ?, ?, ?)`,
    [`se_${++order}`, seriesId, kind, kind === 'match' ? entityId : null, kind === 'tournament' ? entityId : null, order]
  );
}

describe('series refs on list endpoints', () => {
  beforeEach(() => { db = getTestDb(); });

  it('GET /api/matches returns direct and tournament-inherited series, [] otherwise', async () => {
    const { game, mode } = await seedBasicTestData();
    const direct = await createMatch(game.id, mode.id, { status: 'complete' });
    const plain = await createMatch(game.id, mode.id, { status: 'complete' });
    const tournament = await createTournament(game.id, { game_mode_id: mode.id });
    const inTournament = await createMatch(game.id, mode.id, { status: 'complete' });
    await db.run(`UPDATE matches SET tournament_id = ? WHERE id = ?`, [tournament.id, inTournament.id]);

    await series('s_a', 'Fall Cup');
    await series('s_b', 'Winter League');
    await link('s_a', 'match', direct.id);
    await link('s_b', 'match', direct.id);
    await link('s_a', 'tournament', tournament.id);

    const res = await parseResponse(await listMatches(createMockRequest('GET', '/api/matches?status=complete')));
    expect(res.status).toBe(200);
    const byId = Object.fromEntries((res.data as Array<{ id: string; series: unknown }>).map(m => [m.id, m]));

    expect((byId[direct.id].series as Array<{ name: string }>).map(s => s.name).sort()).toEqual(['Fall Cup', 'Winter League']);
    expect(byId[inTournament.id].series).toEqual([{ id: 's_a', name: 'Fall Cup' }]);
    expect(byId[plain.id].series).toEqual([]);
    expect(byId[direct.id]).not.toHaveProperty('series_json');
  });

  it('GET /api/tournaments returns the tournament series', async () => {
    const { game, mode } = await seedBasicTestData();
    const inSeries = await createTournament(game.id, { game_mode_id: mode.id });
    const plain = await createTournament(game.id, { game_mode_id: mode.id });
    await series('s_c', 'Spring Series');
    await link('s_c', 'tournament', inSeries.id);

    const res = await parseResponse(await listTournaments(createMockRequest('GET', '/api/tournaments')));
    expect(res.status).toBe(200);
    const byId = Object.fromEntries((res.data as Array<{ id: string; series: unknown }>).map(t => [t.id, t]));
    expect(byId[inSeries.id].series).toEqual([{ id: 's_c', name: 'Spring Series' }]);
    expect(byId[plain.id].series).toEqual([]);
  });
});
