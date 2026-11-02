/**
 * Value coercion SQLite -> Postgres, driven by the Drizzle column type (so a column type change in the schema
 * automatically changes how legacy values are converted).
 *
 *   boolean       0/1 (also '0'/'1'/'true'/'false') -> boolean; anything else is an issue
 *   timestamptz   naive 'YYYY-MM-DD HH:MM:SS' = UTC; ISO with Z/offset; date-only = UTC midnight
 *   date          'YYYY-MM-DD'
 *   jsonb         JSON text -> parsed value ('' and 'null' -> NULL); invalid JSON is an issue
 *   integer       integral numbers / numeric strings within int4 range
 *   double        numbers / numeric strings
 *   text          strings (numbers stringified, NUL bytes removed)
 *
 * Empty strings in non-text columns are treated as NULL (the old app wrote '' for "no value" in a few places).
 * An explicit NULL (or '') in a NOT NULL column is replaced by the column default (the baseline made every column that
 * had a SQLite DEFAULT NOT NULL); NOT NULL columns without a default raise `null_in_required`.
 */
import { is, SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { IssueKind } from './types';

export class CoerceIssue extends Error {
  constructor(readonly kind: IssueKind, message: string) {
    super(message);
  }
}

export type RawValue = string | number | bigint | boolean | Uint8Array | null | undefined;

const INT4_MAX = 2_147_483_647;
const NAIVE_TS = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

export function parseTimestamp(raw: string | number): Date {
  if (typeof raw === 'number') {
    const ms = raw >= 1e11 ? raw : raw >= 1e9 ? raw * 1000 : Number.NaN;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) throw new CoerceIssue('invalid_timestamp', `unparseable timestamp ${raw}`);
    return d;
  }
  const s = raw.trim();
  let d: Date | null = null;
  const naive = NAIVE_TS.exec(s);
  if (naive) {
    const [, y, mo, da, h, mi, sec, frac] = naive;
    d = new Date(`${y}-${mo}-${da}T${h}:${mi}:${sec ?? '00'}${frac ?? ''}Z`);
  } else if (DATE_ONLY.test(s)) {
    d = new Date(`${s}T00:00:00Z`);
  } else if (ISO_WITH_ZONE.test(s)) {
    d = new Date(s.replace(' ', 'T'));
  }
  if (!d || Number.isNaN(d.getTime())) throw new CoerceIssue('invalid_timestamp', `unparseable timestamp ${JSON.stringify(raw)}`);
  return d;
}

export function parseBoolean(raw: RawValue): boolean {
  if (raw === 1 || raw === 1n || raw === true || raw === '1') return true;
  if (raw === 0 || raw === 0n || raw === false || raw === '0') return false;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  throw new CoerceIssue('invalid_boolean', `expected 0/1 but found ${JSON.stringify(typeof raw === 'bigint' ? Number(raw) : raw)}`);
}

export function parseInteger(raw: RawValue): number {
  let n: number;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'bigint') n = Number(raw);
  else if (typeof raw === 'string' && raw.trim() !== '' && !Number.isNaN(Number(raw))) n = Number(raw);
  else throw new CoerceIssue('invalid_number', `expected an integer but found ${JSON.stringify(raw)}`);
  if (!Number.isInteger(n) || Math.abs(n) > INT4_MAX) throw new CoerceIssue('invalid_number', `integer out of range or fractional: ${n}`);
  return n;
}

export function parseDouble(raw: RawValue): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'bigint' ? Number(raw) : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n)) throw new CoerceIssue('invalid_number', `expected a number but found ${JSON.stringify(raw)}`);
  return n;
}

export function parseJson(raw: RawValue): unknown {
  if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint') return typeof raw === 'bigint' ? Number(raw) : raw;
  const text = raw instanceof Uint8Array ? new TextDecoder().decode(raw) : String(raw);
  if (text.trim() === '' || text.trim() === 'null') return null;
  try {
    const v: unknown = JSON.parse(text);
    return v;
  } catch (e) {
    throw new CoerceIssue('invalid_json', `invalid JSON (${(e as Error).message.slice(0, 80)}): ${text.slice(0, 60)}`);
  }
}

function parseText(raw: RawValue): string {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Uint8Array) return new TextDecoder().decode(raw);
  return String(raw);
}

export interface ColumnKind {
  type: 'boolean' | 'timestamp' | 'date' | 'json' | 'integer' | 'double' | 'text';
}

export function columnKind(col: PgColumn): ColumnKind['type'] {
  switch (col.columnType) {
    case 'PgBoolean': return 'boolean';
    case 'PgTimestamp': return 'timestamp';
    case 'PgDateString': case 'PgDate': return 'date';
    case 'PgJsonb': case 'PgJson': return 'json';
    case 'PgInteger': case 'PgSmallInt': case 'PgSerial': return 'integer';
    case 'PgDoublePrecision': case 'PgReal': return 'double';
    case 'PgText': case 'PgVarchar': return 'text';
    default: throw new Error(`Importer does not know how to coerce column type ${col.columnType} (${col.name}); update lib/import-sqlite/coerce.ts`);
  }
}

/** Convert one non-null legacy value to the column's JS type. Throws CoerceIssue for values Postgres would not accept. */
export function coerceValue(col: PgColumn, raw: Exclude<RawValue, null | undefined>): unknown {
  switch (columnKind(col)) {
    case 'boolean': return parseBoolean(raw);
    case 'timestamp': return parseTimestamp(typeof raw === 'bigint' ? Number(raw) : (raw as string | number));
    case 'date': {
      const d = parseTimestamp(typeof raw === 'bigint' ? Number(raw) : (raw as string | number));
      return d.toISOString().slice(0, 10);
    }
    case 'json': return parseJson(raw);
    case 'integer': return parseInteger(raw);
    case 'double': return parseDouble(raw);
    case 'text': {
      const s = parseText(raw);
      if (col.enumValues && !(col.enumValues as readonly string[]).includes(s)) {
        throw new CoerceIssue('invalid_enum', `value ${JSON.stringify(s)} is not one of ${(col.enumValues as readonly string[]).join('|')}`);
      }
      return s;
    }
    default: throw new Error(`unreachable column kind for ${col.name}`);
  }
}

/** True when a raw legacy value counts as "no value" for non-text columns. */
export function isEmptyLegacy(col: PgColumn, raw: RawValue): boolean {
  if (raw === null || raw === undefined) return true;
  return raw === '' && columnKind(col) !== 'text';
}

/** The value to use for an explicit NULL in a NOT NULL column that has a default; `undefined` when there is none. */
export function defaultFor(col: PgColumn, now: Date): unknown {
  if (!col.hasDefault) return undefined;
  const d = col.default as unknown;
  if (is(d as object, SQL)) {
    if (columnKind(col) === 'timestamp') return now;
    throw new Error(`Column ${col.name} has a SQL default the importer cannot evaluate; update lib/import-sqlite/coerce.ts`);
  }
  return d !== null && typeof d === 'object' ? structuredClone(d) : d;
}
