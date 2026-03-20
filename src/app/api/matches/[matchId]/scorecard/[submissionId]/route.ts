import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import type { ScorecardSubmission, ScorecardPlayerStat } from '@/shared/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string; submissionId: string }> }
) {
  try {
    const { matchId, submissionId } = await params;
    const db = await getDbInstance();

    const submission = await db.get<ScorecardSubmission>(
      'SELECT * FROM scorecard_submissions WHERE id = ? AND match_id = ?',
      [submissionId, matchId]
    );

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const playerStats = await db.all<ScorecardPlayerStat>(
      'SELECT * FROM scorecard_player_stats WHERE submission_id = ? ORDER BY team_side, extracted_player_name',
      [submissionId]
    );

    return NextResponse.json({ ...submission, playerStats: playerStats || [] });
  } catch (error) {
    logger.error('Error fetching submission:', error);
    return NextResponse.json({ error: 'Failed to fetch submission' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ matchId: string; submissionId: string }> }
) {
  try {
    const { matchId, submissionId } = await params;
    const db = await getDbInstance();

    const submission = await db.get<{ id: string }>(
      'SELECT id FROM scorecard_submissions WHERE id = ? AND match_id = ?',
      [submissionId, matchId]
    );

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    await db.run('DELETE FROM scorecard_submissions WHERE id = ?', [submissionId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting submission:', error);
    return NextResponse.json({ error: 'Failed to delete submission' }, { status: 500 });
  }
}
