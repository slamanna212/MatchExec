// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getPgTestDb, isRealPostgres, setupPgTestFile } from '../../utils/pg-test-db';
import { getExpectedLatestMigration, MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from '../../../lib/db/migrate';

setupPgTestFile();

const rows = async <T>(q: ReturnType<typeof sql>): Promise<T[]> =>
  ((await getPgTestDb().execute(q)) as unknown as { rows: T[] }).rows;

describe('Drizzle migrations (PGlite or TEST_DATABASE_URL)', () => {
  it(`applied the baseline (${isRealPostgres() ? 'real Postgres' : 'PGlite'})`, async () => {
    const applied = await rows<{ hash: string }>(sql.raw(`SELECT hash FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ORDER BY created_at`));
    const expected = getExpectedLatestMigration();
    expect(applied).toHaveLength(expected.count);
    expect(applied[applied.length - 1].hash).toBe(expected.hash);
  });

  it('creates the control schema and public tables', async () => {
    const t = await rows<{ s: string; n: number }>(sql`SELECT table_schema AS s, count(*)::int AS n FROM information_schema.tables WHERE table_schema IN ('public','control') AND table_type = 'BASE TABLE' GROUP BY table_schema`);
    const by = Object.fromEntries(t.map((r) => [r.s, r.n]));
    expect(by.control).toBe(2);
    expect(by.public).toBe(62); // 60 domain-ish tables + system_status + blobs + __drizzle_migrations (see pg-schema test for exact list)
  });

  it('is idempotent: re-running the migrator is a no-op', async () => {
    const { applyMigrationsPglite } = await import('../../../lib/db/migrate');
    if (!isRealPostgres()) {
      await applyMigrationsPglite(getPgTestDb());
    } else {
      const { migrate } = await import('drizzle-orm/node-postgres/migrator');
      const { resolveMigrationsFolder } = await import('../../../lib/db/migrate');
      await migrate(getPgTestDb() as never, { migrationsFolder: resolveMigrationsFolder(), migrationsTable: MIGRATIONS_TABLE, migrationsSchema: MIGRATIONS_SCHEMA });
    }
    const n = await rows<{ n: number }>(sql.raw(`SELECT count(*)::int AS n FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`));
    expect(n[0].n).toBe(getExpectedLatestMigration().count);
  });
});


it('upgrades duplicate tracking and restores legacy deletion ownership before RPC purging', async () => {
  const client = new PGlite();
  try {
    await client.exec(await readFile('drizzle/0000_baseline.sql', 'utf8'));
    await client.exec(`INSERT INTO auto_voice_channels (id, match_id, channel_id, team_name) VALUES
      ('a', 'gone', 'duplicate', 'blue'), ('b', 'gone', 'duplicate', 'blue');
      INSERT INTO discord_bot_requests (id, type, data, status) VALUES
      ('legacy', 'voice_channel_delete', '{"matchId":"gone","channelId":"forgotten"}', 'completed');`);
    await client.exec(await readFile('drizzle/0001_durable_voice_cleanup.sql', 'utf8'));
    await client.exec(await readFile('drizzle/0002_voice_cleanup_schedule.sql', 'utf8'));
    const result = await client.query<{ channel_id: string }>('SELECT channel_id FROM auto_voice_channels ORDER BY channel_id');
    expect(result.rows.map((r) => r.channel_id)).toEqual(['duplicate', 'forgotten']);
    await expect(client.exec("INSERT INTO auto_voice_channels (id, match_id, channel_id, team_name) VALUES ('c', 'gone', 'duplicate', 'blue')")).rejects.toThrow();
  } finally { await client.close(); }
});
