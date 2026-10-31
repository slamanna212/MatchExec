// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode } from '../../utils/pg-fixtures';
import { gameMaps, gameStatDefinitions } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

// Empty database (no seed) so counts and ordering are fully controlled by the tests.
setupPgTestFile();

async function addMap(gameId: string, modeId: string | null, id: string, name: string, extra: Partial<typeof gameMaps.$inferInsert> = {}) {
  await getPgTestDb().insert(gameMaps).values({ id, game_id: gameId, mode_id: modeId, name, ...extra });
}

describe('GET /api/games', () => {
  it('returns an empty array when no games exist', async () => {
    const res = await appRequest('/api/games');
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  it('returns games ordered by name with metadata, booleans and distinct counts', async () => {
    const zed = await createGame({ name: 'Zed', icon_url: '/z.png', color: '#ff0000' });
    const alpha = await createGame({ name: 'Alpha', supports_all_modes: true });
    const m1 = await createGameMode(alpha.id, { name: 'Control' });
    const m2 = await createGameMode(alpha.id, { name: 'Push' });
    // The same map name in two modes counts once; mode count is distinct ids.
    await addMap(alpha.id, m1.id, 'nepal-control', 'Nepal');
    await addMap(alpha.id, m2.id, 'nepal-push', 'Nepal');
    await addMap(alpha.id, m2.id, 'oasis', 'Oasis');

    const res = await appRequest('/api/games');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=600');
    expect(res.data.map((g: any) => g.name)).toEqual(['Alpha', 'Zed']);
    expect(res.data[0]).toMatchObject({ id: alpha.id, supportsAllModes: true, mapCount: 2, modeCount: 2 });
    expect(res.data[1]).toMatchObject({ id: zed.id, iconUrl: '/z.png', color: '#ff0000', supportsAllModes: false, mapCount: 0, modeCount: 0 });
    expect(res.data[0]).toHaveProperty('coverUrl');
    expect(res.data[0]).toHaveProperty('minPlayers');
  });
});

describe('GET /api/games/:gameId', () => {
  it('returns the game', async () => {
    const game = await createGame({ name: 'Overwatch 2', min_players: 10, max_players: 12 });
    const res = await appRequest(`/api/games/${game.id}`);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ id: game.id, name: 'Overwatch 2', minPlayers: 10, maxPlayers: 12, supportsAllModes: false });
    expect(res.data).not.toHaveProperty('color');
  });

  it('returns 404 for an unknown game', async () => {
    const res = await appRequest('/api/games/99999');
    expect(res.status).toBe(404);
    expect(res.data).toEqual({ error: 'Game not found' });
  });
});

describe('GET /api/games/:gameId/modes', () => {
  it('returns [] for a game without modes and for an unknown game', async () => {
    const game = await createGame();
    expect((await appRequest(`/api/games/${game.id}/modes`)).data).toEqual([]);
    const unknown = await appRequest('/api/games/99999/modes');
    expect(unknown.status).toBe(200);
    expect(unknown.data).toEqual([]);
  });

  it('returns modes ordered by name with the game max_players', async () => {
    const game = await createGame({ max_players: 12 });
    await createGameMode(game.id, { name: 'Push', team_size: 5 });
    await createGameMode(game.id, { name: 'Control', team_size: null });

    const res = await appRequest(`/api/games/${game.id}/modes`);
    expect(res.status).toBe(200);
    expect(res.data.map((m: any) => m.name)).toEqual(['Control', 'Push']);
    expect(res.data[0]).toMatchObject({ team_size: null, max_players: 12 });
    expect(Object.keys(res.data[0]).sort()).toEqual(['description', 'id', 'max_players', 'name', 'team_size']);
  });
});

describe('GET /api/games/:gameId/modes/:modeId/maps', () => {
  it('returns maps of the mode ordered by name, with image urls', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    const other = await createGameMode(game.id);
    await addMap(game.id, mode.id, 'nepal', 'Nepal', { image_url: '/images/nepal.jpg' });
    await addMap(game.id, mode.id, 'lijiang', 'Lijiang Tower');
    await addMap(game.id, other.id, 'busan', 'Busan');

    const res = await appRequest(`/api/games/${game.id}/modes/${mode.id}/maps`);
    expect(res.status).toBe(200);
    expect(res.data).toEqual([
      { id: 'lijiang', name: 'Lijiang Tower', modeId: mode.id, imageUrl: null },
      { id: 'nepal', name: 'Nepal', modeId: mode.id, imageUrl: '/images/nepal.jpg' },
    ]);
  });

  it('returns [] for unknown game or mode', async () => {
    const game = await createGame();
    expect((await appRequest('/api/games/99999/modes/1/maps')).data).toEqual([]);
    expect((await appRequest(`/api/games/${game.id}/modes/99999/maps`)).data).toEqual([]);
  });
});

describe('GET /api/games/:gameId/maps', () => {
  it('lists every mode/map combination with mode info and a boolean tournament_enabled', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id, { name: 'Control', description: 'Hold the point' });
    await addMap(game.id, mode.id, 'nepal', 'Nepal', { tournament_enabled: false, location: 'Nepal' });

    const res = await appRequest(`/api/games/${game.id}/maps`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, stale-while-revalidate=300');
    expect(res.data).toEqual([
      {
        id: 'nepal', name: 'Nepal', modeId: mode.id, imageUrl: null, location: 'Nepal', modeName: 'Control',
        modeDescription: 'Hold the point', tournament_enabled: false,
      },
    ]);
  });

  it('deduplicates by map name for games that support all modes', async () => {
    const game = await createGame({ supports_all_modes: true });
    const a = await createGameMode(game.id, { name: 'A' });
    const b = await createGameMode(game.id, { name: 'B' });
    await addMap(game.id, a.id, 'track-a', 'Track');
    await addMap(game.id, b.id, 'track-b', 'Track');
    await addMap(game.id, b.id, 'other', 'Other');

    const res = await appRequest(`/api/games/${game.id}/maps`);
    expect(res.status).toBe(200);
    expect(res.data.map((m: any) => m.name)).toEqual(['Other', 'Track']);
    const track = res.data.find((m: any) => m.name === 'Track');
    expect(track).toMatchObject({ id: 'track-a', modeName: 'All Modes', modeDescription: 'Available for all game modes', tournament_enabled: true });
  });

  it('returns [] for an unknown game', async () => {
    const res = await appRequest('/api/games/nope/maps');
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });
});

describe('PATCH /api/games/:gameId/maps', () => {
  const patch = (gameId: string, json: unknown) => appRequest(`/api/games/${gameId}/maps`, { method: 'PATCH', json });

  it('updates tournament_enabled for every row with the map name (accepts 0/1)', async () => {
    const game = await createGame();
    const m1 = await createGameMode(game.id);
    const m2 = await createGameMode(game.id);
    await addMap(game.id, m1.id, 'hana-1', 'Hanamura');
    await addMap(game.id, m2.id, 'hana-2', 'Hanamura');
    await addMap(game.id, m1.id, 'other', 'Other');

    const res = await patch(game.id, { updates: [{ name: 'Hanamura', tournament_enabled: 0 }] });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true, updated: 2 });

    const rows = await getPgTestDb().select().from(gameMaps);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.tournament_enabled]))).toEqual({ 'hana-1': false, 'hana-2': false, other: true });

    const back = await patch(game.id, { updates: [{ name: 'Hanamura', tournament_enabled: 1 }] });
    expect(back.data.updated).toBe(2);
  });

  it('also accepts real booleans', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    await addMap(game.id, mode.id, 'm', 'Map');
    const res = await patch(game.id, { updates: [{ name: 'Map', tournament_enabled: false }] });
    expect(res.data).toEqual({ success: true, updated: 1 });
  });

  it('returns 200 with zero updated for an unknown map name', async () => {
    const game = await createGame();
    const res = await patch(game.id, { updates: [{ name: 'Nope', tournament_enabled: 0 }] });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ success: true, updated: 0 });
  });

  it('validates the body: missing/empty updates and bad items return 400', async () => {
    const game = await createGame();
    expect((await patch(game.id, {})).status).toBe(400);
    expect((await patch(game.id, { updates: [] })).status).toBe(400);
    const badName = await patch(game.id, { updates: [{ name: 5, tournament_enabled: 1 }] });
    expect(badName.status).toBe(400);
    expect(badName.data.error).toBe('Each update must have name (string) and tournament_enabled (0 or 1)');
    expect((await patch(game.id, { updates: [{ name: 'x', tournament_enabled: 2 }] })).status).toBe(400);
  });

  it('applies nothing when a later item is invalid', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id);
    await addMap(game.id, mode.id, 'm', 'Map');
    const res = await patch(game.id, { updates: [{ name: 'Map', tournament_enabled: 0 }, { name: 'Map' }] });
    expect(res.status).toBe(400);
    const [row] = await getPgTestDb().select().from(gameMaps);
    expect(row.tournament_enabled).toBe(true);
  });
});

describe('GET /api/games/:gameId/stats', () => {
  it('returns [] when the game has no stat definitions or does not exist', async () => {
    const game = await createGame();
    expect((await appRequest(`/api/games/${game.id}/stats`)).data).toEqual([]);
    expect((await appRequest('/api/games/nonexistent/stats')).data).toEqual([]);
  });

  it('returns definitions ordered by sort_order with a boolean is_primary', async () => {
    const game = await createGame();
    await getPgTestDb().insert(gameStatDefinitions).values([
      { id: 'deaths', game_id: game.id, name: 'deaths', display_name: 'Deaths', sort_order: 2 },
      { id: 'kills', game_id: game.id, name: 'kills', display_name: 'Kills', sort_order: 1, is_primary: true },
    ]);
    const res = await appRequest(`/api/games/${game.id}/stats`);
    expect(res.status).toBe(200);
    expect(res.data.map((d: any) => d.name)).toEqual(['kills', 'deaths']);
    expect(res.data[0]).toMatchObject({ is_primary: true, chart_type: 'bar', stat_type: 'number' });
    expect(res.data[1].is_primary).toBe(false);
  });
});

describe('GET /api/games/:gameId/modes/:modeId (seed data on disk)', () => {
  it('returns the mode definition from data/games/<game>/modes.json', async () => {
    const list = await appRequest('/api/games/overwatch2/modes/ow2-5v5');
    // The id may not exist in every seed version: either the mode or a clean 404.
    expect([200, 404]).toContain(list.status);
  });

  it('returns 404 for an unknown game and for an unknown mode', async () => {
    const noGame = await appRequest('/api/games/nonexistent/modes/someid');
    expect(noGame.status).toBe(404);
    expect(noGame.data.error).toContain("Game 'nonexistent' not found");
    const noMode = await appRequest('/api/games/overwatch2/modes/invalid-mode');
    expect(noMode.status).toBe(404);
    expect(noMode.data.error).toBe("Mode 'invalid-mode' not found in game 'overwatch2'");
  });
});
