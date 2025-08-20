import { NextRequest, NextResponse } from 'next/server';
import { getMatchGames, initializeMatchGames } from '../../../../../lib/scoring-functions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    
    let matchGames = await getMatchGames(matchId);
    
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
    
    return NextResponse.json({
      success: true,
      games: matchGames
    });

  } catch (error) {
    console.error('Error getting match games:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get match games' },
      { status: 500 }
    );
  }
}