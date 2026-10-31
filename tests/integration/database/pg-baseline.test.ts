// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { count, eq, getTableName, sql } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../../../lib/db/schema';
import { getDb, resetDb, setDbForTesting, db as lazyDb, resolveDatabaseUrl, resolvePoolMax, type Db } from '../../../lib/db';
import { applyMigrationsPglite, getExpectedLatestMigration, MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from '../../../lib/db/migrate';
import { seedDatabase } from '../../../lib/db/seed';
import { getSystemStatus, isSystemReady, markSystemReady, setSystemStatus } from '../../../lib/db/system-status';

describe('Postgres baseline (PGlite)', () => {
  let client: PGlite;
  let db: Db;
  const gameDirs = fs.readdirSync(path.join(process.cwd(), 'data', 'games'))
    .filter((d) => fs.statSync(path.join(process.cwd(), 'data', 'games', d)).isDirectory());

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema }) as unknown as Db;
    await applyMigrationsPglite(db);
    setDbForTesting(db);
  }, 60000);

  afterAll(async () => {
    await resetDb();
    await client.close();
  });

  it('creates every table declared in the Drizzle schema', async () => {
    const declared = (Object.values(schema) as unknown[]).filter((v): v is PgTable => v instanceof PgTable);
    expect(declared.length).toBe(62);
    const res = await client.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('public','control')`,
    );
    const present = new Set(res.rows.map((r) => `${r.table_schema}.${r.table_name}`));
    for (const t of declared) {
      const cfg = getTableConfig(t);
      expect(present, getTableName(t)).toContain(`${cfg.schema ?? 'public'}.${cfg.name}`);
    }
  });

  it('keeps the migrations table in public and records the latest hash', async () => {
    const r = await client.query<{ hash: string }>(`SELECT hash FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`);
    expect(r.rows[0].hash).toBe(getExpectedLatestMigration().hash);
  });

  it('does not contain the retired legacy columns', async () => {
    const r = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'
       AND ((table_name = 'matches' AND column_name IN ('blue_team_voice_channel','red_team_voice_channel'))
         OR (table_name = 'match_games' AND column_name IN ('winner_id','participant_winner_id','team_a','team_b','is_ffa_mode','score_a','score_b','position_results','points_awarded'))
         OR (table_name = 'match_participants' AND column_name IN ('team','team_assignment')))`,
    );
    expect(r.rows).toEqual([]);
  });

  it('seeds every game, defaults and voices, and is idempotent', async () => {
    const seeded = await seedDatabase(db);
    expect(seeded).toBe(gameDirs.length);
    const [{ n }] = await db.select({ n: count() }).from(schema.games);
    expect(n).toBe(gameDirs.length);
    const [{ v }] = await db.select({ v: count() }).from(schema.dataVersions);
    expect(v).toBe(gameDirs.length);
    expect((await db.select({ n: count() }).from(schema.gameModes))[0].n).toBeGreaterThan(10);
    expect((await db.select({ n: count() }).from(schema.gameMaps))[0].n).toBeGreaterThan(50);
    expect((await db.select({ n: count() }).from(schema.voices))[0].n).toBeGreaterThan(0);
    const logLevel = await db.select().from(schema.appSettings).where(eq(schema.appSettings.setting_key, 'log_level'));
    expect(logLevel[0].setting_value).toBe('warning');
    expect((await db.select().from(schema.statsSettings)).length).toBe(1);

    // Racing modes keep jsonb setup_components as a real array.
    const mk8 = await db.select().from(schema.gameModes).where(eq(schema.gameModes.game_id, 'mariokart8deluxe'));
    expect(mk8.some((m) => Array.isArray(m.setup_components))).toBe(true);

    expect(await seedDatabase(db)).toBe(0); // dataVersion unchanged -> nothing reseeded
  }, 60000);

  it('FK cascade removes match children', async () => {
    await db.insert(schema.matches).values({ id: 'm1', game_id: (await db.select().from(schema.games).limit(1))[0].id, name: 'T', start_date: new Date(), start_time: new Date() });
    await db.insert(schema.matchTeams).values({ id: 't1', match_id: 'm1', team_name: 'Blue', team_order: 0 });
    await db.insert(schema.matchGames).values({ id: 'g1', match_id: 'm1' });
    await db.insert(schema.matchGamePlacements).values({ id: 'p1', match_game_id: 'g1', entity_type: 'team', entity_id: 't1' });
    await db.insert(schema.discordReminderQueue).values({ id: 'r1', match_id: 'm1', reminder_type: 'x', minutes_before: 5, scheduled_for: new Date() });
    await db.delete(schema.matches).where(eq(schema.matches.id, 'm1'));
    for (const t of [schema.matchTeams, schema.matchGames, schema.matchGamePlacements, schema.discordReminderQueue]) {
      expect((await db.select({ n: count() }).from(t))[0].n).toBe(0);
    }
  });

  it('keeps Discord cleanup rows when a match is deleted (no FK by design)', async () => {
    await db.insert(schema.discordDeletionQueue).values({ id: 'd1', match_id: 'gone' });
    expect((await db.select({ n: count() }).from(schema.discordDeletionQueue))[0].n).toBe(1);
  });

  it('system_status is a single upserted row', async () => {
    expect(await getSystemStatus(db)).toBeNull();
    await setSystemStatus({ phase: 'migrating', message: 'm', progress: 10 }, db);
    await setSystemStatus({ phase: 'importing', message: 'n', progress: 20, importedFromSqlite: true, report: { repaired: 1 } }, db);
    const s = await getSystemStatus(db);
    expect(s).toMatchObject({ phase: 'importing', progress: 20, imported_from_sqlite: true, report: { repaired: 1 } });
    expect(await isSystemReady(db)).toBe(false);
    await markSystemReady('ok', db);
    expect(await isSystemReady(db)).toBe(true);
    const all = (await db.execute(sql`SELECT count(*)::int AS n FROM system_status`)) as unknown as { rows: Array<{ n: number }> };
    expect(all.rows[0].n).toBe(1);
  });

  it('db module: lazy handle resolves to the injected instance', async () => {
    expect(getDb()).toBe(db);
    const rows = await lazyDb.select({ n: count() }).from(schema.games);
    expect(rows[0].n).toBe(gameDirs.length);
  });
});

describe('lib/db connection config', () => {
  it('requires DATABASE_URL outside development and defaults it in development', () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    expect(resolveDatabaseUrl({ NODE_ENV: 'development' })).toBe('postgres://matchexec:matchexec@127.0.0.1:5432/matchexec');
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgresql:///matchexec?host=/run/postgresql' })).toBe('postgresql:///matchexec?host=/run/postgresql');
  });
  it('reads PG_POOL_MAX with a default of 10', () => {
    expect(resolvePoolMax({})).toBe(10);
    expect(resolvePoolMax({ PG_POOL_MAX: '3' })).toBe(3);
    expect(resolvePoolMax({ PG_POOL_MAX: 'abc' })).toBe(10);
  });
});
