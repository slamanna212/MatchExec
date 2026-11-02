/** Shared types for the SQLite -> Postgres importer (plan Stage 5). */
import type { Executor } from '../db';

export type IssueKind =
  | 'orphan'
  | 'invalid_json'
  | 'invalid_timestamp'
  | 'invalid_boolean'
  | 'invalid_number'
  | 'invalid_enum'
  | 'null_in_required'
  | 'duplicate_key'
  | 'legacy_disagreement'
  | 'relationship'
  | 'blob_too_large';

/** A problem found by the preflight. Without MATCHEXEC_IMPORT_ALLOW_LOSSY=true any issue aborts the import. */
export interface Issue {
  kind: IssueKind;
  table: string;
  /** Primary key (or description of the row) so the operator can find it in the legacy database. */
  id: string | null;
  column?: string;
  detail: string;
  /** What lossy mode does with it. */
  lossyAction: string;
}

/** A change the importer applied (known repair rules always; lossy repairs only in lossy mode). */
export interface Repair {
  rule: string;
  table: string;
  id: string | null;
  column?: string;
  action: string;
  /** True when the rule is a documented known-issue rule applied without MATCHEXEC_IMPORT_ALLOW_LOSSY. */
  known: boolean;
}

export interface TableStats {
  source: number;
  imported: number;
  skipped: number;
}

export interface ImportReport {
  startedAt: string;
  finishedAt?: string;
  source: string;
  safetyCopy?: string;
  lossy: boolean;
  legacyMigrationsApplied: string[];
  tables: Record<string, TableStats>;
  blobs: { imported: number; skipped: number; bytes: number };
  repairs: Repair[];
  /** Number of repairs not stored in `repairs` (the list is truncated for system_status). */
  repairsTruncated?: number;
  issues: Issue[];
  /** Explicit NULLs replaced by column defaults (table.column -> rows). Informational. */
  coalesced?: Record<string, number>;
  /** Columns present in the legacy database that no mapping reads (table -> columns). Informational. */
  ignoredLegacyColumns?: Record<string, string[]>;
  verification?: { seriesChecked: number; tournamentsChecked: number; matchesChecked: number };
  error?: string;
}

export interface ProgressEvent {
  phase: 'detect' | 'copy' | 'prepare' | 'tables' | 'uploads' | 'sequences' | 'verify' | 'commit' | 'finish';
  message: string;
  table?: string;
  /** 0-100 */
  percent: number;
}

/** Fault-injection / observation points (used by tests; harmless in production). */
export interface ImportHooks {
  /** After a table has been inserted (inside the transaction). */
  afterTable?(table: string, tx: Executor): void | Promise<void>;
  /** After everything is inserted, right before verification (inside the transaction). */
  beforeVerify?(tx: Executor): void | Promise<void>;
  /** After COMMIT, before the legacy files are renamed. */
  afterCommit?(): void | Promise<void>;
}

export class PreflightError extends Error {
  constructor(readonly report: ImportReport, message: string) {
    super(message);
    this.name = 'PreflightError';
  }
}

export class VerificationError extends Error {
  constructor(readonly mismatches: string[], message: string) {
    super(message);
    this.name = 'VerificationError';
  }
}

export class LegacyDatabaseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LegacyDatabaseError';
  }
}
