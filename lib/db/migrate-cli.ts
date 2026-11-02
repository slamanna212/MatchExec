/**
 * CLI entrypoint of the "migrate" service: `pnpm db:migrate` (tsx) and the production bundle `dist/migrate.js`.
 * Kept separate from `./migrate` (which the web server also imports for `waitForSchema`) so that importing that
 * module never starts a migration, whichever way it is loaded or bundled.
 */
import { installLegacyImportHook } from '../import-sqlite/hook';
import { closeDb, resolveDatabaseUrl } from './index';
import { runMigrations } from './migrate';
import { getSystemStatus, setSystemStatus } from './system-status';

/**
 * Best effort: make sure the failure is visible in the web UI. The importer already stores a detailed error report
 * (phase 'error'); for any other failure (pre-upgrade dump, migration SQL, ...) record the message so the loading screen
 * (and /api/db-status) can show it. Never throws.
 */
export async function recordMigrationFailure(err: unknown): Promise<void> {
  try {
    const current = await getSystemStatus();
    if (current?.phase === 'error') return;
    const message = err instanceof Error ? err.message : String(err);
    await setSystemStatus({ phase: 'error', message: message.slice(0, 500), progress: current?.progress ?? 0, report: { error: message } });
  } catch {
    // The database itself may be unreachable; the exit status and the log still carry the failure.
  }
}

async function main(): Promise<void> {
  resolveDatabaseUrl(); // fail fast with a clear message
  installLegacyImportHook(); // plan 5.1: import a legacy SQLite database when one is found (MATCHEXEC_IMPORT_ALLOW_LOSSY etc. from env)
  try {
    await runMigrations();
  } catch (err) {
    await recordMigrationFailure(err);
    throw err;
  } finally {
    await closeDb();
  }
}

if (!process.env.VITEST) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error('[migrate] failed:', err);
      process.exit(1);
    },
  );
}
