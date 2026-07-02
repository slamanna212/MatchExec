import type {NextResponse,  NextRequest} from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { assignParticipantToTeam, setTeamVoiceChannel } from '../../../../../lib/match-setup';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

interface AssignmentEntry {
  participantId: string;
  /** New: match_teams.id */
  teamId?: string;
  /** Legacy: 'blue' | 'red' | 'reserve' */
  team?: string;
  receives_map_codes?: boolean;
}

interface TeamVoiceChannelEntry {
  teamId: string;
  channelId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId } = await params;
    const body = await request.json();
    const {
      teamAssignments,
      // New: per-team voice channel map
      teamVoiceChannels,
      // Legacy voice channel fields (still accepted for compat)
      blueTeamVoiceChannel,
      redTeamVoiceChannel,
    } = body;

    if (!teamAssignments || !Array.isArray(teamAssignments)) {
      return apiError('Invalid team assignments data', 400);
    }

    const db = await getDbInstance();

    for (const assignment of teamAssignments as AssignmentEntry[]) {
      const teamRef = assignment.teamId ?? assignment.team;
      if (!teamRef) {
        return apiError(`Assignment missing teamId or team for participant ${assignment.participantId}`, 400);
      }

      // Legacy validation only for legacy string names
      if (!assignment.teamId && assignment.team && !['reserve', 'blue', 'red'].includes(assignment.team)) {
        return apiError(`Invalid legacy team assignment: ${assignment.team}`, 400);
      }

      await assignParticipantToTeam(matchId, assignment.participantId, teamRef);

      if (assignment.receives_map_codes !== undefined) {
        await db.run(
          'UPDATE match_participants SET receives_map_codes = ? WHERE id = ? AND match_id = ?',
          [assignment.receives_map_codes ? 1 : 0, assignment.participantId, matchId]
        );
      }
    }

    // Queue commander DMs for participants with receives_map_codes = true
    const discordCfg = await db.get<{ commander_dm_enabled: number }>(
      'SELECT commander_dm_enabled FROM discord_settings WHERE id = 1'
    );
    if (discordCfg?.commander_dm_enabled) {
      const commanders = (teamAssignments as AssignmentEntry[]).filter(a => a.receives_map_codes);
      for (const commander of commanders) {
        const participant = await db.get<{ discord_user_id: string; team_assignment: string }>(
          'SELECT discord_user_id, team_assignment FROM match_participants WHERE id = ? AND match_id = ?',
          [commander.participantId, matchId]
        );
        if (participant?.discord_user_id) {
          const teamLabel = commander.team ?? commander.teamId ?? '';
          await db.run(
            `INSERT INTO discord_bot_requests (id, type, data, status, created_at, updated_at)
             VALUES (?, 'commander_dm', ?, 'pending', datetime('now'), datetime('now'))`,
            [
              `cmdr_dm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, // NOSONAR: non-security internal ID
              JSON.stringify({ matchId, discordUserId: participant.discord_user_id, team: teamLabel })
            ]
          );
        }
      }
    }

    // Update voice channels — new per-team array takes priority
    if (Array.isArray(teamVoiceChannels)) {
      for (const entry of teamVoiceChannels as TeamVoiceChannelEntry[]) {
        await setTeamVoiceChannel(entry.teamId, entry.channelId || null);
      }
    } else {
      // Legacy: blue/red on matches row (dual-write)
      await db.run(
        'UPDATE matches SET blue_team_voice_channel = ?, red_team_voice_channel = ? WHERE id = ?',
        [blueTeamVoiceChannel || null, redTeamVoiceChannel || null, matchId]
      );
    }

    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error updating team assignments:', error);
    return apiError('Failed to update team assignments');
  }
}
