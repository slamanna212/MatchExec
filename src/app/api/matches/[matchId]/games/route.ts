import { NextRequest, NextResponse } from 'next/server';
import { getMatchGames, initializeMatchGames } from '../../../../../lib/scoring-functions';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    logger.debug('API: Starting to get match games...');
    const { matchId } = await params;
    logger.debug(`API: Match ID: ${matchId}`);
    
    logger.debug('API: Calling getMatchGames...');
    let matchGames = await getMatchGames(matchId);
    logger.debug(`API: getMatchGames returned ${matchGames?.length || 0} games`);
    
    // If no games found, try to initialize them automatically
    if (matchGames.length === 0) {
      logger.debug(`No match games found for ${matchId}, attempting to initialize...`);
      try {
        await initializeMatchGames(matchId);
        matchGames = await getMatchGames(matchId);
        if (matchGames.length > 0) {
          logger.debug(`Successfully initialized ${matchGames.length} match games for ${matchId}`);
        }
      } catch (initError) {
        logger.warning(`Could not initialize match games for ${matchId}:`, initError);
        // Continue with empty array - don't fail the request
      }
    }
    
    logger.debug('API: Returning response...');
    return NextResponse.json({
      success: true,
      games: matchGames
    });

  } catch (error) {
    logger.error('Error getting match games:', error);
    logger.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get match games' },
      { status: 500 }
    );
  }
}