import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { tournamentId } = await params;

    // Fetch all participants for this tournament
    const participants = await db.all(`
      SELECT
        tp.id,
        tp.user_id,
        tp.username,
        tp.joined_at,
        tp.team_assignment
      FROM tournament_participants tp
      WHERE tp.tournament_id = ?
      ORDER BY tp.joined_at ASC
    `, [tournamentId]);

    return NextResponse.json(participants);
  } catch (error) {
    console.error('Error fetching tournament participants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tournament participants' },
      { status: 500 }
    );
  }
}