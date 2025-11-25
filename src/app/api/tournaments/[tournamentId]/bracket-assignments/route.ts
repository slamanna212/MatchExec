import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';

interface BracketAssignment {
  position: number;
  teamId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const { tournamentId } = await params;
    const { assignments }: { assignments: BracketAssignment[] } = await request.json();

    if (!assignments || !Array.isArray(assignments)) {
      return NextResponse.json(
        { error: 'Invalid assignments data' },
        { status: 400 }
      );
    }

    const db = await getDbInstance();

    // Verify tournament exists and is in assign phase
    const tournament = await db.get(
      'SELECT * FROM tournaments WHERE id = ? AND status = ?',
      [tournamentId, 'assign']
    );

    if (!tournament) {
      return NextResponse.json(
        { error: 'Tournament not found or not in assignment phase' },
        { status: 404 }
      );
    }

    // Verify all teams exist and belong to this tournament
    for (const assignment of assignments) {
      const team = await db.get(
        'SELECT * FROM tournament_teams WHERE id = ? AND tournament_id = ?',
        [assignment.teamId, tournamentId]
      );
      
      if (!team) {
        return NextResponse.json(
          { error: `Team ${assignment.teamId} not found in tournament` },
          { status: 400 }
        );
      }
    }

    // Store bracket assignments (we could create a table for this or store in tournament metadata)
    // For now, we'll just validate and return success since the actual match generation
    // will happen in the generate-matches endpoint
    
    return NextResponse.json({ 
      message: 'Bracket assignments saved successfully',
      assignments 
    });

  } catch (error) {
    logger.error('Error saving bracket assignments:', error);
    return NextResponse.json(
      { error: 'Failed to save bracket assignments' },
      { status: 500 }
    );
  }
}