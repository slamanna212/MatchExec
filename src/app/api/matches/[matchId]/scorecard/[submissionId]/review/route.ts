import type {NextResponse,  NextRequest } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { aggregateMatchStats } from '@/lib/stats-aggregation';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; submissionId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId, submissionId } = await params;
    const body = await request.json();
    const { status } = body as { status: 'approved' | 'rejected' };

    if (!status || !['approved', 'rejected'].includes(status)) {
      return apiError('status must be approved or rejected', 400);
    }

    const db = await getDbInstance();

    const submission = await db.get<{ id: string }>(
      'SELECT id FROM scorecard_submissions WHERE id = ? AND match_id = ?',
      [submissionId, matchId]
    );

    if (!submission) {
      return apiError('Submission not found', 404);
    }

    await db.run(
      `UPDATE scorecard_submissions SET review_status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, submissionId]
    );

    if (status === 'approved') {
      await aggregateMatchStats(db, matchId);
    }

    // Trigger stats report DMs when the match is complete and all submissions are finalized
    try {
      const match = await db.get<{ status: string }>(
        'SELECT status FROM matches WHERE id = ?',
        [matchId]
      );
      if (match?.status === 'complete') {
        const pending = await db.get<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM scorecard_submissions
           WHERE match_id = ? AND review_status NOT IN ('approved', 'rejected', 'auto_approved', 'failed')`,
          [matchId]
        );
        if (!pending || pending.cnt === 0) {
          const queueId = `stats_report_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
          await db.run(
            `INSERT INTO discord_stats_report_queue (id, match_id) VALUES (?, ?) ON CONFLICT(match_id) DO NOTHING`,
            [queueId, matchId]
          );
        }
      }
    } catch (triggerError) {
      logger.error('Error queuing stats report DM after review:', triggerError);
    }

    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error reviewing submission:', error);
    return apiError('Failed to review submission');
  }
}
