import { NextResponse } from 'next/server';
import { readDbStatus } from '../../../../lib/database/status';
import { logger } from '@/lib/logger';
import { apiOk } from '@/lib/api-response';

export async function GET() {
  try {
    const status = readDbStatus();
    return apiOk(status);
  } catch (error) {
    logger.error('Error reading database status:', error);
    return NextResponse.json(
      {
        ready: false,
        progress: 'Error checking database status',
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}