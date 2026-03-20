import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; submissionId: string }> }
) {
  try {
    const { matchId, submissionId } = await params;
    const body = await request.json();
    const { status } = body as { status: 'approved' | 'rejected' };

    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 });
    }

    const db = await getDbInstance();

    const submission = await db.get<{ id: string }>(
      'SELECT id FROM scorecard_submissions WHERE id = ? AND match_id = ?',
      [submissionId, matchId]
    );

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    await db.run(
      `UPDATE scorecard_submissions SET review_status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, submissionId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error reviewing submission:', error);
    return NextResponse.json({ error: 'Failed to review submission' }, { status: 500 });
  }
}
