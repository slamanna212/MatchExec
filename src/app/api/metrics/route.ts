import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';

const startTime = Date.now();

function prometheusLine(name: string, help: string, type: string, value: number, labels?: Record<string, string>): string {
  const labelStr = labels
    ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
    : '';
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name}${labelStr} ${value}\n`;
}

export async function GET() {
  const lines: string[] = [];

  // Process uptime
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  lines.push(prometheusLine(
    'matchexec_uptime_seconds',
    'Time since the web process started',
    'gauge',
    uptimeSeconds
  ));

  // Memory usage
  const mem = process.memoryUsage();
  lines.push(prometheusLine('matchexec_memory_rss_bytes', 'Resident set size in bytes', 'gauge', mem.rss));
  lines.push(prometheusLine('matchexec_memory_heap_used_bytes', 'Heap used in bytes', 'gauge', mem.heapUsed));
  lines.push(prometheusLine('matchexec_memory_heap_total_bytes', 'Heap total in bytes', 'gauge', mem.heapTotal));

  try {
    const db = await getDbInstance();

    // Match counts by status
    const matchStatuses = await db.all<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM matches GROUP BY status'
    );
    lines.push(`# HELP matchexec_matches_total Total matches by status\n# TYPE matchexec_matches_total gauge\n`);
    for (const row of matchStatuses) {
      lines.push(`matchexec_matches_total{status="${row.status}"} ${row.count}\n`);
    }

    // Total matches (simple counter for dashboards)
    const totalMatches = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM matches');
    lines.push(prometheusLine('matchexec_matches_count', 'Total number of matches', 'gauge', totalMatches?.count || 0));

    // Tournament counts by status
    const tournamentStatuses = await db.all<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM tournaments GROUP BY status'
    );
    lines.push(`# HELP matchexec_tournaments_total Total tournaments by status\n# TYPE matchexec_tournaments_total gauge\n`);
    for (const row of tournamentStatuses) {
      lines.push(`matchexec_tournaments_total{status="${row.status}"} ${row.count}\n`);
    }

    // Total tournaments
    const totalTournaments = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournaments');
    lines.push(prometheusLine('matchexec_tournaments_count', 'Total number of tournaments', 'gauge', totalTournaments?.count || 0));

    // Participant counts
    const matchParticipants = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM match_participants');
    lines.push(prometheusLine('matchexec_match_participants_total', 'Total match participants', 'gauge', matchParticipants?.count || 0));

    const tournamentParticipants = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM tournament_participants');
    lines.push(prometheusLine('matchexec_tournament_participants_total', 'Total tournament participants', 'gauge', tournamentParticipants?.count || 0));

    // Discord queue depth (pending items)
    const pendingQueues = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM discord_queues WHERE status = 'pending'"
    );
    lines.push(prometheusLine('matchexec_discord_queue_pending', 'Pending Discord queue items', 'gauge', pendingQueues?.count || 0));

    // Games count
    const gamesCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM games');
    lines.push(prometheusLine('matchexec_games_count', 'Number of configured games', 'gauge', gamesCount?.count || 0));

    // Scheduler heartbeat age (seconds since last heartbeat)
    const schedulerHeartbeat = await db.get<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'scheduler_last_heartbeat'"
    );
    if (schedulerHeartbeat?.setting_value) {
      const ageSeconds = Math.floor((Date.now() - new Date(schedulerHeartbeat.setting_value).getTime()) / 1000);
      lines.push(prometheusLine('matchexec_scheduler_heartbeat_age_seconds', 'Seconds since last scheduler heartbeat', 'gauge', ageSeconds));
    }

    // Discord bot heartbeat age
    const botHeartbeat = await db.get<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'discord_bot_last_heartbeat'"
    );
    if (botHeartbeat?.setting_value) {
      const ageSeconds = Math.floor((Date.now() - new Date(botHeartbeat.setting_value).getTime()) / 1000);
      lines.push(prometheusLine('matchexec_discord_bot_heartbeat_age_seconds', 'Seconds since last Discord bot heartbeat', 'gauge', ageSeconds));
    }

    // Database size (file size)
    const dbPath = process.env.DATABASE_PATH || './app_data/data/matchexec.db';
    try {
      const fs = await import('fs');
      const stats = fs.statSync(dbPath);
      lines.push(prometheusLine('matchexec_database_size_bytes', 'SQLite database file size in bytes', 'gauge', stats.size));
    } catch {
      // Database file not accessible, skip metric
    }

    // Matches created in last 24 hours
    const recentMatches = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM matches WHERE created_at >= datetime('now', '-1 day')"
    );
    lines.push(prometheusLine('matchexec_matches_created_24h', 'Matches created in the last 24 hours', 'gauge', recentMatches?.count || 0));

    // Active matches (in battle status)
    const activeMatches = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM matches WHERE status = 'battle'"
    );
    lines.push(prometheusLine('matchexec_matches_active', 'Currently active matches (in battle phase)', 'gauge', activeMatches?.count || 0));

  } catch {
    // Database unavailable — return what we have (process metrics)
    lines.push(prometheusLine('matchexec_database_up', 'Whether the database is accessible', 'gauge', 0));
  }

  return new NextResponse(lines.join(''), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    },
  });
}
