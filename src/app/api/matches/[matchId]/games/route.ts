import { NextRequest, NextResponse } from 'next/server';
import { getMatchGames, initializeMatchGames } from '../../../../../lib/scoring-functions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    console.log('API: Starting to get match games...');
    const { matchId } = await params;
    console.log(`API: Match ID: ${matchId}`);
    
    console.log('API: Calling getMatchGames...');
    let matchGames = await getMatchGames(matchId);
    console.log(`API: getMatchGames returned ${matchGames?.length || 0} games`);
    
    // If no games found, try to initialize them automatically
    if (matchGames.length === 0) {
      console.log(`No match games found for ${matchId}, attempting to initialize...`);
      try {
        await initializeMatchGames(matchId);
        matchGames = await getMatchGames(matchId);
        if (matchGames.length > 0) {
          console.log(`Successfully initialized ${matchGames.length} match games for ${matchId}`);
        }
      } catch (initError) {
        console.warn(`Could not initialize match games for ${matchId}:`, initError);
        // Continue with empty array - don't fail the request
      }
    }
    
    console.log('API: Returning response...');
    return NextResponse.json({
      success: true,
      games: matchGames
    });

  } catch (error) {
    console.error('Error getting match games:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get match games' },
      { status: 500 }
    );
  }
}