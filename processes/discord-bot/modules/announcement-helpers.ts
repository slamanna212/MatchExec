/**
 * Helper functions for announcement embed building
 */

import { AttachmentBuilder } from 'discord.js';
import { logger } from '../../../src/lib/logger/server';
import { cleanMapId } from '../../../src/lib/utils/map-utils';
import type { Database } from '../../../lib/database/connection';
import { safePublicPath } from './utils';
import * as path from 'path';
import * as fs from 'fs';

/** Winner kinds written by the scoring engine into Discord queue rows. */
export type WinnerKind = 'team1' | 'team2' | 'tie' | 'team' | 'participant';

/** Only team1/team2/tie results have a meaningful "X - Y" scoreline. */
export function isTwoSidedResult(winner: WinnerKind): boolean {
  return winner === 'team1' || winner === 'team2' || winner === 'tie';
}

const GENERIC_TEAM_NAMES = new Set(['blue team', 'red team', 'team1', 'team2', 'team 1', 'team 2']);

/**
 * winning_team_name is authoritative (the scoring engine resolves it for N-team,
 * FFA and Position matches). Only fall back to the match's team1/team2 names when
 * it is empty or a generic Blue/Red placeholder for a team1/team2 winner.
 */
export function resolveWinnerDisplayName(
  winner: WinnerKind,
  winningTeamName: string | null | undefined,
  team1Name?: string | null,
  team2Name?: string | null
): string {
  const name = (winningTeamName ?? '').trim();
  const isGeneric = name === '' || GENERIC_TEAM_NAMES.has(name.toLowerCase());
  if (!isGeneric) return name;
  if (winner === 'team1' && team1Name) return team1Name;
  if (winner === 'team2' && team2Name) return team2Name;
  return name || 'Unknown';
}

export const DISCORD_FIELD_VALUE_LIMIT = 1024;
export const DISCORD_MAX_FIELDS = 25;
/** Matches with more active teams than this render as compact participant lists. */
export const MAX_FIELD_PER_TEAM_COUNT = 8;

/**
 * Split lines into chunks that each fit a Discord embed field value (1024 chars).
 * Overlong single lines are truncated with an ellipsis.
 */
export function chunkLinesForFields(lines: string[], limit = DISCORD_FIELD_VALUE_LIMIT): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const raw of lines) {
    const line = raw.length > limit ? `${raw.slice(0, limit - 1)}…` : raw;
    if (current && current.length + 1 + line.length > limit) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export interface MatchStartData {
  gameName: string;
  gameColor: number;
  /** game_modes.scoring_type of the match (defaults to 'Normal'). */
  scoringType?: string;
  blueTeamVoiceChannel: string | null;
  redTeamVoiceChannel: string | null;
  team1Name?: string;
  team2Name?: string;
}

export interface Participant {
  username: string;
  team_assignment?: string;
  discord_user_id?: string;
}

export interface TeamFields {
  blueTeam: Participant[];
  redTeam: Participant[];
  reserves: Participant[];
}

export interface MatchTeamRow {
  id: string;
  team_name: string;
  team_color?: string;
  team_order: number;
  voice_channel_id?: string;
  is_reserve: boolean;
  participants: Participant[];
}

export interface MessageLinkData {
  message_id: string;
  channel_id: string;
}

/**
 * Fetch match start data from database
 */
export async function fetchMatchStartData(
  db: Database,
  matchId: string,
  gameId: string
): Promise<MatchStartData> {
  const defaultData: MatchStartData = {
    gameName: gameId,
    gameColor: 0xe74c3c, // Red color for match start
    blueTeamVoiceChannel: null,
    redTeamVoiceChannel: null
  };

  try {
    const matchData = await db.get<{
      game_name: string;
      game_color?: string;
      game_icon?: string;
      blue_team_voice_channel?: string;
      red_team_voice_channel?: string;
      team1_name?: string;
      team2_name?: string;
      scoring_type?: string;
    }>(`
      SELECT g.name as game_name, g.color as game_color, g.icon_url as game_icon,
             m.blue_team_voice_channel, m.red_team_voice_channel,
             m.team1_name, m.team2_name,
             COALESCE(gmode.scoring_type, 'Normal') as scoring_type
      FROM matches m
      JOIN games g ON m.game_id = g.id
      LEFT JOIN game_modes gmode ON gmode.id = m.mode_id AND gmode.game_id = m.game_id
      WHERE m.id = ?
    `, [matchId]);

    if (matchData) {
      // Try to read team names and voice channels from match_teams (new system)
      const teams = await db.all<{
        team_name: string;
        team_order: number;
        voice_channel_id?: string;
      }>(`
        SELECT team_name, team_order, voice_channel_id
        FROM match_teams WHERE match_id = ? AND is_reserve = 0
        ORDER BY team_order ASC
      `, [matchId]);

      const blueTeam = teams.find(t => t.team_order === 0);
      const redTeam = teams.find(t => t.team_order === 1);

      // FFA/Position matches have one match_teams row per participant, so
      // team 0/1 are just the first two players: never present them as sides.
      const isTeamMode = (matchData.scoring_type ?? 'Normal') === 'Normal';

      return {
        gameName: matchData.game_name,
        scoringType: matchData.scoring_type ?? 'Normal',
        gameColor: matchData.game_color ? parseInt(matchData.game_color.replace('#', ''), 16) : defaultData.gameColor,
        // New system takes priority for voice channels
        blueTeamVoiceChannel: blueTeam?.voice_channel_id || matchData.blue_team_voice_channel || null,
        redTeamVoiceChannel: redTeam?.voice_channel_id || matchData.red_team_voice_channel || null,
        // New system takes priority for team names
        team1Name: isTeamMode ? (blueTeam?.team_name || matchData.team1_name) : undefined,
        team2Name: isTeamMode ? (redTeam?.team_name || matchData.team2_name) : undefined
      };
    }
  } catch (error) {
    logger.error('Error fetching match data for match start:', error);
  }

  return defaultData;
}

/**
 * Build map list field value with map names from database
 */
export async function buildMapListField(
  db: Database,
  maps: string[],
  gameId: string
): Promise<string> {
  let mapList = maps.join(', '); // Fallback to IDs

  try {
    const mapNames: string[] = [];

    for (const mapId of maps) {
      const cleanedMapId = cleanMapId(mapId);

      // Get map name from database
      const mapData = await db.get<{ name: string }>(`
        SELECT name FROM game_maps
        WHERE game_id = ? AND (id = ? OR LOWER(name) LIKE LOWER(?))
        LIMIT 1
      `, [gameId, cleanedMapId, `%${cleanedMapId}%`]);

      if (mapData) {
        mapNames.push(mapData.name);
      } else {
        mapNames.push(mapId);
      }
    }

    if (mapNames.length > 0) {
      mapList = mapNames.length > 3
        ? `${mapNames.slice(0, 3).join(', ')} +${mapNames.length - 3} more`
        : mapNames.join(', ');
    }
  } catch (error) {
    logger.error('Error fetching map names for match start:', error);
  }

  return mapList;
}

/**
 * Fetch team assignments from database.
 * Reads from match_teams + team_id first; falls back to legacy team_assignment.
 */
export async function fetchTeamAssignments(
  db: Database,
  matchId: string
): Promise<TeamFields> {
  const defaultTeams: TeamFields = {
    blueTeam: [],
    redTeam: [],
    reserves: []
  };

  try {
    const participants = await db.all<Participant & { team_order?: number; is_reserve?: number }>(`
      SELECT mp.username, mp.team_assignment, mp.discord_user_id,
             mt.team_order, mt.is_reserve
      FROM match_participants mp
      LEFT JOIN match_teams mt ON mt.id = mp.team_id AND mt.match_id = mp.match_id
      WHERE mp.match_id = ?
      ORDER BY mt.team_order ASC, mp.username ASC
    `, [matchId]);

    if (participants && participants.length > 0) {
      const hasTeamId = participants.some(p => p.team_order !== undefined && p.team_order !== null);

      if (hasTeamId) {
        return {
          blueTeam: participants.filter(p => p.team_order === 0 && !p.is_reserve),
          redTeam: participants.filter(p => p.team_order === 1 && !p.is_reserve),
          reserves: participants.filter(p => p.is_reserve || (p.team_order === undefined || p.team_order === null))
        };
      }

      // Legacy fallback
      return {
        blueTeam: participants.filter(p => p.team_assignment === 'blue'),
        redTeam: participants.filter(p => p.team_assignment === 'red'),
        reserves: participants.filter(p => p.team_assignment === 'reserve' || !p.team_assignment)
      };
    }
  } catch (error) {
    logger.error('Error fetching team assignments for match start:', error);
  }

  return defaultTeams;
}

/**
 * Fetch all match_teams rows with their participants for N-team support.
 */
export async function fetchMatchTeamRows(
  db: Database,
  matchId: string
): Promise<MatchTeamRow[]> {
  try {
    const teams = await db.all<{
      id: string; team_name: string; team_color?: string;
      team_order: number; voice_channel_id?: string; is_reserve: number;
    }>(`
      SELECT id, team_name, team_color, team_order, voice_channel_id, is_reserve
      FROM match_teams WHERE match_id = ? ORDER BY is_reserve ASC, team_order ASC
    `, [matchId]);

    if (!teams || teams.length === 0) return [];

    const result: MatchTeamRow[] = [];
    for (const team of teams) {
      const participants = await db.all<Participant>(`
        SELECT mp.username, mp.team_assignment, mp.discord_user_id
        FROM match_participants mp
        WHERE mp.match_id = ? AND mp.team_id = ?
        ORDER BY mp.username ASC
      `, [matchId, team.id]);

      result.push({
        id: team.id,
        team_name: team.team_name,
        team_color: team.team_color,
        team_order: team.team_order,
        voice_channel_id: team.voice_channel_id,
        is_reserve: Boolean(team.is_reserve),
        participants
      });
    }

    return result;
  } catch (error) {
    logger.error('Error fetching match team rows:', error);
    return [];
  }
}

/**
 * Build team field value with participants and voice channel
 */
export function buildTeamFieldValue(
  participants: Participant[],
  voiceChannel: string | null
): string {
  const participantList = participants
    .map(p => p.discord_user_id ? `<@${p.discord_user_id}>` : p.username)
    .join('\n');

  let fieldValue = participantList;
  if (voiceChannel) {
    fieldValue += `\n\n🎙️ Voice: <#${voiceChannel}>`;
  }

  return fieldValue;
}

/**
 * Get match link from original announcement message
 */
export async function getMatchLink(
  db: Database,
  matchId: string,
  client: any
): Promise<string | null> {
  try {
    const originalMessage = await db.get<MessageLinkData>(`
      SELECT message_id, channel_id
      FROM discord_match_messages
      WHERE match_id = ? AND message_type = 'announcement'
      LIMIT 1
    `, [matchId]);

    if (originalMessage && client.guilds.cache.first()) {
      const guildId = client.guilds.cache.first()?.id;
      return `https://discord.com/channels/${guildId}/${originalMessage.channel_id}/${originalMessage.message_id}`;
    }
  } catch (error) {
    logger.error('Error finding original announcement message:', error);
  }

  return null;
}

/**
 * Attach event image to embed
 */
export async function attachEventImage(imageUrl: string): Promise<AttachmentBuilder | undefined> {
  if (!imageUrl || !imageUrl.trim()) {
    return undefined;
  }

  try {
    const imagePath = safePublicPath(imageUrl);
    if (!imagePath) {
      logger.error(`❌ Invalid image path rejected: ${imageUrl}`);
      return undefined;
    }

    if (fs.existsSync(imagePath)) {
      const imageBuffer = await fs.promises.readFile(imagePath);

      if (!imageBuffer || imageBuffer.length === 0) {
        logger.error(`❌ Match start image buffer is empty`);
        return undefined;
      }

      return new AttachmentBuilder(imageBuffer, {
        name: `match_start_image.${path.extname(imagePath).slice(1)}`
      });
    }
  } catch (error) {
    logger.error(`❌ Error handling match start image ${imageUrl}:`, error);
  }

  return undefined;
}

/**
 * Get image attachment name from image URL
 */
export function getImageAttachmentName(imageUrl: string): string {
  const ext = path.extname(imageUrl).slice(1);
  return `match_start_image.${ext}`;
}
