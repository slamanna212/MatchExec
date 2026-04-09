import type { NextRequest } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; submissionId: string }> }
) {
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

    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error assigning participants:', error);
    return apiError('Failed to assign participants');
  }
}
