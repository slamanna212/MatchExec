// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { appSettings, dataVersions, gameMaps, gameModes, games, voices } from '../../../lib/db/schema';
import { seedDatabase } from '../../../lib/db/seed';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';

setupPgTestFile({ seed: true });

const gamesDir = path.join(process.cwd(), 'data', 'games');
const gameDirs = fs.readdirSync(gamesDir).filter((d) => fs.statSync(path.join(gamesDir, d)).isDirectory());

describe('Drizzle seeder', () => {
  it('seeds every game directory (10)', async () => {
    const rows = await getPgTestDb().select({ id: games.id }).from(games);
    expect(gameDirs).toHaveLength(10);
    expect(rows.map((r) => r.id).sort()).toEqual(gameDirs.map((d) => JSON.parse(fs.readFileSync(path.join(gamesDir, d, 'game.json'), 'utf8')).id).sort());
  });

  it('seeds modes, maps, voices, data versions and default settings', async () => {
    const db = getPgTestDb();
    for (const t of [gameModes, gameMaps, voices, dataVersions]) {
      const [{ n }] = await db.select({ n: count() }).from(t);
      expect(n).toBeGreaterThan(0);
    }
    const [flow] = await db.select().from(appSettings).where(eq(appSettings.setting_key, 'welcome_flow_completed'));
    expect(flow.setting_value).toBe('false');
  });

  it('keeps seeded reference data across the per-test reset', async () => {
    const [{ n }] = await getPgTestDb().select({ n: count() }).from(games);
    expect(n).toBe(10);
  });

  it('is idempotent (re-seeding changes nothing)', async () => {
    const db = getPgTestDb();
    const before = await db.select({ n: count() }).from(gameMaps);
    await seedDatabase(db);
    const after = await db.select({ n: count() }).from(gameMaps);
    expect(after[0].n).toBe(before[0].n);
    expect((await db.select({ n: count() }).from(games))[0].n).toBe(10);
  });
});
