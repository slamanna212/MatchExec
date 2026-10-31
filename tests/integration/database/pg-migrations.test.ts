// @vitest-environment node
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
    expect(by.public).toBe(61); // 59 domain-ish tables + system_status + blobs + __drizzle_migrations (see pg-schema test for exact list)
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
