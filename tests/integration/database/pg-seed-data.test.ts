// @vitest-environment node
// Ported from the SQLite seeder.test / seeder-full.test / seeder-data-integrity.test suites.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { dataVersions, gameMaps, gameModes, games } from '../../../lib/db/schema';
import { seedDatabase } from '../../../lib/db/seed';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';

setupPgTestFile(); // unseeded; each test seeds what it needs

const GAMES_DIR = path.join(process.cwd(), 'data', 'games');
const gameDirs = fs.readdirSync(GAMES_DIR).filter((d) => fs.existsSync(path.join(GAMES_DIR, d, 'game.json')));
const readJson = <T,>(...p: string[]): T => JSON.parse(fs.readFileSync(path.join(GAMES_DIR, ...p), 'utf-8')) as T;
const load = (dir: string) => ({
  game: readJson<{ id: string; name: string; dataVersion: string }>(dir, 'game.json'),
  modes: readJson<Array<{ id: string; name: string }>>(dir, 'modes.json'),
  maps: readJson<Array<{ id: string; name: string }>>(dir, 'maps.json'),
});

function tempGamesDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mx-seed-'));
}
function writeGame(root: string, dir: string, game: Record<string, unknown>, modes?: unknown): void {
  const d = path.join(root, dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'game.json'), typeof game === 'string' ? game : JSON.stringify(game));
  if (modes) fs.writeFileSync(path.join(d, 'modes.json'), JSON.stringify(modes));
}
const validGame = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: `Name ${id}`, genre: 'FPS', developer: 'Dev', releaseDate: '2024-01-01', patch: '1.0.0', description: 'd',
  minPlayers: 2, maxPlayers: 10, dataVersion: '1.0.0', assets: { iconUrl: '/t.png' }, ...extra,
});

describe('game data directories', () => {
  const expected = ['overwatch2', 'valorant', 'marvelrivals', 'leagueoflegends', 'r6siege', 'counterstrike2'];

  it('has data directories for all supported games', () => {
    expect(gameDirs.length).toBeGreaterThanOrEqual(6);
    for (const id of expected) expect(gameDirs).toContain(id);
  });

  it('has a valid game.json for each game (name, id, dataVersion, id === dir)', () => {
    for (const id of expected) {
      const { game } = load(id);
      expect(game).toHaveProperty('name');
      expect(game).toHaveProperty('dataVersion');
      expect(game.id).toBe(id);
    }
  });

  it('has modes.json (non-empty, id + name) for each game', () => {
    for (const id of expected) {
      const { modes } = load(id);
      expect(modes.length).toBeGreaterThan(0);
      for (const m of modes) { expect(m).toHaveProperty('id'); expect(m).toHaveProperty('name'); }
    }
  });

  it('has maps.json (array, id + name) for each game', () => {
    for (const id of expected) {
      const { maps } = load(id);
      expect(Array.isArray(maps)).toBe(true);
      for (const m of maps) { expect(m).toHaveProperty('id'); expect(m).toHaveProperty('name'); }
    }
  });
});

describe('seedDatabase: data integrity', () => {
  beforeEach(async () => { await seedDatabase(getPgTestDb()); });

  it.each(gameDirs)('%s: data_versions row matches game.json dataVersion', async (dir) => {
    const { game } = load(dir);
    const [row] = await getPgTestDb().select().from(dataVersions).where(eq(dataVersions.game_id, game.id));
    expect(row?.data_version).toBe(game.dataVersion);
  });

  it('every game_mode and game_map references an existing game / mode (no orphans)', async () => {
    const db = getPgTestDb();
    const orphanModes = await db.select({ id: gameModes.id }).from(gameModes).leftJoin(games, eq(games.id, gameModes.game_id)).where(isNull(games.id));
    const orphanMaps = await db.select({ id: gameMaps.id }).from(gameMaps).leftJoin(games, eq(games.id, gameMaps.game_id)).where(isNull(games.id));
    const orphanMapModes = await db.select({ id: gameMaps.id }).from(gameMaps)
      .leftJoin(gameModes, eq(gameModes.id, gameMaps.mode_id)).where(sql`${isNotNull(gameMaps.mode_id)} AND ${isNull(gameModes.id)}`);
    expect(orphanModes).toHaveLength(0);
    expect(orphanMaps).toHaveLength(0);
    expect(orphanMapModes).toHaveLength(0);
  });

  it.each(['overwatch2', 'valorant'])('%s has every mode from modes.json seeded', async (dir) => {
    const seeded = (await getPgTestDb().select({ id: gameModes.id }).from(gameModes).where(eq(gameModes.game_id, dir))).map((m) => m.id);
    for (const m of load(dir).modes) expect(seeded).toContain(m.id);
  });

  it('overwatch2 has at least as many maps as maps.json', async () => {
    const [{ n }] = await getPgTestDb().select({ n: count() }).from(gameMaps).where(eq(gameMaps.game_id, 'overwatch2'));
    expect(n).toBeGreaterThanOrEqual(load('overwatch2').maps.length);
  });

  it('re-running with unchanged dataVersions adds no games, modes or version rows', async () => {
    const db = getPgTestDb();
    const snap = async () => [
      (await db.select({ n: count() }).from(games))[0].n,
      (await db.select({ n: count() }).from(gameModes))[0].n,
      (await db.select({ n: count() }).from(gameMaps))[0].n,
      (await db.select({ n: count() }).from(dataVersions))[0].n,
    ];
    const before = await snap();
    expect(await seedDatabase(db)).toBe(0);
    expect(await snap()).toEqual(before);
  });

  it('every game has at least one mode and one map; at least 6 games', async () => {
    const db = getPgTestDb();
    const all = await db.select({ id: games.id }).from(games);
    expect(all.length).toBeGreaterThanOrEqual(6);
    for (const g of all) {
      expect((await db.select({ n: count() }).from(gameModes).where(eq(gameModes.game_id, g.id)))[0].n).toBeGreaterThan(0);
      expect((await db.select({ n: count() }).from(gameMaps).where(eq(gameMaps.game_id, g.id)))[0].n).toBeGreaterThan(0);
    }
  });

  it('skips a game whose dataVersion is unchanged (local edits survive)', async () => {
    const db = getPgTestDb();
    await db.update(games).set({ name: 'Modified Name' }).where(eq(games.id, 'overwatch2'));
    await seedDatabase(db);
    expect((await db.select().from(games).where(eq(games.id, 'overwatch2')))[0].name).toBe('Modified Name');
  });

  it('re-seeds a game when its dataVersion changes', async () => {
    const db = getPgTestDb();
    await db.update(games).set({ name: 'Modified Name' }).where(eq(games.id, 'overwatch2'));
    await db.update(dataVersions).set({ data_version: 'old-version' }).where(eq(dataVersions.game_id, 'overwatch2'));
    await seedDatabase(db);
    expect((await db.select().from(games).where(eq(games.id, 'overwatch2')))[0].name).toBe(load('overwatch2').game.name);
  });
});

describe('seedDatabase: error handling', () => {
  it('handles a missing games directory (seeds no games)', async () => {
    const db = getPgTestDb();
    await expect(seedDatabase(db, { gamesDir: '/nonexistent/path' })).resolves.toBe(0);
    expect(await db.select().from(games)).toHaveLength(0);
  });

  it('does not throw for invalid game.json', async () => {
    const root = tempGamesDir();
    try {
      writeGame(root, 'bad-game', '{ this is not valid json }' as never);
      await expect(seedDatabase(getPgTestDb(), { gamesDir: root })).resolves.toBeDefined();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('skips invalid game directories without affecting valid ones', async () => {
    const root = tempGamesDir();
    try {
      writeGame(root, 'valid-test-game', validGame('valid-test-game'));
      writeGame(root, 'bad-game', '{ invalid json }' as never);
      await seedDatabase(getPgTestDb(), { gamesDir: root });
      expect(await getPgTestDb().select().from(games).where(eq(games.id, 'valid-test-game'))).toHaveLength(1);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('rolls back the whole game when a duplicate mode id fails mid-seed (no version recorded)', async () => {
    const root = tempGamesDir();
    try {
      writeGame(root, 'rollback-test-game', validGame('rollback-test-game'), [
        { id: 'dup-mode', name: 'Mode One', description: 'First mode' },
        { id: 'dup-mode', name: 'Mode Two', description: 'Duplicate ID' },
      ]);
      const db = getPgTestDb();
      await expect(seedDatabase(db, { gamesDir: root })).rejects.toThrow();
      expect(await db.select().from(gameModes).where(eq(gameModes.game_id, 'rollback-test-game'))).toHaveLength(0);
      expect(await db.select().from(dataVersions).where(eq(dataVersions.game_id, 'rollback-test-game'))).toHaveLength(0);
      expect(await db.select().from(games).where(eq(games.id, 'rollback-test-game'))).toHaveLength(0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
