import type {NextResponse,  NextRequest } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { db as pgDb } from '../../../../../../../../lib/db';
import { enqueueStatsProcessing, findStatsProcessingBySubmission, requeueJob } from '@/lib/discord-queues';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string; submissionId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId, submissionId } = await params;
    const db = await getDbInstance();

    const submission = await db.get<{ id: string; match_game_id: string; ai_extraction_status: string }>(
      'SELECT id, match_game_id, ai_extraction_status FROM scorecard_submissions WHERE id = ? AND match_id = ?',
      [submissionId, matchId]
    );

    if (!submission) {
      return apiError('Submission not found', 404);
    }

    if (submission.ai_extraction_status !== 'failed') {
      return apiError('Only failed submissions can be retried', 400);
    }

    // Reset submission status
    await db.run(
      `UPDATE scorecard_submissions SET ai_extraction_status = 'pending', ai_error_message = NULL WHERE id = ?`,
      [submissionId]
    );

    // Reset existing queue entry if present, otherwise create a new one
    const existing = await findStatsProcessingBySubmission(pgDb, submissionId);

    if (existing) {
      await requeueJob(pgDb, 'statsProcessing', existing.id);
    } else {
      await enqueueStatsProcessing(pgDb, { submissionId, matchId, matchGameId: submission.match_game_id });
    }

    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error retrying submission:', error);
    return apiError('Failed to retry submission');
  }
}
