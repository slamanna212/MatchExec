import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';

interface TournamentParticipant {
  id: string;
  user_id: string;
  username: string;
  joined_at: string;
  team_assignment: string | null;
  signup_data: string | null;
}

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
        tp.team_assignment,
        tp.signup_data
      FROM tournament_participants tp
      WHERE tp.tournament_id = ?
      ORDER BY tp.joined_at ASC
    `, [tournamentId]);

    // Parse signup_data JSON for each participant if it exists
    const parsedParticipants = participants.map((participant: TournamentParticipant) => ({
      ...participant,
      signup_data: participant.signup_data ? JSON.parse(participant.signup_data) : null
    }));

    // Fetch signup form configuration to get field labels
    let signupConfig = null;
    try {
      const tournament = await db.get(`
        SELECT signup_config_id FROM tournaments WHERE id = ?
      `, [tournamentId]);

      if (tournament?.signup_config_id) {
        signupConfig = await db.get(`
          SELECT * FROM signup_configs WHERE id = ?
        `, [tournament.signup_config_id]);

        if (signupConfig?.fields) {
          signupConfig.fields = JSON.parse(signupConfig.fields);
        }
      }
    } catch (error) {
      console.warn('Could not fetch signup config for tournament:', error.message);
      // Continue without signup config - this is non-critical
    }

    return NextResponse.json({
      participants: parsedParticipants,
      signupConfig
    });
  } catch (error) {
    console.error('Error fetching tournament participants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tournament participants' },
      { status: 500 }
    );
  }
}