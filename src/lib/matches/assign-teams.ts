/** `POST /api/matches/:matchId/assign-teams`: validate the whole body, then write all assignments atomically. */
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { matchParticipants, matchTeams } from '../../../lib/db/schema';
import { enqueueBotRequest } from '../discord-queues';
import { getDiscordSettings } from '../settings';
import { assignParticipantToTeam, createMatchTeams, lockMatch, resolveMatchTeam, setTeamVoiceChannel, TeamAssignmentError } from './teams';

export interface AssignmentEntry {
  participantId: string;
  /** match_teams.id */
  teamId?: string;
  /** Legacy: 'blue' | 'red' | 'reserve' */
  team?: string;
  receives_map_codes?: boolean;
}

export interface TeamVoiceChannelEntry { teamId: string; channelId: string }

export interface AssignTeamsInput {
  teamAssignments: AssignmentEntry[];
  /** Only touched when present, so a plain "save assignments" never wipes existing voice channels. */
  teamVoiceChannels?: TeamVoiceChannelEntry[];
  /** Legacy blue/red voice fields: map onto the team_order 0 / 1 teams. `undefined` = not sent. */
  blueTeamVoiceChannel?: string | null;
  redTeamVoiceChannel?: string | null;
}

export class AssignTeamsError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) {
    super(message);
    this.name = 'AssignTeamsError';
  }
}

const ASSIGNABLE_STATUSES = ['gather', 'assign'];

/**
 * Race: the status check, validation and writes all happen under the match row lock, so a concurrent transition to
 * battle (or a second save) can't interleave. Commander DM requests are enqueued in the same transaction, only for
 * commanders whose commander status or team actually changed.
 */
export async function assignTeams(matchId: string, input: AssignTeamsInput): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const match = await lockMatch(tx, matchId);
      if (!match) throw new AssignTeamsError('Match not found', 404);
      if (!ASSIGNABLE_STATUSES.includes(match.status)) {
        throw new AssignTeamsError(`Teams can only be assigned while the match is in gather or assign (current: ${match.status})`, 409);
      }
      await createMatchTeams(tx, matchId); // safety net: make sure team rows exist (idempotent)

      // Validate the entire body before writing anything.
      const resolved: Array<{ entry: AssignmentEntry; teamId: string }> = [];
      for (const assignment of input.teamAssignments) {
        if (!assignment || typeof assignment.participantId !== 'string' || !assignment.participantId) {
          throw new AssignTeamsError('Each assignment requires a participantId', 400);
        }
        const teamRef = assignment.teamId ?? assignment.team;
        if (!teamRef || typeof teamRef !== 'string') throw new AssignTeamsError(`Assignment missing teamId or team for participant ${assignment.participantId}`, 400);
        if (!assignment.teamId && assignment.team && !['reserve', 'blue', 'red'].includes(assignment.team)) {
          throw new AssignTeamsError(`Invalid legacy team assignment: ${assignment.team}`, 400);
        }
        const [participant] = await tx.select({ id: matchParticipants.id }).from(matchParticipants)
          .where(and(eq(matchParticipants.id, assignment.participantId), eq(matchParticipants.match_id, matchId)));
        if (!participant) throw new AssignTeamsError(`Participant ${assignment.participantId} does not belong to this match`, 400);
        try {
          resolved.push({ entry: assignment, teamId: (await resolveMatchTeam(tx, matchId, teamRef)).id });
        } catch (err) {
          if (err instanceof TeamAssignmentError) throw new AssignTeamsError(err.message, 400);
          throw err;
        }
      }
      for (const v of input.teamVoiceChannels ?? []) {
        if (!v || typeof v.teamId !== 'string') throw new AssignTeamsError('Invalid teamVoiceChannels entry', 400);
        const [team] = await tx.select({ id: matchTeams.id }).from(matchTeams).where(and(eq(matchTeams.id, v.teamId), eq(matchTeams.match_id, matchId)));
        if (!team) throw new AssignTeamsError(`Team ${v.teamId} does not belong to this match`, 400);
      }

      // Snapshot the previous state so commander DMs go only to real changes.
      const previous = new Map<string, { team_id: string | null; receives_map_codes: boolean }>();
      for (const { entry } of resolved) {
        const [prev] = await tx.select({ team_id: matchParticipants.team_id, receives_map_codes: matchParticipants.receives_map_codes }).from(matchParticipants)
          .where(and(eq(matchParticipants.id, entry.participantId), eq(matchParticipants.match_id, matchId)));
        if (prev) previous.set(entry.participantId, prev);
      }

      for (const { entry, teamId } of resolved) {
        await assignParticipantToTeam(tx, matchId, entry.participantId, teamId);
        if (entry.receives_map_codes !== undefined) {
          await tx.update(matchParticipants).set({ receives_map_codes: !!entry.receives_map_codes })
            .where(and(eq(matchParticipants.id, entry.participantId), eq(matchParticipants.match_id, matchId)));
        }
      }
      if (input.teamVoiceChannels) {
        for (const v of input.teamVoiceChannels) await setTeamVoiceChannel(tx, v.teamId, v.channelId || null, matchId);
      } else {
        for (const [order, value] of [[0, input.blueTeamVoiceChannel], [1, input.redTeamVoiceChannel]] as const) {
          if (value === undefined) continue;
          await tx.update(matchTeams).set({ voice_channel_id: value || null })
            .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.team_order, order), eq(matchTeams.is_reserve, false)));
        }
      }

      const discord = await getDiscordSettings(tx);
      if (!discord?.commander_dm_enabled) return;
      for (const { entry, teamId } of resolved) {
        if (!entry.receives_map_codes) continue;
        const prev = previous.get(entry.participantId);
        if (prev?.receives_map_codes && prev.team_id === teamId) continue;
        const [participant] = await tx
          .select({ discord_user_id: matchParticipants.discord_user_id, team_name: matchTeams.team_name })
          .from(matchParticipants).leftJoin(matchTeams, eq(matchTeams.id, matchParticipants.team_id))
          .where(and(eq(matchParticipants.id, entry.participantId), eq(matchParticipants.match_id, matchId)));
        if (participant?.discord_user_id) {
          await enqueueBotRequest(tx, 'commander_dm', { matchId, discordUserId: participant.discord_user_id, team: participant.team_name ?? '' });
        }
      }
    });
  } catch (error) {
    if (error instanceof TeamAssignmentError) throw new AssignTeamsError(error.message, 400);
    throw error;
  }
}
