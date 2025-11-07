import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';

interface TournamentParticipant {
  id: string;
  user_id: string;
  username: string;
  joined_at: string;
  team_assignment: string | null;
  signup_data: string | null;
}

interface SignupConfig {
  id: string;
  name: string;
  fields: string | object;
  created_at: string;
  updated_at: string;
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
    `, [tournamentId]) as TournamentParticipant[];

    // Parse signup_data JSON for each participant if it exists
    const parsedParticipants = participants.map((participant) => ({
      ...participant,
      signup_data: participant.signup_data ? JSON.parse(participant.signup_data) : null
    }));

    // Fetch signup form configuration to get field labels
    let signupConfig = null;
    try {
      const tournament = await db.get(`
        SELECT signup_config_id FROM tournaments WHERE id = ?
      `, [tournamentId]) as { signup_config_id: string | null } | undefined;

      if (tournament?.signup_config_id) {
        const rawSignupConfig = await db.get(`
          SELECT * FROM signup_configs WHERE id = ?
        `, [tournament.signup_config_id]) as SignupConfig | undefined;

        if (rawSignupConfig?.fields) {
          signupConfig = {
            ...rawSignupConfig,
            fields: typeof rawSignupConfig.fields === 'string'
              ? JSON.parse(rawSignupConfig.fields)
              : rawSignupConfig.fields
          };
        } else {
          signupConfig = rawSignupConfig;
        }
      }
    } catch (error) {
      logger.warning('Could not fetch signup config for tournament:', error instanceof Error ? error.message : String(error));
      // Continue without signup config - this is non-critical
    }

    return NextResponse.json({
      participants: parsedParticipants,
      signupConfig
    });
  } catch (error) {
    logger.error('Error fetching tournament participants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tournament participants' },
      { status: 500 }
    );
  }
}