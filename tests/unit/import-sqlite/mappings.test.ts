/**
 * The importer is permanent code (plan D3). These tests fail when the Drizzle schema, the legacy migrations or the
 * mappings drift apart, which is the signal to update lib/import-sqlite/mappings.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../../../lib/db/schema';
import { IGNORED_LEGACY_TABLES, MAPPINGS } from '../../../lib/import-sqlite/mappings';
import { buildTableInfo, orderByDependencies } from '../../../lib/import-sqlite/plan';
import { legacyColumnNames, legacyTableNames } from '../../../lib/import-sqlite/legacy-db';

function fullLegacyDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  const dir = path.join(process.cwd(), 'migrations', 'legacy-sqlite');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  return db;
}

const NOT_IMPORTED_PG_TABLES = ['system_status', 'blobs', 'maintenance', 'workers'];
const pgTables = (Object.values(schema) as unknown[]).filter((t) => t instanceof PgTable).map((t) => getTableConfig(t as PgTable).name);

describe('importer mappings', () => {
  it('has exactly one mapping per Postgres table that existed in SQLite (58)', () => {
    const mapped = MAPPINGS.map((m) => getTableConfig(m.table).name).sort();
    expect(new Set(mapped).size).toBe(mapped.length);
    expect(mapped).toHaveLength(58);
    expect(mapped).toEqual(pgTables.filter((t) => !NOT_IMPORTED_PG_TABLES.includes(t)).sort());
  });

  it('accounts for every table of the fully migrated legacy schema', () => {
    const db = fullLegacyDb();
    const legacy = legacyTableNames(db);
    const sources = MAPPINGS.map((m) => m.source);
    expect(legacy.filter((t) => !sources.includes(t) && !IGNORED_LEGACY_TABLES.includes(t))).toEqual([]);
    expect(sources.filter((t) => !legacy.includes(t))).toEqual([]);
    expect(legacy).toHaveLength(59); // 58 domain tables + SQLite-only `migrations`
  });

  it('reads or deliberately drops every column of every legacy table', () => {
    const db = fullLegacyDb();
    const unaccounted: string[] = [];
    for (const m of MAPPINGS) {
      const read = new Set<string>(m.dropped);
      for (const [key, plan] of Object.entries(m.columns)) {
        if (typeof plan === 'object' && 'from' in plan) read.add(plan.from);
        else if (plan !== 'default') read.add(key); // same / derive / value read the legacy column of the same name
      }
      for (const col of legacyColumnNames(db, m.source)) {
        if (!read.has(col)) unaccounted.push(`${m.source}.${col}`);
      }
    }
    expect(unaccounted).toEqual([]);
  });

  it('only lists columns that exist in the legacy schema as dropped / renamed sources', () => {
    const db = fullLegacyDb();
    for (const m of MAPPINGS) {
      const cols = new Set(legacyColumnNames(db, m.source));
      for (const d of m.dropped) expect(cols.has(d), `${m.source}.${d}`).toBe(true);
      for (const plan of Object.values(m.columns)) if (typeof plan === 'object' && 'from' in plan) expect(cols.has(plan.from), `${m.source}.${plan.from}`).toBe(true);
    }
  });

  it('maps every column of its Drizzle table (the type-level guarantee also holds at runtime)', () => {
    for (const m of MAPPINGS) {
      const info = buildTableInfo(m);
      expect(Object.keys(m.columns).sort(), info.name).toEqual(info.columns.map((c) => c.key).sort());
    }
  });

  it('imports in foreign key order without cycles', () => {
    const order = orderByDependencies(MAPPINGS.map(buildTableInfo));
    const position = new Map(order.map((t, i) => [t.name, i]));
    for (const t of order) for (const fk of t.fks) {
      if (fk.parentTable !== t.name && position.has(fk.parentTable)) expect(position.get(fk.parentTable)!, `${t.name} -> ${fk.parentTable}`).toBeLessThan(position.get(t.name)!);
    }
  });

  it('documents orphan rules only for real foreign keys', () => {
    for (const m of MAPPINGS) {
      const info = buildTableInfo(m);
      const keys = new Set(info.fks.map((f) => f.localKeys.join(',')));
      for (const key of Object.keys(m.orphans)) expect(keys.has(key), `${info.name} orphans.${key}`).toBe(true);
    }
  });
});
