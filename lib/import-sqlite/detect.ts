/** Plan 5.1: when does the importer run, and where is the legacy file / backup directory. */
import fs from 'node:fs';
import path from 'node:path';
import { count, getTableName } from 'drizzle-orm';
import type { Executor } from '../db';
import { activityFeed, discordSettings, matchParticipants, matches, series, tournamentTeams, tournaments } from '../db/schema';

/** If any of these has rows the database already holds real data and a legacy import is refused. */
export const CORE_TABLES = [matches, tournaments, series, matchParticipants, tournamentTeams, discordSettings, activityFeed] as const;

/**
 * `$DATABASE_PATH` (deprecated, only read here) when set — it is then the only candidate, so pointing it at a
 * missing file disables auto-import. Otherwise ./app_data/data/matchexec.db, then the Docker path.
 */
export function findLegacyFile(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): string | null {
  const candidates = env.DATABASE_PATH
    ? [env.DATABASE_PATH]
    : [path.join(cwd, 'app_data', 'data', 'matchexec.db'), '/app/app_data/data/matchexec.db'];
  for (const c of candidates) {
    if (c && fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c);
  }
  return null;
}

/** MATCHEXEC_BACKUP_DIR, else ./app_data/backups in development, else /app/app_data/backups (or next to the legacy data dir off Docker). */
export function resolveBackupDir(legacyPath: string, env: Record<string, string | undefined> = process.env, cwd = process.cwd()): string {
  if (env.MATCHEXEC_BACKUP_DIR) return path.resolve(env.MATCHEXEC_BACKUP_DIR);
  if (env.NODE_ENV === 'development') return path.join(cwd, 'app_data', 'backups');
  if (fs.existsSync('/app/app_data')) return '/app/app_data/backups';
  return path.resolve(path.dirname(legacyPath), '..', 'backups');
}

export async function coreTablesEmpty(ex: Executor): Promise<{ empty: boolean; nonEmpty: string[] }> {
  const nonEmpty: string[] = [];
  for (const table of CORE_TABLES) {
    const [row] = await ex.select({ n: count() }).from(table);
    if (Number(row?.n ?? 0) > 0) nonEmpty.push(getTableName(table));
  }
  return { empty: nonEmpty.length === 0, nonEmpty };
}
