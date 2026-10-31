import type {NextResponse,  NextRequest} from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import {
  assignParticipantToTeam,
  createMatchTeams,
  resolveMatchTeam,
  setTeamVoiceChannel,
  TeamAssignmentError,
} from '../../../../../lib/match-setup';
import { withTransaction } from '@/lib/transaction';
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

const ASSIGNABLE_STATUSES = ['gather', 'assign'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
): Promise<NextResponse> {
  try {
    const { matchId } = await params;
    const body = await request.json();
    const { teamAssignments, teamVoiceChannels } = body;

    if (!teamAssignments || !Array.isArray(teamAssignments)) {
      return apiError('Invalid team assignments data', 400);
    }

    // Voice fields are only touched when actually present in the body, so a plain
    // "save assignments" call never wipes existing voice channels.
    const hasTeamVoiceChannels = 'teamVoiceChannels' in body && Array.isArray(teamVoiceChannels);
    const hasLegacyVoice = 'blueTeamVoiceChannel' in body || 'redTeamVoiceChannel' in body;

    const db = await getDbInstance();

    const match = await db.get<{ status: string }>('SELECT status FROM matches WHERE id = ?', [matchId]);
    if (!match) {
      return apiError('Match not found', 404);
    }
    if (!ASSIGNABLE_STATUSES.includes(match.status)) {
      return apiError(`Teams can only be assigned while the match is in gather or assign (current: ${match.status})`, 409);
    }

    // Safety net: make sure team rows exist (idempotent).
    await createMatchTeams(matchId);

    // ── Validate the entire body before writing anything ──────────────────────
    const entries = teamAssignments as AssignmentEntry[];
    const resolved: Array<{ entry: AssignmentEntry; teamId: string }> = [];
    for (const assignment of entries) {
      if (!assignment || typeof assignment.participantId !== 'string' || !assignment.participantId) {
        return apiError('Each assignment requires a participantId', 400);
      }
      const teamRef = assignment.teamId ?? assignment.team;
      if (!teamRef || typeof teamRef !== 'string') {
        return apiError(`Assignment missing teamId or team for participant ${assignment.participantId}`, 400);
      }

      // Legacy validation only for legacy string names
      if (!assignment.teamId && assignment.team && !['reserve', 'blue', 'red'].includes(assignment.team)) {
        return apiError(`Invalid legacy team assignment: ${assignment.team}`, 400);
      }

      const participant = await db.get<{ id: string }>(
        'SELECT id FROM match_participants WHERE id = ? AND match_id = ?',
        [assignment.participantId, matchId]
      );
      if (!participant) {
        return apiError(`Participant ${assignment.participantId} does not belong to this match`, 400);
      }

      try {
        const team = await resolveMatchTeam(db, matchId, teamRef);
        resolved.push({ entry: assignment, teamId: team.id });
      } catch (err) {
        if (err instanceof TeamAssignmentError) return apiError(err.message, 400);
        throw err;
      }
    }

    if (hasTeamVoiceChannels) {
      for (const v of teamVoiceChannels as TeamVoiceChannelEntry[]) {
        if (!v || typeof v.teamId !== 'string') {
          return apiError('Invalid teamVoiceChannels entry', 400);
        }
        const team = await db.get<{ id: string }>(
          'SELECT id FROM match_teams WHERE id = ? AND match_id = ?', [v.teamId, matchId]
        );
        if (!team) {
          return apiError(`Team ${v.teamId} does not belong to this match`, 400);
        }
      }
    }

    // Snapshot previous state so commander DMs go only to real changes.
    const previous = new Map<string, { team_id: string | null; receives_map_codes: number }>();
    for (const { entry } of resolved) {
      const prev = await db.get<{ team_id: string | null; receives_map_codes: number }>(
        'SELECT team_id, receives_map_codes FROM match_participants WHERE id = ? AND match_id = ?',
        [entry.participantId, matchId]
      );
      if (prev) previous.set(entry.participantId, prev);
    }

    // ── All-or-nothing write ──────────────────────────────────────────────────
    await withTransaction(db, async () => {
      for (const { entry, teamId } of resolved) {
        await assignParticipantToTeam(matchId, entry.participantId, teamId);

        if (entry.receives_map_codes !== undefined) {
          await db.run(
            'UPDATE match_participants SET receives_map_codes = ? WHERE id = ? AND match_id = ?',
            [entry.receives_map_codes ? 1 : 0, entry.participantId, matchId]
          );
        }
      }

      if (hasTeamVoiceChannels) {
        for (const v of teamVoiceChannels as TeamVoiceChannelEntry[]) {
          await setTeamVoiceChannel(v.teamId, v.channelId || null, matchId);
        }
      } else if (hasLegacyVoice) {
        // Legacy: blue/red on matches row (dual-write). Only columns actually sent.
        if ('blueTeamVoiceChannel' in body) {
          await db.run('UPDATE matches SET blue_team_voice_channel = ? WHERE id = ?', [body.blueTeamVoiceChannel || null, matchId]);
        }
        if ('redTeamVoiceChannel' in body) {
          await db.run('UPDATE matches SET red_team_voice_channel = ? WHERE id = ?', [body.redTeamVoiceChannel || null, matchId]);
        }
      }
    });

    // Queue commander DMs (after commit) only for commanders whose commander
    // status or team actually changed.
    const discordCfg = await db.get<{ commander_dm_enabled: number }>(
      'SELECT commander_dm_enabled FROM discord_settings WHERE id = 1'
    );
    if (discordCfg?.commander_dm_enabled) {
      for (const { entry, teamId } of resolved) {
        if (!entry.receives_map_codes) continue;
        const prev = previous.get(entry.participantId);
        const changed = !prev || !prev.receives_map_codes || prev.team_id !== teamId;
        if (!changed) continue;

        const participant = await db.get<{ discord_user_id: string | null; team_name: string | null }>(
          `SELECT mp.discord_user_id as discord_user_id, mt.team_name as team_name
           FROM match_participants mp LEFT JOIN match_teams mt ON mt.id = mp.team_id
           WHERE mp.id = ? AND mp.match_id = ?`,
          [entry.participantId, matchId]
        );
        if (participant?.discord_user_id) {
          await db.run(
            `INSERT INTO discord_bot_requests (id, type, data, status, created_at, updated_at)
             VALUES (?, 'commander_dm', ?, 'pending', datetime('now'), datetime('now'))`,
            [
              `cmdr_dm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, // NOSONAR: non-security internal ID
              JSON.stringify({ matchId, discordUserId: participant.discord_user_id, team: participant.team_name ?? '' })
            ]
          );
        }
      }
    }

    return apiOk({ success: true });
  } catch (error) {
    if (error instanceof TeamAssignmentError) {
      return apiError(error.message, 400);
    }
    logger.error('Error updating team assignments:', error);
    return apiError('Failed to update team assignments');
  }
}
