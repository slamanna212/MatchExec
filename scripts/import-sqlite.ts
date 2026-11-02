/**
 * CLI for the SQLite -> Postgres importer (built to dist/import-sqlite.js).
 *
 *   node dist/import-sqlite.js --from /data/matchexec.db --database-url postgres://user:pw@host/db [options]
 *
 * Runs the Drizzle migrations on the target (so a brand new external database works), then imports into the EMPTY database,
 * seeds the game data and marks the system ready. Intended for Kubernetes users moving a SQLite PVC to external Postgres; the
 * all-in-one image does the same automatically from the `migrate` service.
 *
 * Options:
 *   --from <file>            legacy matchexec.db (default: autodetect, see plan 5.1)
 *   --database-url <url>     target (default: $DATABASE_URL)
 *   --backup-dir <dir>       where pre-postgres-<date>.db is written (default: $MATCHEXEC_BACKUP_DIR, ./app_data/backups, ...)
 *   --uploads-dir <dir>      uploaded files to import (repeatable; default: ./public/uploads)
 *   --allow-lossy            same as MATCHEXEC_IMPORT_ALLOW_LOSSY=true
 *   --no-rename              keep the legacy file in place after a successful import
 */
import { installLegacyImportHook } from '../lib/import-sqlite/hook';
import { PreflightError } from '../lib/import-sqlite/types';
import { closeDb } from '../lib/db';
import { runMigrations } from '../lib/db/migrate';

function parseArgs(argv: string[]): { from?: string; databaseUrl?: string; backupDir?: string; uploads: string[]; lossy: boolean; rename: boolean; help: boolean } {
  const out = { uploads: [] as string[], lossy: false, rename: true, help: false } as ReturnType<typeof parseArgs>;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (!v) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--from') out.from = next();
    else if (a === '--database-url') out.databaseUrl = next();
    else if (a === '--backup-dir') out.backupDir = next();
    else if (a === '--uploads-dir') out.uploads.push(next());
    else if (a === '--allow-lossy') out.lossy = true;
    else if (a === '--no-rename') out.rename = false;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown option ${a}`);
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node dist/import-sqlite.js --from <matchexec.db> --database-url <postgres url> [--backup-dir d] [--uploads-dir d] [--allow-lossy] [--no-rename]');
    return;
  }
  if (args.databaseUrl) process.env.DATABASE_URL = args.databaseUrl;
  if (!process.env.DATABASE_URL) throw new Error('No target database: pass --database-url or set DATABASE_URL');
  if (args.lossy) process.env.MATCHEXEC_IMPORT_ALLOW_LOSSY = 'true';

  installLegacyImportHook({
    legacyPath: args.from,
    backupDir: args.backupDir,
    uploadsDirs: args.uploads.length > 0 ? args.uploads : undefined,
    allowLossy: args.lossy || undefined,
    requireImport: true,
    skipRename: !args.rename,
  });
  try {
    await runMigrations();
  } finally {
    await closeDb();
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof PreflightError ? `\n${err.message}` : `[import-sqlite] failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
