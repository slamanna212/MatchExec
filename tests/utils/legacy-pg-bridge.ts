/**
 * TRANSITIONAL bridge for test files that still run on the legacy SQLite harness (matches, tournaments, series,
 * scoring, bot and stats-processor suites) while the game reference data (games / game_modes / game_maps /
 * game_stat_definitions), discord_settings and discord_channels are already read through Postgres (`src/lib/games.ts`).
 *
 * `tests/setup.ts` installs it for every legacy-harness file. It injects a LAZY PGlite-backed Drizzle instance into
 * `lib/db`: nothing is created until code under test issues its first Postgres query (then the baseline migration
 * runs, ~2s). Before every Postgres query those tables are mirrored from the file's SQLite test database
 * (whatever the test inserted with `INSERT INTO games ...` or the legacy fixtures), so existing tests keep seeding
 * game data the way they always did.
 *
 * Delete this file (and its use in tests/setup.ts) when the last SQLite-harness suite is gone (end of Stage 2).
 */
import { getTableColumns, getTableName, sql, type Table } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { resetDb, schema, setDbForTesting, type Db } from '../../lib/db';
import { applyMigrationsPglite } from '../../lib/db/migrate';
import { discordChannels, discordSettings, gameMaps, gameModes, games, gameStatDefinitions } from '../../lib/db/schema';
import { getTestDb } from './test-db';

// Insert order respects the FKs (modes before maps).
const MIRRORED_TABLES: Table[] = [games, gameModes, gameMaps, gameStatDefinitions, discordSettings, discordChannels];

type PgliteClient = {
  query: (...args: any[]) => Promise<any>;
  transaction: (...args: any[]) => Promise<any>;
  exec: (...args: any[]) => Promise<any>;
  close: () => Promise<void>;
};

let real: PgliteClient | null = null;
let ready: Promise<PgliteClient> | null = null;
let lastSignature = '';
let syncing = false;

function convert(value: unknown, dataType: string): unknown {
  if (value === null || value === undefined) return value;
  switch (dataType) {
    case 'boolean': return Boolean(value);
    case 'date': return typeof value === 'string' ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`) : value;
    case 'json': return typeof value === 'string' ? JSON.parse(value) : value;
    default: return value;
  }
}

async function ensureReal(): Promise<PgliteClient> {
  ready ??= (async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const client = new PGlite() as unknown as PgliteClient;
    await applyMigrationsPglite(drizzle(client as never, { schema }) as unknown as Db);
    await client.exec('SET session_replication_role = replica'); // legacy fixtures are not FK-clean
    real = client;
    return client;
  })();
  return ready;
}

/** Mirror the SQLite game / discord settings / channel tables into PGlite when they changed since the last mirror. */
async function syncFromSqlite(client: PgliteClient): Promise<void> {
  if (syncing) return;
  let sqlite;
  try { sqlite = getTestDb(); } catch { return; }
  syncing = true;
  try {
    const snapshot: Array<{ table: Table; rows: Array<Record<string, unknown>> }> = [];
    for (const table of MIRRORED_TABLES) {
      let rows: Array<Record<string, unknown>> = [];
      try { rows = await sqlite.all<Record<string, unknown>>(`SELECT * FROM ${getTableName(table)}`); } catch { /* table missing */ }
      snapshot.push({ table, rows });
    }
    const signature = JSON.stringify(snapshot.map((s) => s.rows));
    if (signature === lastSignature) return;

    const pg = drizzle(client as never, { schema }) as unknown as Db;
    await pg.execute(sql.raw(`TRUNCATE ${MIRRORED_TABLES.map((t) => `"${getTableName(t)}"`).join(', ')} RESTART IDENTITY CASCADE`));
    for (const { table, rows } of snapshot) {
      if (rows.length === 0) continue;
      const columns = getTableColumns(table) as Record<string, { name: string; dataType: string }>;
      const values = rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const [key, col] of Object.entries(columns)) {
          const raw = row[col.name];
          if (raw === null || raw === undefined) continue; // let column defaults apply
          out[key] = convert(raw, col.dataType);
        }
        return out;
      });
      await pg.insert(table as never).values(values as never);
    }
    lastSignature = signature;
  } finally {
    syncing = false;
  }
}

/** Lazy PGlite "client" handed to drizzle: creates/mirrors on demand, then delegates. */
const lazyClient = {
  async query(...args: any[]) {
    const client = await ensureReal();
    await syncFromSqlite(client);
    return client.query(...args);
  },
  async transaction(...args: any[]) {
    const client = await ensureReal();
    await syncFromSqlite(client);
    return client.transaction(...args);
  },
  async exec(...args: any[]) {
    return (await ensureReal()).exec(...args);
  },
};

export function installLegacyPgBridge(): void {
  real = null;
  ready = null;
  lastSignature = '';
  setDbForTesting(drizzle(lazyClient as never, { schema }) as unknown as Db);
}

export async function teardownLegacyPgBridge(): Promise<void> {
  const client = real;
  real = null;
  ready = null;
  lastSignature = '';
  await resetDb();
  if (client) await client.close();
}
