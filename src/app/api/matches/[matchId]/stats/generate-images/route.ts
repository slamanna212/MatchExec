import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const db = await getDbInstance();

    const queueId = crypto.randomUUID();
    await db.run(
      'INSERT INTO stats_image_queue (id, match_id, status) VALUES (?, ?, ?)',
      [queueId, matchId, 'pending']
    );

    return NextResponse.json({ success: true, queueId });
  } catch (error) {
    logger.error('Error queuing image generation:', error);
    return NextResponse.json({ error: 'Failed to queue image generation' }, { status: 500 });
  }
}
