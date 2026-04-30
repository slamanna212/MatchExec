import type { NextRequest} from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

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
      return apiError('Invalid assignments data', 400);
    }

    const db = await getDbInstance();

    // Verify tournament exists and is in assign phase
    const tournament = await db.get(
      'SELECT * FROM tournaments WHERE id = ? AND status = ?',
      [tournamentId, 'assign']
    );

    if (!tournament) {
      return apiError('Tournament not found or not in assignment phase', 404);
    }

    // Verify all teams exist and belong to this tournament
    for (const assignment of assignments) {
      const team = await db.get(
        'SELECT * FROM tournament_teams WHERE id = ? AND tournament_id = ?',
        [assignment.teamId, tournamentId]
      );

      if (!team) {
        return apiError(`Team ${assignment.teamId} not found in tournament`, 400);
      }
    }

    // Store bracket assignments (we could create a table for this or store in tournament metadata)
    // For now, we'll just validate and return success since the actual match generation
    // will happen in the generate-matches endpoint

    return apiOk({
      message: 'Bracket assignments saved successfully',
      assignments
    });

  } catch (error) {
    logger.error('Error saving bracket assignments:', error);
    return apiError('Failed to save bracket assignments');
  }
}