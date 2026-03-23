import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ matchId: string; submissionId: string }> }
) {
  try {
    const { matchId, submissionId } = await params;
    const db = await getDbInstance();

    const submission = await db.get<{ id: string; match_game_id: string; ai_extraction_status: string }>(
      'SELECT id, match_game_id, ai_extraction_status FROM scorecard_submissions WHERE id = ? AND match_id = ?',
      [submissionId, matchId]
    );

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    if (submission.ai_extraction_status !== 'failed') {
      return NextResponse.json({ error: 'Only failed submissions can be retried' }, { status: 400 });
    }

    // Reset submission status
    await db.run(
      `UPDATE scorecard_submissions SET ai_extraction_status = 'pending', ai_error_message = NULL WHERE id = ?`,
      [submissionId]
    );

    // Reset existing queue entry if present, otherwise create a new one
    const existing = await db.get<{ id: string }>(
      'SELECT id FROM stats_processing_queue WHERE submission_id = ?',
      [submissionId]
    );

    if (existing) {
      await db.run(
        `UPDATE stats_processing_queue SET status = 'pending', retry_count = 0, error_message = NULL WHERE id = ?`,
        [existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO stats_processing_queue (id, submission_id, match_id, match_game_id) VALUES (?, ?, ?, ?)`,
        [crypto.randomUUID(), submissionId, matchId, submission.match_game_id]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error retrying submission:', error);
    return NextResponse.json({ error: 'Failed to retry submission' }, { status: 500 });
  }
}
