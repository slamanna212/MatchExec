/**
 * CLI entrypoint of the "migrate" service: `pnpm db:migrate` (tsx) and the production bundle `dist/migrate.js`.
 * Kept separate from `./migrate` (which the web server also imports for `waitForSchema`) so that importing that
 * module never starts a migration, whichever way it is loaded or bundled.
 */
import { closeDb, resolveDatabaseUrl } from './index';
import { runMigrations } from './migrate';

async function main(): Promise<void> {
  resolveDatabaseUrl(); // fail fast with a clear message
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
