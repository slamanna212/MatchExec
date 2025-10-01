import { NextResponse } from 'next/server';
import { getVersionInfo } from '../../../../lib/version-server';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const versionInfo = getVersionInfo();
    return NextResponse.json(versionInfo);
  } catch (error) {
    logger.error('Error getting version info:', error);
    return NextResponse.json(
      { version: 'unknown', branch: 'unknown', commitHash: 'unknown', isDev: false },
      { status: 500 }
    );
  }
}