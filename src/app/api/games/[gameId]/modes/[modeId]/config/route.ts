import { NextRequest, NextResponse } from 'next/server';
import { getMatchFormatConfig } from '../../../../../../../lib/scoring-functions';
import { MatchFormat } from '@/shared/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; modeId: string }> }
) {
  try {
    const { gameId, modeId } = await params;
    const { searchParams } = new URL(request.url);
    const matchFormat = searchParams.get('format') as MatchFormat;
    const matchId = searchParams.get('matchId');

    if (!matchFormat) {
      return NextResponse.json(
        { error: 'Format parameter is required' },
        { status: 400 }
      );
    }

    const config = await getMatchFormatConfig(gameId, modeId, matchFormat, matchId || undefined);
    
    return NextResponse.json(config);

  } catch (error) {
    console.error('Error getting scoring config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get scoring configuration' },
      { status: 500 }
    );
  }
}