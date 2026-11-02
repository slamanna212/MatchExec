/**
 * Preflight + conversion (plan 5.3 steps 3-4). Reads every legacy table, converts each row to its Postgres shape in memory
 * and checks it against the target schema (foreign keys, unique keys, enums, NOT NULL, relationships Postgres cannot
 * check) BEFORE anything is written. The result is the exact set of rows that will be inserted, so the preflight report
 * and the real import cannot disagree.
 *
 * Findings:
 *  - known repair rules (documented in mappings.ts / KNOWN_RULES) are applied silently-but-reported;
 *  - anything else is an Issue and aborts the import, unless lossy mode is on, in which case the Issue is turned into a
 *    reported Repair (orphan rows skipped, invalid JSON / values nulled, unusable rows skipped).
 */
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig, type PgColumn } from 'drizzle-orm/pg-core';
import type { DatabaseSync } from 'node:sqlite';
import { CoerceIssue, coerceValue, defaultFor, isEmptyLegacy } from './coerce';
import { legacyColumnNames, readAll } from './legacy-db';
import type { ColumnPlan, ImportHints, RowCtx, SrcRow, TableMapping } from './mapping';
import type { Issue, IssueKind, Repair } from './types';

/**
 * Known repair rule (found on real v0.7 databases): the old app ran with foreign keys OFF and its delete routes did not
 * clean every child table, so rows of deleted matches / match games / tournaments / series are left behind (declared
 * ON DELETE CASCADE, i.e. they were meant to go with the parent). Orphans of a CASCADE foreign key to one of these parents
 * are dropped, and so is everything below a dropped row. Orphans of any other foreign key are preflight issues.
 */
export const CASCADE_LEFTOVER_PARENTS = ['matches', 'match_games', 'tournaments', 'series'] as const;

export interface FkInfo {
  localKeys: string[];
  localNullable: boolean[];
  parentTable: string;
  parentKeys: string[];
  onDelete: string | undefined;
}

export interface TableInfo {
  mapping: TableMapping;
  name: string;
  columns: Array<{ key: string; col: PgColumn }>;
  pk: string[];
  fks: FkInfo[];
  uniques: string[][];
}

export interface PlannedTable {
  info: TableInfo;
  rows: Array<Record<string, unknown>>;
  sourceCount: number;
  skipped: number;
}

export interface ImportPlan {
  tables: PlannedTable[];
  issues: Issue[];
  repairs: Repair[];
  /** Explicit NULLs replaced by column defaults, per table.column (informational, not a repair). */
  coalesced: Record<string, number>;
  /** Legacy columns found in the database that no mapping reads (informational). */
  unmappedLegacyColumns: Record<string, string[]>;
}

const sep = '\u0000';
const tupleKey = (values: unknown[]): string => values.map((v) => (v instanceof Date ? v.toISOString() : String(v))).join(sep);

export function buildTableInfo(mapping: TableMapping): TableInfo {
  const cfg = getTableConfig(mapping.table);
  const cols = getTableColumns(mapping.table);
  const keyByName = new Map<string, string>();
  for (const [key, col] of Object.entries(cols)) {
    if (key !== col.name) throw new Error(`Importer assumes property key == column name (${cfg.name}.${key} -> ${col.name})`);
    keyByName.set(col.name, key);
  }
  const fks: FkInfo[] = cfg.foreignKeys.map((fk) => {
    const ref = fk.reference();
    return {
      localKeys: ref.columns.map((c) => keyByName.get(c.name)!),
      localNullable: ref.columns.map((c) => !c.notNull),
      parentTable: getTableConfig(ref.foreignTable).name,
      parentKeys: ref.foreignColumns.map((c) => c.name),
      onDelete: fk.onDelete,
    };
  });
  const pkFromConfig = cfg.primaryKeys[0]?.columns.map((c) => c.name);
  const pk = pkFromConfig ?? Object.values(cols).filter((c) => c.primary).map((c) => c.name);
  const uniques: string[][] = [
    ...cfg.uniqueConstraints.map((u) => u.columns.map((c) => c.name)),
    // partial unique indexes only constrain rows where their (IS NOT NULL) predicate holds, which the null-skipping tuple check mirrors
    ...cfg.indexes.filter((i) => i.config.unique).map((i) => i.config.columns.map((c) => (c as PgColumn).name)),
  ];
  return { mapping, name: cfg.name, columns: Object.entries(cols).map(([key, col]) => ({ key, col })), pk, fks, uniques };
}

/** FK dependency order (parents first); throws on cycles so a schema change cannot silently break the import. */
export function orderByDependencies(infos: TableInfo[]): TableInfo[] {
  const byName = new Map(infos.map((i) => [i.name, i]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const out: TableInfo[] = [];
  const visit = (info: TableInfo): void => {
    if (done.has(info.name)) return;
    if (visiting.has(info.name)) throw new Error(`Foreign key cycle through ${info.name}: the importer needs a deferred-constraint strategy`);
    visiting.add(info.name);
    for (const fk of info.fks) {
      const parent = byName.get(fk.parentTable);
      if (parent && parent !== info) visit(parent);
    }
    visiting.delete(info.name);
    done.add(info.name);
    out.push(info);
  };
  [...infos].sort((a, b) => a.name.localeCompare(b.name)).forEach(visit);
  return out;
}

export interface PlanOptions {
  db: DatabaseSync;
  mappings: TableMapping[];
  hints: ImportHints;
  allowLossy: boolean;
  now: Date;
}

export function buildPlan(opts: PlanOptions): ImportPlan {
  const { db, allowLossy, now, hints } = opts;
  const infos = orderByDependencies(opts.mappings.map(buildTableInfo));
  const issues: Issue[] = [];
  const repairs: Repair[] = [];
  const coalesced: Record<string, number> = {};
  const unmappedLegacyColumns: Record<string, string[]> = {};
  const planned = new Map<string, PlannedTable>();
  /** table -> "col,col" -> set of tuple keys (rows kept for insert plus rows blocked by an issue, so one bad parent does not flood the report). */
  const keysets = new Map<string, Map<string, Set<string>>>();
  const blocked = new Map<string, Array<Record<string, unknown>>>();
  /** table -> tuple key -> why the row was dropped; its children are dropped too (known rule: cascade leftovers; lossy: lossy repair). */
  const dropped = new Map<string, Map<string, 'known' | 'lossy'>>();
  const markDropped = (table: string, row: Record<string, unknown>, pk: string[], kind: 'known' | 'lossy'): void => {
    if (pk.length === 0) return;
    let map = dropped.get(table);
    if (!map) dropped.set(table, (map = new Map()));
    map.set(tupleKey(pk.map((k) => row[k])), kind);
  };

  const keysetFor = (table: string, cols: string[]): Set<string> => {
    let byCols = keysets.get(table);
    if (!byCols) keysets.set(table, (byCols = new Map()));
    const id = cols.join(',');
    let set = byCols.get(id);
    if (!set) {
      set = new Set();
      for (const row of [...(planned.get(table)?.rows ?? []), ...(blocked.get(table) ?? [])]) set.add(tupleKey(cols.map((c) => row[c])));
      byCols.set(id, set);
    }
    return set;
  };

  for (const info of infos) {
    const { mapping } = info;
    const legacyCols = legacyColumnNames(db, mapping.source);
    const mappedLegacy = new Set<string>(mapping.dropped);
    // `same` columns are read by key, `from` by the given name; derive()/value() plans are assumed to read the legacy column of the same name
    for (const [key, plan] of Object.entries(mapping.columns)) {
      if (typeof plan === 'object' && 'from' in plan) mappedLegacy.add(plan.from);
      else if (plan !== 'default') mappedLegacy.add(key);
    }
    const unmapped = legacyCols.filter((c) => !mappedLegacy.has(c));
    if (unmapped.length > 0) unmappedLegacyColumns[info.name] = unmapped;

    const sourceRows = readAll(db, mapping.source);
    const table: PlannedTable = { info, rows: [], sourceCount: sourceRows.length, skipped: 0 };
    planned.set(info.name, table);
    blocked.set(info.name, []);
    const seenUnique = info.uniques.map(() => new Set<string>());
    const seenPk = new Set<string>();

    for (const src of sourceRows) {
      const rowId = info.pk.length > 0 ? info.pk.map((k) => String(src[k] ?? '')).join(':') : '';
      const ctx: RowCtx = {
        now, hints, id: rowId,
        repair: (rule, column, action) => void repairs.push({ rule, table: info.name, id: rowId, column, action, known: true }),
      };
      let skip = false;
      let skipKind: 'known' | 'lossy' = 'lossy';
      let isBlocked = false;
      const row: Record<string, unknown> = {};

      const report = (kind: IssueKind, column: string | undefined, detail: string, nullable: boolean): void => {
        if (allowLossy) {
          if (column && nullable) {
            row[column] = null;
            repairs.push({ rule: 'lossy_null_column', table: info.name, id: rowId, column, action: `set to NULL (${kind}: ${detail})`, known: false });
          } else {
            skip = true;
            repairs.push({ rule: 'lossy_skip_row', table: info.name, id: rowId, column, action: `row skipped (${kind}: ${detail})`, known: false });
          }
        } else {
          isBlocked = true;
          issues.push({ kind, table: info.name, id: rowId, column, detail, lossyAction: column && nullable ? `${column} set to NULL` : 'row skipped' });
        }
      };

      // 1. column conversion
      for (const { key, col } of info.columns) {
        const plan: ColumnPlan | undefined = mapping.columns[key];
        if (plan === undefined) throw new Error(`Mapping for ${info.name} has no entry for column ${key}`);
        let raw: SrcRow[string];
        try {
          if (plan === 'same') raw = src[key];
          else if (plan === 'default') raw = undefined;
          else if ('from' in plan) raw = src[plan.from];
          else if ('derive' in plan) raw = plan.derive(src, ctx);
          else {
            const v = plan.value(src, ctx);
            if (v === null || v === undefined) {
              row[key] = null;
              if (col.notNull) throw new CoerceIssue('null_in_required', 'NULL in a NOT NULL column');
            } else row[key] = v;
            continue;
          }
          if (isEmptyLegacy(col, raw)) {
            if (!col.notNull) row[key] = null;
            else {
              const d = defaultFor(col, now);
              if (d === undefined) throw new CoerceIssue('null_in_required', 'NULL in a NOT NULL column without a default');
              row[key] = d;
              if (plan !== 'default') coalesced[`${info.name}.${key}`] = (coalesced[`${info.name}.${key}`] ?? 0) + 1;
            }
          } else {
            row[key] = coerceValue(col, raw as Exclude<SrcRow[string], null | undefined>);
          }
        } catch (e) {
          if (!(e instanceof CoerceIssue)) throw e;
          row[key] = null;
          report(e.kind, key, e.message, !col.notNull);
        }
      }
      if (skip) { table.skipped++; markDropped(info.name, src as Record<string, unknown>, info.pk, skipKind); continue; }
      mapping.post?.(row, src, ctx);
      if (mapping.queue && row.status === 'processing' && row.claimed_at == null) {
        // The old app left mid-flight rows in 'processing' forever; stamping the claim lets resetAbandonedClaims recover them.
        row.claimed_at = now;
        row.claimed_by = 'sqlite-import';
        ctx.repair('processing_claim_stamped', 'claimed_at', "row was 'processing' when the old app stopped; claimed_at set so the abandoned-claim reset retries or fails it");
      }

      // 2. foreign keys
      for (const fk of info.fks) {
        const values = fk.localKeys.map((k) => row[k]);
        if (values.some((v) => v === null || v === undefined)) continue;
        if (keysetFor(fk.parentTable, fk.parentKeys).has(tupleKey(values))) continue;
        const localId = fk.localKeys.join(',');
        const allNullable = fk.localNullable.every(Boolean);
        const parentDrop = fk.parentKeys.join(',') === (planned.get(fk.parentTable)?.info.pk.join(',') ?? '') ? dropped.get(fk.parentTable)?.get(tupleKey(values)) : undefined;
        const parentWasDropped = parentDrop === 'known';
        const leftover = fk.onDelete === 'cascade' && (CASCADE_LEFTOVER_PARENTS as readonly string[]).includes(fk.parentTable);
        const rule = mapping.orphans[localId] ?? (parentWasDropped || leftover ? 'skip' : fk.onDelete === 'set null' && allNullable ? 'null' : undefined);
        const nullable = fk.localKeys.filter((_, i) => fk.localNullable[i]);
        const where = `${localId}=${values.join('/')} -> ${fk.parentTable} does not exist`;
        if (rule === 'null' && nullable.length > 0) {
          for (const k of nullable) row[k] = null;
          repairs.push({ rule: 'orphan_reference_nulled', table: info.name, id: rowId, column: nullable.join(','), action: `${where}; reference set to NULL`, known: true });
        } else if (rule === 'skip' && parentDrop !== 'lossy') {
          repairs.push({ rule: 'orphan_row_dropped', table: info.name, id: rowId, column: localId, action: `${where}; row dropped (its parent was deleted)`, known: true });
          skip = true;
          skipKind = 'known';
        } else if (allowLossy) {
          repairs.push({ rule: 'lossy_skip_orphan', table: info.name, id: rowId, column: localId, action: `${where}; row skipped`, known: false });
          skip = true;
          skipKind = 'lossy';
        } else {
          isBlocked = true;
          issues.push({ kind: 'orphan', table: info.name, id: rowId, column: localId, detail: where, lossyAction: 'row skipped' });
        }
      }
      if (skip) { table.skipped++; markDropped(info.name, row, info.pk, skipKind); continue; }

      // 3. primary / unique keys
      const pkTuple = info.pk.length > 0 ? tupleKey(info.pk.map((k) => row[k])) : null;
      if (pkTuple !== null) {
        if (seenPk.has(pkTuple)) { report('duplicate_key', info.pk.join(','), `duplicate primary key ${pkTuple.split(sep).join('/')}`, false); }
        else seenPk.add(pkTuple);
      }
      info.uniques.forEach((cols, i) => {
        const values = cols.map((c) => row[c]);
        if (values.some((v) => v === null || v === undefined)) return;
        const t = tupleKey(values);
        if (seenUnique[i].has(t)) report('duplicate_key', cols.join(','), `duplicate unique key (${cols.join(', ')}) = (${t.split(sep).join(', ')})`, false);
        else seenUnique[i].add(t);
      });
      if (skip) { table.skipped++; markDropped(info.name, row, info.pk, skipKind); continue; }

      if (isBlocked) { blocked.get(info.name)!.push(row); table.skipped++; continue; }
      table.rows.push(row);
    }
    // keysets built lazily afterwards include this table's final rows
    keysets.delete(info.name);
  }

  relationshipPass(planned, issues, repairs, allowLossy);

  for (const t of planned.values()) t.skipped = t.sourceCount - t.rows.length;
  return { tables: infos.map((i) => planned.get(i.name)!), issues, repairs, coalesced, unmappedLegacyColumns };
}

/**
 * Relationships Postgres cannot check because they are not foreign keys: the polymorphic `entity_id` of placements and
 * `matches.winner_team` (three ID spaces, see CLAUDE.md). Runs after every table is planned.
 */
function relationshipPass(planned: Map<string, PlannedTable>, issues: Issue[], repairs: Repair[], allowLossy: boolean): void {
  const ids = (table: string): Set<string> => new Set((planned.get(table)?.rows ?? []).map((r) => String(r.id)));
  const teams = ids('match_teams');
  const participants = ids('match_participants');
  const tournamentTeams = ids('tournament_teams');

  const placements = planned.get('match_game_placements');
  if (placements) {
    placements.rows = placements.rows.filter((row) => {
      const space = row.entity_type === 'team' ? teams : participants;
      if (space.has(String(row.entity_id))) return true;
      const detail = `entity_id=${String(row.entity_id)} does not exist in ${row.entity_type === 'team' ? 'match_teams' : 'match_participants'}`;
      if (allowLossy) repairs.push({ rule: 'lossy_skip_placement', table: 'match_game_placements', id: String(row.id), column: 'entity_id', action: `${detail}; row skipped`, known: false });
      else issues.push({ kind: 'relationship', table: 'match_game_placements', id: String(row.id), column: 'entity_id', detail, lossyAction: 'row skipped' });
      return false;
    });
  }

  const matches = planned.get('matches');
  if (matches) {
    for (const row of matches.rows) {
      const winner = row.winner_team;
      if (winner === null || winner === undefined || winner === '') continue;
      const ok = row.tournament_id ? tournamentTeams.has(String(winner)) : teams.has(String(winner)) || participants.has(String(winner));
      if (ok) continue;
      const detail = `winner_team=${String(winner)} does not resolve to ${row.tournament_id ? 'tournament_teams' : 'match_teams / match_participants'}`;
      if (allowLossy) {
        row.winner_team = null;
        repairs.push({ rule: 'lossy_null_winner', table: 'matches', id: String(row.id), column: 'winner_team', action: `${detail}; winner cleared`, known: false });
      } else {
        issues.push({ kind: 'relationship', table: 'matches', id: String(row.id), column: 'winner_team', detail, lossyAction: 'winner_team set to NULL' });
      }
    }
  }
}
