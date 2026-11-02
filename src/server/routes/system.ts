/** System endpoints: `/api/db-status`, `/api/metrics`, `/api/version`. */
import { Hono } from 'hono';
import { count, eq, gte, sql } from 'drizzle-orm';
import { db, getPool } from '@lib/db';
import {
  discordAnnouncementQueue, discordDeletionQueue, discordHealthAlertQueue, discordMapCodeQueue, discordMatchEditQueue,
  discordMatchReminderQueue, discordMatchStartQueue, discordMatchWinnerQueue, discordPlayerReminderQueue,
  discordReminderQueue, discordScoreNotificationQueue, discordStatusUpdateQueue, discordVoiceAnnouncementQueue,
  games, matches, matchParticipants, tournamentParticipants, tournaments,
} from '@lib/db/schema';
import { getSystemStatus } from '@lib/db/system-status';
import { getAppSettings } from '@/lib/settings';
import { getVersionInfo } from '@/lib/version-server';
import { logger } from '@/lib/logger';

// ─── /api/db-status ──────────────────────────────────────────────────────────

export interface DbStatusImportInfo {
  /** Table the SQLite importer is working on (phase 'importing'). */
  table?: string;
  /** Failure summary of a failed SQLite import (phase 'error'). */
  error?: { message: string; issues: Array<{ table: string; id: string | null; detail: string }>; issuesTotal: number; repairs: number };
}

/** Extra fields for the loading screen, taken from system_status.report (written by the importer, plan 5.4). */
export function importProgress(phase: string, report: Record<string, unknown> | null): DbStatusImportInfo {
  if (!report) return {};
  if (phase === 'importing') {
    const table = (report.importing as { table?: string | null } | undefined)?.table;
    return table ? { table } : {};
  }
  if (phase === 'error' && typeof report.error === 'string') {
    const issues = Array.isArray(report.issues) ? (report.issues as Array<{ table: string; id: string | null; detail: string }>) : [];
    return {
      error: {
        message: report.error.split('\n')[0].slice(0, 500),
        issues: issues.slice(0, 10).map((i) => ({ table: i.table, id: i.id, detail: i.detail })),
        issuesTotal: typeof report.issuesTotal === 'number' ? report.issuesTotal : issues.length,
        repairs: Array.isArray(report.repairs) ? report.repairs.length + (typeof report.repairsTruncated === 'number' ? report.repairsTruncated : 0) : 0,
      },
    };
  }
  return {};
}

export const dbStatus = new Hono().get('/', async (c) => {
  try {
    let row = null;
    try {
      row = await getSystemStatus();
    } catch {
      // table missing while migrations are still running -> treated as not ready
    }
    if (!row) return c.json({ ready: false, progress: 'Initializing database...', timestamp: Date.now() });
    return c.json({
      ready: row.phase === 'ready',
      progress: row.message || row.phase,
      timestamp: row.updated_at.getTime(),
      phase: row.phase,
      percent: row.progress,
      ...importProgress(row.phase, row.report),
    });
  } catch (error) {
    logger.error('Error reading database status:', error);
    return c.json({ ready: false, progress: 'Error checking database status', timestamp: Date.now() }, 500);
  }
});

// ─── /api/version ────────────────────────────────────────────────────────────

export const version = new Hono().get('/', async (c) => {
  try {
    const versionInfo = getVersionInfo();
    const map = await getAppSettings(['update_available', 'latest_version']);
    return c.json({
      ...versionInfo,
      updateAvailable: map['update_available'] === 'true',
      latestVersion: map['latest_version'] ?? '',
    });
  } catch (error) {
    logger.error('Error getting version info:', error);
    return c.json(
      { version: 'unknown', branch: 'unknown', commitHash: 'unknown', isDev: false, updateAvailable: false, latestVersion: '' },
      500,
    );
  }
});

// ─── /api/metrics ────────────────────────────────────────────────────────────

const startTime = Date.now();

function metric(name: string, help: string, type: string, value: number, labels?: Record<string, string>): string {
  const labelStr = labels ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}` : '';
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name}${labelStr} ${value}\n`;
}

/** Queue tables whose `status` column uses `pending`; summed for the queue-depth gauge. */
const PENDING_QUEUE_TABLES = [
  discordAnnouncementQueue, discordDeletionQueue, discordHealthAlertQueue, discordMapCodeQueue, discordMatchEditQueue,
  discordMatchReminderQueue, discordMatchStartQueue, discordMatchWinnerQueue, discordPlayerReminderQueue,
  discordReminderQueue, discordScoreNotificationQueue, discordStatusUpdateQueue, discordVoiceAnnouncementQueue,
] as const;

async function countByStatus(table: typeof matches | typeof tournaments) {
  return db.select({ status: table.status, count: count() }).from(table).groupBy(table.status).orderBy(table.status);
}

async function totalOf(table: typeof matches | typeof tournaments | typeof games | typeof matchParticipants | typeof tournamentParticipants): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table);
  return row?.n ?? 0;
}

function heartbeatAge(value: string | undefined): number | null {
  return value ? Math.floor((Date.now() - new Date(value).getTime()) / 1000) : null;
}

export const metrics = new Hono().get('/', async (c) => {
  const lines: string[] = [];

  lines.push(metric('matchexec_uptime_seconds', 'Time since the web process started', 'gauge', Math.floor((Date.now() - startTime) / 1000)));
  const mem = process.memoryUsage();
  lines.push(metric('matchexec_memory_rss_bytes', 'Resident set size in bytes', 'gauge', mem.rss));
  lines.push(metric('matchexec_memory_heap_used_bytes', 'Heap used in bytes', 'gauge', mem.heapUsed));
  lines.push(metric('matchexec_memory_heap_total_bytes', 'Heap total in bytes', 'gauge', mem.heapTotal));

  // Postgres connection pool (only when this process owns a pool, i.e. not under an injected test database)
  try {
    const pool = getPool();
    lines.push(metric('matchexec_db_pool_total', 'Open connections in the web process pool', 'gauge', pool.totalCount));
    lines.push(metric('matchexec_db_pool_idle', 'Idle connections in the web process pool', 'gauge', pool.idleCount));
    lines.push(metric('matchexec_db_pool_waiting', 'Queries waiting for a pool connection', 'gauge', pool.waitingCount));
  } catch {
    // DATABASE_URL not configured: skip pool metrics
  }

  try {
    const matchStatuses = await countByStatus(matches);
    lines.push('# HELP matchexec_matches_total Total matches by status\n# TYPE matchexec_matches_total gauge\n');
    for (const row of matchStatuses) lines.push(`matchexec_matches_total{status="${row.status}"} ${row.count}\n`);
    lines.push(metric('matchexec_matches_count', 'Total number of matches', 'gauge', await totalOf(matches)));

    const tournamentStatuses = await countByStatus(tournaments);
    lines.push('# HELP matchexec_tournaments_total Total tournaments by status\n# TYPE matchexec_tournaments_total gauge\n');
    for (const row of tournamentStatuses) lines.push(`matchexec_tournaments_total{status="${row.status}"} ${row.count}\n`);
    lines.push(metric('matchexec_tournaments_count', 'Total number of tournaments', 'gauge', await totalOf(tournaments)));

    lines.push(metric('matchexec_match_participants_total', 'Total match participants', 'gauge', await totalOf(matchParticipants)));
    lines.push(metric('matchexec_tournament_participants_total', 'Total tournament participants', 'gauge', await totalOf(tournamentParticipants)));

    let pending = 0;
    for (const table of PENDING_QUEUE_TABLES) {
      const [row] = await db.select({ n: count() }).from(table).where(sql`${table.status} = 'pending'`);
      pending += row?.n ?? 0;
    }
    lines.push(metric('matchexec_discord_queue_pending', 'Pending Discord queue items', 'gauge', pending));
    lines.push(metric('matchexec_games_count', 'Number of configured games', 'gauge', await totalOf(games)));

    const hb = await getAppSettings(['scheduler_last_heartbeat', 'discord_bot_last_heartbeat', 'stats_processor_last_heartbeat']);
    const heartbeats: Array<[string, string, string]> = [
      ['scheduler_last_heartbeat', 'matchexec_scheduler_heartbeat_age_seconds', 'Seconds since last scheduler heartbeat'],
      ['discord_bot_last_heartbeat', 'matchexec_discord_bot_heartbeat_age_seconds', 'Seconds since last Discord bot heartbeat'],
      ['stats_processor_last_heartbeat', 'matchexec_stats_processor_heartbeat_age_seconds', 'Seconds since last stats processor heartbeat'],
    ];
    for (const [key, name, help] of heartbeats) {
      const age = heartbeatAge(hb[key]);
      if (age !== null) lines.push(metric(name, help, 'gauge', age));
    }

    const sizeRows = await db.execute<{ size: string | number }>(sql`select pg_database_size(current_database()) as size`);
    const size = Number((sizeRows as unknown as { rows: Array<{ size: string | number }> }).rows[0]?.size);
    if (Number.isFinite(size)) lines.push(metric('matchexec_database_size_bytes', 'Postgres database size in bytes', 'gauge', size));

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent] = await db.select({ n: count() }).from(matches).where(gte(matches.created_at, dayAgo));
    lines.push(metric('matchexec_matches_created_24h', 'Matches created in the last 24 hours', 'gauge', recent?.n ?? 0));
    const [active] = await db.select({ n: count() }).from(matches).where(eq(matches.status, 'battle'));
    lines.push(metric('matchexec_matches_active', 'Currently active matches (in battle phase)', 'gauge', active?.n ?? 0));
  } catch {
    // Database unavailable: return what we have (process metrics)
    lines.push(metric('matchexec_database_up', 'Whether the database is accessible', 'gauge', 0));
  }

  return c.body(lines.join(''), 200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
});
