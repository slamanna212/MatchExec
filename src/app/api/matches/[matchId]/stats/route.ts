import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import type { MatchPlayerStats, ScorecardPlayerStat } from '@/shared/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const db = await getDbInstance();

    const stats = await db.all<MatchPlayerStats>(
      'SELECT * FROM match_player_stats WHERE match_id = ? ORDER BY created_at',
      [matchId]
    );

    return NextResponse.json(stats || []);
  } catch (error) {
    logger.error('Error fetching match stats:', error);
    return NextResponse.json({ error: 'Failed to fetch match stats' }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const db = await getDbInstance();

    // Fetch all approved player stats for this match
    const playerStats = await db.all<ScorecardPlayerStat & { submission_review_status: string }>(
      `SELECT sps.* FROM scorecard_player_stats sps
       JOIN scorecard_submissions ss ON ss.id = sps.submission_id
       WHERE sps.match_id = ? AND ss.review_status IN ('approved', 'auto_approved')
       AND sps.participant_id IS NOT NULL`,
      [matchId]
    );

    if (!playerStats || playerStats.length === 0) {
      return NextResponse.json({ message: 'No approved stats to aggregate' });
    }

    // Group by participant_id and sum stats
    const participantStats = new Map<string, { totalStats: Record<string, number>; mapsPlayed: Set<string> }>();

    for (const stat of playerStats) {
      if (!stat.participant_id) continue;

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
      } catch {
        // skip unparseable stats
      }
    }

    // Upsert into match_player_stats
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

    return NextResponse.json({ success: true, participantsAggregated: participantStats.size });
  } catch (error) {
    logger.error('Error aggregating match stats:', error);
    return NextResponse.json({ error: 'Failed to aggregate match stats' }, { status: 500 });
  }
}
