/**
 * TRANSITIONAL bridge for test files that still run on the legacy SQLite harness (matches,
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
import { AsyncLocalStorage } from 'node:async_hooks';
import { getTableColumns, getTableName, sql, type Table } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { resetDb, schema, setDbForTesting, type Db } from '../../lib/db';
import { applyMigrationsPglite } from '../../lib/db/migrate';
import {
  autoVoiceChannels, discordChannels, discordMatchMessages, discordSettings, discordWinnerVoteMessages, gameMaps, gameModes, games,
  gameStatDefinitions, matchGamePlacements, matchGames, matchParticipants, matchTeams, matchVoiceAlternation, matches,
  scorecardSubmissions, statsSettings,
} from '../../lib/db/schema';
import { getLegacyWriteCount, getTestDb, setLegacyReadHook } from './test-db';
import { QUEUE_TABLES } from '../../src/lib/queues/registry';

// Mirrored in both directions: the SQLite file is the source for legacy suites that seed it, but the matches domain now
// runs on Postgres, so what it writes is copied back into SQLite before a legacy read that mentions the table.
// FK order doesn't matter (the PGlite session runs with session_replication_role = replica).
const MATCH_TABLES: Table[] = [
  matches, matchTeams, matchParticipants, matchGames, matchGamePlacements, matchVoiceAlternation, autoVoiceChannels,
  discordMatchMessages, discordWinnerVoteMessages,
  // FK cascades from matches reach these, so the matches domain can change them too
  scorecardSubmissions,
];
// Forward-only: still owned by SQLite until their domain is ported (stats).
const FORWARD_ONLY_TABLES: Table[] = [
  statsSettings,
];
const MIRRORED_TABLES: Table[] = [
  games, gameModes, gameMaps, gameStatDefinitions, discordSettings, discordChannels, ...FORWARD_ONLY_TABLES, ...MATCH_TABLES,
];

type PgliteClient = {
  query: (...args: any[]) => Promise<any>;
  transaction: (...args: any[]) => Promise<any>;
  exec: (...args: any[]) => Promise<any>;
  close: () => Promise<void>;
};

// Every bridge operation (a Postgres query, or the mirror that runs before a legacy read) runs exclusively, so parallel
// requests in a legacy test can never observe a half-finished mirror. Calls made from inside an operation (the mirror's
// own SQLite reads trigger the read hook again) are recognised through AsyncLocalStorage and run directly.
const inBridge = new AsyncLocalStorage<true>();
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (inBridge.getStore()) return fn();
  const run = chain.then(() => inBridge.run(true, fn));
  chain = run.catch(() => undefined);
  return run;
}

// Queue tables live in Postgres now: rows the code under test enqueued are copied back into the file's SQLite
// database (under their legacy column names) right before a legacy assertion reads them with `getTestDb()`.
const QUEUE_RENAMES: Record<string, string> = { attempts: 'retry_count', last_error: 'error_message' };
const mirroredQueueIds = new Map<string, Set<string>>();

let real: PgliteClient | null = null;
let ready: Promise<PgliteClient> | null = null;
let lastSignature = '';
let lastWriteCount = -1;
let pgDirty = false;

function convert(value: unknown, dataType: string): unknown {
  if (value === null || value === undefined) return value;
  switch (dataType) {
    case 'boolean': return Boolean(value);
    case 'date': {
      if (typeof value !== 'string') return value;
      // Legacy fixtures are sloppy ('18:00', date-only, 'YYYY-MM-DD HH:MM:SS'): never let one bad value fail the whole mirror.
      const parsed = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}${value.includes('T') || value.includes(' ') ? 'Z' : 'T00:00:00Z'}`);
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }
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

/** Mirror the SQLite-seeded tables into PGlite when they changed since the last mirror (after merging Postgres-side changes back). */
async function syncFromSqlite(client: PgliteClient): Promise<void> {
  let sqlite;
  try { sqlite = getTestDb(); } catch { return; }
  await pushPgChangesToSqlite(); // keep what the matches domain wrote since the last sync
  if (lastWriteCount === getLegacyWriteCount() && lastSignature !== '') return; // nothing was written to SQLite since
  {
    lastWriteCount = getLegacyWriteCount();
    const snapshot: Array<{ table: Table; rows: Array<Record<string, unknown>> }> = [];
    for (const table of MIRRORED_TABLES) {
      let rows: Array<Record<string, unknown>> = [];
      try { rows = await sqlite.all<Record<string, unknown>>(`SELECT * FROM ${getTableName(table)}`); } catch { /* table missing */ }
      snapshot.push({ table, rows });
    }
    const signature = JSON.stringify(snapshot.map((s) => s.rows));
    if (signature === lastSignature) return;

    const pg = drizzle(client as never, { schema }) as unknown as Db;
    // DELETE (not TRUNCATE ... CASCADE): with FK triggers off nothing cascades into the queue tables, which Postgres owns.
    for (const t of MIRRORED_TABLES) await pg.execute(sql.raw(`DELETE FROM "${getTableName(t)}"`));
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
    const pgSnapshot = await pgMatchSnapshot();
    pgBase = toBase(pgSnapshot);
    lastPgMatchSignature = JSON.stringify(pgSnapshot.map((x) => x.rows));
    pgDirty = false;
  }
}

/** Lazy PGlite "client" handed to drizzle: creates/mirrors on demand, then delegates. */
const MUTATING = /^\s*(insert|update|delete|truncate|with|merge)\b/i;
const lazyClient = {
  query: (...args: any[]) => exclusive(async () => {
    const client = await ensureReal();
    await syncFromSqlite(client);
    const text = typeof args[0] === 'string' ? args[0] : String(args[0]?.text ?? '');
    if (MUTATING.test(text)) pgDirty = true;
    return client.query(...args);
  }),
  transaction: (...args: any[]) => exclusive(async () => {
    const client = await ensureReal();
    await syncFromSqlite(client);
    pgDirty = true;
    return client.transaction(...args);
  }),
  exec: (...args: any[]) => exclusive(async () => (await ensureReal()).exec(...args)),
};

function toSqliteValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** Copy the Postgres rows of every queue table mentioned in `sqlText` into the SQLite test database. */
async function mirrorQueuesToSqlite(sqlText: string): Promise<void> {
  if (!real || inBridge.getStore()) return; // the mirror's own PRAGMA / SELECT reads go through the hook too
  await exclusive(async () => {
    await mirrorMatchesToSqlite(sqlText);
    await mirrorQueuesToSqliteInner(sqlText);
  });
}

async function mirrorQueuesToSqliteInner(sqlText: string): Promise<void> {
  if (!real) return; // nothing was ever written to Postgres in this file
  const text = sqlText.toLowerCase();
  const sqlite = getTestDb();
  for (const table of Object.values(QUEUE_TABLES)) {
    const name = getTableName(table);
    if (!text.includes(name)) continue;
    const { rows } = await real.query(`SELECT * FROM "${name}"`);
    const mirrored = mirroredQueueIds.get(name) ?? new Set<string>();
    for (const id of mirrored) await sqlite.run(`DELETE FROM ${name} WHERE id = ?`, [id]);
    mirrored.clear();
    if (rows.length === 0) { mirroredQueueIds.set(name, mirrored); continue; }
    const sqliteCols = new Set((await sqlite.all<{ name: string }>(`PRAGMA table_info(${name})`)).map((c) => c.name));
    for (const row of rows as Array<Record<string, unknown>>) {
      const entries = Object.entries(row)
        .map(([k, v]) => [QUEUE_RENAMES[k] ?? k, v] as const)
        .filter(([k]) => sqliteCols.has(k));
      await sqlite.run(
        `INSERT OR REPLACE INTO ${name} (${entries.map(([k]) => k).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`,
        entries.map(([, v]) => toSqliteValue(v)),
      );
      mirrored.add(String(row.id));
    }
    mirroredQueueIds.set(name, mirrored);
  }
}

let lastPgMatchSignature = '';
/** table -> primary key -> serialised row, as of the last time SQLite and Postgres agreed on the matches-domain tables. */
let pgBase: Map<string, Map<string, string>> | null = null;

const rowKey = (row: Record<string, unknown>): string => String(row.id ?? row.match_id);

async function pgMatchSnapshot(): Promise<Array<{ table: Table; rows: Array<Record<string, unknown>> }>> {
  const out: Array<{ table: Table; rows: Array<Record<string, unknown>> }> = [];
  for (const table of MATCH_TABLES) {
    const { rows } = await real!.query(`SELECT * FROM "${getTableName(table)}" ORDER BY 1`);
    out.push({ table, rows: rows as Array<Record<string, unknown>> });
  }
  return out;
}

function toBase(snapshot: Array<{ table: Table; rows: Array<Record<string, unknown>> }>): Map<string, Map<string, string>> {
  return new Map(snapshot.map(({ table, rows }) => [getTableName(table), new Map(rows.map((r) => [rowKey(r), JSON.stringify(r)]))]));
}

/**
 * Three-way merge of what the matches domain (Postgres) changed since the last sync into the SQLite database: rows that
 * are new or different in Postgres are upserted, rows Postgres deleted (cascades included) are deleted. Rows legacy
 * tests inserted into SQLite meanwhile are left alone, so neither side's writes are lost.
 */
async function pushPgChangesToSqlite(): Promise<void> {
  if (!real || !pgBase || !pgDirty) return;
  await pushPgChangesToSqliteInner();
}

async function pushPgChangesToSqliteInner(): Promise<void> {
  pgDirty = false;
  const snapshot = await pgMatchSnapshot();
  const signature = JSON.stringify(snapshot.map((s) => s.rows));
  if (signature === lastPgMatchSignature) return;
  const sqlite = getTestDb();
  for (const { table, rows } of snapshot) {
    const name = getTableName(table);
    const base = pgBase?.get(name) ?? new Map<string, string>();
    const current = new Set(rows.map(rowKey));
    const keyCol = table === matchVoiceAlternation ? 'match_id' : 'id';
    for (const key of base.keys()) if (!current.has(key)) await sqlite.run(`DELETE FROM ${name} WHERE ${keyCol} = ?`, [key]);
    const changed = rows.filter((r) => base.get(rowKey(r)) !== JSON.stringify(r));
    if (changed.length === 0) continue;
    const sqliteCols = new Set((await sqlite.all<{ name: string }>(`PRAGMA table_info(${name})`)).map((c) => c.name));
    for (const row of changed) {
      const entries = Object.entries(row).filter(([k]) => sqliteCols.has(k));
      await sqlite.run(
        `INSERT OR REPLACE INTO ${name} (${entries.map(([k]) => k).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`,
        entries.map(([, v]) => toSqliteValue(v)),
      );
    }
  }
  // The PGlite session runs with FK triggers off, so a match deleted through the API doesn't cascade there; do the
  // cascade the real schema has on the SQLite side.
  const matchBase = pgBase?.get('matches') ?? new Map<string, string>();
  const nowMatches = new Set(snapshot.find((x) => getTableName(x.table) === 'matches')?.rows.map(rowKey));
  for (const id of matchBase.keys()) {
    if (nowMatches.has(id)) continue;
    await sqlite.run('DELETE FROM match_game_placements WHERE match_game_id IN (SELECT id FROM match_games WHERE match_id = ?)', [id]);
    for (const child of ['match_games', 'match_participants', 'match_teams', 'scorecard_submissions', 'match_voice_alternation']) {
      await sqlite.run(`DELETE FROM ${child} WHERE match_id = ?`, [id]);
    }
  }
  pgBase = toBase(snapshot);
  lastPgMatchSignature = signature;
  lastSignature = ''; // the SQLite side changed: re-evaluate before the next forward mirror
  lastWriteCount = -1;
}

/** Before a legacy read that mentions a matches-domain table, bring Postgres-side changes into SQLite. */
async function mirrorMatchesToSqlite(sqlText: string): Promise<void> {
  const text = sqlText.toLowerCase();
  if (!MATCH_TABLES.some((t) => text.includes(getTableName(t)))) return;
  await pushPgChangesToSqlite();
}

/** Per-test reset: forget the Postgres queue rows (the SQLite database is reset separately). */
export async function resetLegacyQueueRows(): Promise<void> {
  mirroredQueueIds.clear();
  if (!real) return;
  await chain;
  const names = [...Object.values(QUEUE_TABLES), ...MATCH_TABLES].map((t) => `"${getTableName(t)}"`).join(', ');
  await real.exec(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
  // The SQLite database is wiped between tests: forget what was mirrored so nothing stale flows back into it.
  lastPgMatchSignature = '';
  pgBase = null;
  pgDirty = false;
  lastWriteCount = -1;
  lastSignature = '';
}

export function installLegacyPgBridge(): void {
  real = null;
  ready = null;
  lastSignature = '';
  lastPgMatchSignature = '';
  pgBase = null;
  pgDirty = false;
  lastWriteCount = -1;
  mirroredQueueIds.clear();
  setLegacyReadHook(mirrorQueuesToSqlite);
  setDbForTesting(drizzle(lazyClient as never, { schema }) as unknown as Db);
}

export async function teardownLegacyPgBridge(): Promise<void> {
  setLegacyReadHook(null);
  const client = real;
  real = null;
  ready = null;
  lastSignature = '';
  await resetDb();
  if (client) await client.close();
}
