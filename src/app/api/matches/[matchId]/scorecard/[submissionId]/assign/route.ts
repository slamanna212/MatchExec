import type {NextResponse,  NextRequest } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { releaseHeldScoreNotification } from '@/lib/matches';
import { db as pgDb } from '../../../../../../../../lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; submissionId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId, submissionId } = await params;
    const body = await request.json();
    const { assignments } = body as { assignments: Array<{ playerStatId: string; participantId: string }> };

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return apiError('assignments array is required', 400);
    }

    const db = await getDbInstance();

    const submission = await db.get<{ id: string }>(
      'SELECT id FROM scorecard_submissions WHERE id = ? AND match_id = ?',
      [submissionId, matchId]
    );

    if (!submission) {
      return apiError('Submission not found', 404);
    }

    for (const assignment of assignments) {
      await db.run(
        `UPDATE scorecard_player_stats SET participant_id = ?, assignment_status = 'assigned' WHERE id = ? AND submission_id = ?`,
        [assignment.participantId, assignment.playerStatId, submissionId]
      );
    }

    // Clear the feed event if no unassigned player stats remain across all submissions for this match
    try {
      const remaining = await db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM scorecard_player_stats sps
         JOIN scorecard_submissions ss ON sps.submission_id = ss.id
         WHERE ss.match_id = ? AND sps.assignment_status = 'unassigned'`,
        [matchId]
      );
      if ((remaining?.count ?? 0) === 0) {
        await db.run(
          `DELETE FROM activity_feed WHERE event_type = 'scorecard_player_matching_required' AND match_id = ?`,
          [matchId]
        );
      }
    } catch (feedError) {
      logger.error('Error clearing scorecard player matching feed event:', feedError);
    }

    // Trigger held Discord notification for stats-enabled matches (match data lives in Postgres now;
    // TODO(stats): the scorecard tables above move with Stage 2 item 8).
    try {
      const submissionRow = await db.get<{ match_game_id: string }>(
        'SELECT match_game_id FROM scorecard_submissions WHERE id = ?', [submissionId]
      );
      if (submissionRow && await releaseHeldScoreNotification(pgDb, submissionRow.match_game_id)) {
        logger.info(`Queued held Discord notification for stats-enabled map: ${submissionRow.match_game_id}`);
      }
    } catch (notifError) {
      logger.error('Error triggering held Discord notification after stats assignment:', notifError);
      // Non-critical — don't fail the assignment
    }

    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error assigning participants:', error);
    return apiError('Failed to assign participants');
  }
}
