import type {NextResponse,  NextRequest} from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId } = await params;
    const body = await request.json();
    const { teamAssignments, blueTeamVoiceChannel, redTeamVoiceChannel } = body;

    if (!teamAssignments || !Array.isArray(teamAssignments)) {
      return apiError('Invalid team assignments data', 400);
    }

    const db = await getDbInstance();

    // Update team assignments for all participants
    const updatePromises = teamAssignments.map(async (assignment: { participantId: string; team: string; receives_map_codes?: boolean }) => {
      if (!['reserve', 'blue', 'red'].includes(assignment.team)) {
        throw new Error(`Invalid team assignment: ${assignment.team}`);
      }

      return db.run(
        'UPDATE match_participants SET team_assignment = ?, receives_map_codes = ? WHERE id = ? AND match_id = ?',
        [assignment.team, assignment.receives_map_codes || false, assignment.participantId, matchId]
      );
    });

    await Promise.all(updatePromises);

    // Queue commander DMs for participants with receives_map_codes = true
    const discordCfg = await db.get<{ commander_dm_enabled: number }>(
      'SELECT commander_dm_enabled FROM discord_settings WHERE id = 1'
    );
    if (discordCfg?.commander_dm_enabled) {
      const commanders = teamAssignments.filter((a: { participantId: string; team: string; receives_map_codes?: boolean }) => a.receives_map_codes);
      for (const commander of commanders) {
        const participant = await db.get<{ discord_user_id: string; team_assignment: string }>(
          'SELECT discord_user_id, team_assignment FROM match_participants WHERE id = ? AND match_id = ?',
          [commander.participantId, matchId]
        );
        if (participant?.discord_user_id) {
          await db.run(
            `INSERT INTO discord_bot_requests (id, type, data, status, created_at, updated_at)
             VALUES (?, 'commander_dm', ?, 'pending', datetime('now'), datetime('now'))`,
            [
              `cmdr_dm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, // NOSONAR: non-security internal ID
              JSON.stringify({ matchId, discordUserId: participant.discord_user_id, team: commander.team })
            ]
          );
        }
      }
    }

    // Update voice channel assignments for teams
    await db.run(
      'UPDATE matches SET blue_team_voice_channel = ?, red_team_voice_channel = ? WHERE id = ?',
      [blueTeamVoiceChannel || null, redTeamVoiceChannel || null, matchId]
    );

    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error updating team assignments:', error);
    return apiError('Failed to update team assignments');
  }
}