import crypto from 'crypto';
import type { Database } from '../../lib/database/connection';
import { logger } from './logger';

export async function aggregateMatchStats(db: Database, matchId: string): Promise<number> {
  const playerStats = await db.all<{ participant_id: string; match_game_id: string; stats_json: string }>(
    `SELECT sps.participant_id, sps.match_game_id, sps.stats_json
     FROM scorecard_player_stats sps
     JOIN scorecard_submissions ss ON ss.id = sps.submission_id
     WHERE sps.match_id = ? AND ss.review_status IN ('approved', 'auto_approved')
     AND sps.participant_id IS NOT NULL`,
    [matchId]
  );

  if (!playerStats || playerStats.length === 0) return 0;

  const participantStats = new Map<string, { totalStats: Record<string, number>; mapsPlayed: Set<string> }>();
  for (const stat of playerStats) {
    if (!participantStats.has(stat.participant_id)) {
      participantStats.set(stat.participant_id, { totalStats: {}, mapsPlayed: new Set() });
    }
    const entry = participantStats.get(stat.participant_id)!;
    entry.mapsPlayed.add(stat.match_game_id);
    try {
      const stats = JSON.parse(stat.stats_json) as Record<string, number>;
      for (const [key, value] of Object.entries(stats)) {
        if (typeof value === 'number') {
          entry.totalStats[key] = (entry.totalStats[key] || 0) + value;
        }
      }
    } catch { /* skip unparseable */ }
  }

  for (const [participantId, data] of participantStats.entries()) {
    const id = crypto.randomUUID();
    await db.run(
      `INSERT INTO match_player_stats (id, match_id, participant_id, total_stats_json, maps_played)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(match_id, participant_id) DO UPDATE SET
         total_stats_json = excluded.total_stats_json,
         maps_played = excluded.maps_played`,
      [id, matchId, participantId, JSON.stringify(data.totalStats), data.mapsPlayed.size]
    );
  }

  logger.info(`Stats aggregated for match ${matchId}: ${participantStats.size} participants`);
  return participantStats.size;
}
