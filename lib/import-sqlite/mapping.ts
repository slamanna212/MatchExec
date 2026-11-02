/**
 * Table mapping DSL (plan D3: the importer is permanent code and always imports into the CURRENT schema).
 *
 * `defineMapping(table, 'legacy_table', { columns })` requires an entry for EVERY column of the Drizzle table, so adding,
 * removing or renaming a column in `lib/db/schema/*` is a compile error here until the mapping is updated:
 *
 *   SAME            the legacy column has the same name; converted by the Drizzle column type (see coerce.ts)
 *   from('x')       the value comes from legacy column `x` (renamed column)
 *   DEFAULT         the column did not exist in SQLite; use the column default (NULL when nullable)
 *   derive(fn)      compute a raw legacy-style value from the legacy row; still converted by column type
 *   value(fn)       compute the final value (must already have the target JS type)
 *
 * Legacy columns that are intentionally NOT imported (retired by D1, renamed away, ...) are listed in `dropped`; a unit
 * test checks that every column of the fully migrated SQLite schema is either mapped or dropped here.
 */
import type { PgTable } from 'drizzle-orm/pg-core';
import type { RawValue } from './coerce';

export type SrcRow = Record<string, RawValue>;

export interface RowCtx {
  now: Date;
  /** Primary key of the row being converted (joined with ":" for composite keys). */
  id: string;
  /** Pre-computed hints shared across tables (see plan.ts). */
  hints: ImportHints;
  /** Record a repair the mapping applied on its own (known rule). */
  repair(rule: string, column: string | undefined, action: string): void;
}

export interface ImportHints {
  /** matches.blue_team_voice_channel / red_team_voice_channel, by match id (retired legacy columns, D1). */
  legacyVoiceChannels: Map<string, { blue: string | null; red: string | null }>;
}

export type ColumnPlan =
  | 'same'
  | 'default'
  | { from: string }
  | { derive: (src: SrcRow, ctx: RowCtx) => RawValue }
  | { value: (src: SrcRow, ctx: RowCtx) => unknown };

export const SAME = 'same' as const;
export const DEFAULT = 'default' as const;
export const from = (legacyColumn: string): ColumnPlan => ({ from: legacyColumn });
export const derive = (fn: (src: SrcRow, ctx: RowCtx) => RawValue): ColumnPlan => ({ derive: fn });
export const value = (fn: (src: SrcRow, ctx: RowCtx) => unknown): ColumnPlan => ({ value: fn });

/** What to do with a row whose foreign key points at a row that does not exist. */
export type OrphanRule = 'skip' | 'null';

export interface TableMapping {
  table: PgTable;
  /** Name of the SQLite table. */
  source: string;
  columns: Record<string, ColumnPlan>;
  /** Legacy columns intentionally not imported. */
  dropped: string[];
  /** Queue / job table: rows in status 'processing' get `claimed_at = import time` so the claim contract recovers them. */
  queue: boolean;
  /**
   * Known orphan rules, keyed by the local FK column list ("a,b"). Without a rule, a FK with ON DELETE SET NULL on
   * nullable columns is nulled (what the FK would have done) and every other orphan is a preflight issue.
   */
  orphans: Record<string, OrphanRule>;
  post?: (row: Record<string, unknown>, src: SrcRow, ctx: RowCtx) => void;
}

export interface MappingSpec<T extends PgTable> {
  columns: { [K in keyof T['$inferSelect']]: ColumnPlan };
  dropped?: string[];
  queue?: boolean;
  orphans?: Record<string, OrphanRule>;
  post?: TableMapping['post'];
}

export function defineMapping<T extends PgTable>(table: T, source: string, spec: MappingSpec<T>): TableMapping {
  return {
    table,
    source,
    columns: spec.columns as Record<string, ColumnPlan>,
    dropped: spec.dropped ?? [],
    queue: spec.queue ?? false,
    orphans: spec.orphans ?? {},
    post: spec.post,
  };
}
