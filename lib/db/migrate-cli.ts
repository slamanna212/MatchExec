/**
 * CLI entrypoint of the "migrate" service: `pnpm db:migrate` (tsx) and the production bundle `dist/migrate.js`.
 * Kept separate from `./migrate` (which the web server also imports for `waitForSchema`) so that importing that
 * module never starts a migration, whichever way it is loaded or bundled.
 */
import { installLegacyImportHook } from '../import-sqlite/hook';
import { closeDb, resolveDatabaseUrl } from './index';
import { runMigrations } from './migrate';

async function main(): Promise<void> {
  resolveDatabaseUrl(); // fail fast with a clear message
  installLegacyImportHook(); // plan 5.1: import a legacy SQLite database when one is found (MATCHEXEC_IMPORT_ALLOW_LOSSY etc. from env)
  try {
    await runMigrations();
  } finally {
    await closeDb();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('[migrate] failed:', err);
    process.exit(1);
  },
);
