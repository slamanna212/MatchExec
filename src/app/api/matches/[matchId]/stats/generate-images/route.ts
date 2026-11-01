import type { NextResponse } from 'next/server';
import { db as pgDb } from '../../../../../../../lib/db';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { enqueueStatsImage } from '@/lib/discord-queues';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId } = await params;

    const queueId = await enqueueStatsImage(pgDb, matchId);

    return apiOk({ success: true, queueId });
  } catch (error) {
    logger.error('Error queuing image generation:', error);
    return apiError('Failed to queue image generation');
  }
}
