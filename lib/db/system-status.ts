/**
 * Readiness / progress record (replaces `.db-status.json`; works across pods).
 *
 * The old file-based `lib/database/status.ts` has been removed; `/api/db-status`, the welcome middleware and the process
 * start-up wait (`waitForSystemReady`) all read this row.
 */
import { eq } from 'drizzle-orm';
import { db as defaultDb, type Executor } from './index';
import { systemStatus } from './schema';

export type SystemPhase = (typeof systemStatus.$inferSelect)['phase'];
export type SystemStatus = typeof systemStatus.$inferSelect;

export interface SetSystemStatusInput {
  phase: SystemPhase;
  message?: string;
  progress?: number;
  importedFromSqlite?: boolean;
  /** Importer error / repair report (Stage 5). Pass `null` to clear. */
  report?: Record<string, unknown> | null;
}

const ROW_ID = 1;

export async function getSystemStatus(ex: Executor = defaultDb): Promise<SystemStatus | null> {
  const rows = await ex.select().from(systemStatus).where(eq(systemStatus.id, ROW_ID)).limit(1);
  return rows[0] ?? null;
}

/** True once migrations + seeding (and any import) finished. Missing table/row counts as not ready. */
export async function isSystemReady(ex: Executor = defaultDb): Promise<boolean> {
  try {
    return (await getSystemStatus(ex))?.phase === 'ready';
  } catch {
    return false; // table may not exist yet while migrations run
  }
}

/** Upsert the single status row. Omitted optional fields keep their stored value (message/progress reset on insert). */
export async function setSystemStatus(input: SetSystemStatusInput, ex: Executor = defaultDb): Promise<SystemStatus> {
  const values = {
    id: ROW_ID,
    phase: input.phase,
    message: input.message ?? '',
    progress: input.progress ?? (input.phase === 'ready' ? 100 : 0),
    updated_at: new Date(),
    ...(input.importedFromSqlite === undefined ? {} : { imported_from_sqlite: input.importedFromSqlite }),
    ...(input.report === undefined ? {} : { report: input.report }),
  };
  const [row] = await ex
    .insert(systemStatus)
    .values(values)
    .onConflictDoUpdate({
      target: systemStatus.id,
      set: {
        phase: values.phase,
        message: values.message,
        progress: values.progress,
        updated_at: values.updated_at,
        ...(input.importedFromSqlite === undefined ? {} : { imported_from_sqlite: input.importedFromSqlite }),
        ...(input.report === undefined ? {} : { report: input.report }),
      },
    })
    .returning();
  return row;
}

export const markSystemReady = (message = 'Ready', ex: Executor = defaultDb): Promise<SystemStatus> =>
  setSystemStatus({ phase: 'ready', message, progress: 100 }, ex);

/**
 * Poll `system_status` until the migrator reports `ready` (used by the bot, scheduler and stats-processor at
 * startup instead of the old `.db-status.json` file). Rejects after `timeoutMs`.
 */
export async function waitForSystemReady(
  opts: { timeoutMs?: number; intervalMs?: number } = {},
  ex: Executor = defaultDb,
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 500;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isSystemReady(ex)) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Database not ready after ${timeoutMs}ms timeout (system_status.phase is not 'ready')`);
}
