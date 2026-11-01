/**
 * Helper functions for announcement embed building
 */

import { AttachmentBuilder } from 'discord.js';
import { logger } from '../../../src/lib/logger/server';
import { cleanMapId } from '../../../src/lib/utils/map-utils';
import { safePublicPath } from './utils';
import * as path from 'path';
import * as fs from 'fs';
import { db as pgDb } from '../../../lib/db';
import { findMapByIdOrName, getGameDisplay, getModeScoringType } from '../../../src/lib/games';
import { getAnnouncementMessage } from '../../../src/lib/discord-messages';
import { getMatch, getMatchTeams, getTeamAssignments, listTeamsWithParticipants } from '../../../src/lib/matches';

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
 * Fetch match start data (game display, scoring type, team names and voice channels).
 */
export async function fetchMatchStartData(matchId: string, gameId: string): Promise<MatchStartData> {
  const defaultData: MatchStartData = {
    gameName: gameId,
    gameColor: 0xe74c3c, // Red color for match start
    blueTeamVoiceChannel: null,
    redTeamVoiceChannel: null
  };

  try {
    const matchRow = await getMatch(pgDb, matchId);
    const gameRow = matchRow ? await getGameDisplay(pgDb, matchRow.game_id) : undefined;
    if (matchRow && gameRow) {
      const scoringType = (matchRow.mode_id ? await getModeScoringType(pgDb, matchRow.game_id, matchRow.mode_id) : undefined) ?? 'Normal';
      const teams = (await getMatchTeams(pgDb, matchId)).filter(t => !t.is_reserve);
      const blueTeam = teams.find(t => t.team_order === 0);
      const redTeam = teams.find(t => t.team_order === 1);

      // FFA/Position matches have one match_teams row per participant, so
      // team 0/1 are just the first two players: never present them as sides.
      const isTeamMode = scoringType === 'Normal';

      return {
        gameName: gameRow.name,
        scoringType,
        gameColor: gameRow.color ? parseInt(gameRow.color.replace('#', ''), 16) : defaultData.gameColor,
        blueTeamVoiceChannel: blueTeam?.voice_channel_id || null,
        redTeamVoiceChannel: redTeam?.voice_channel_id || null,
        team1Name: isTeamMode ? (blueTeam?.team_name || matchRow.team1_name || undefined) : undefined,
        team2Name: isTeamMode ? (redTeam?.team_name || matchRow.team2_name || undefined) : undefined
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
  maps: string[],
  gameId: string
): Promise<string> {
  let mapList = maps.join(', '); // Fallback to IDs

  try {
    const mapNames: string[] = [];

    for (const mapId of maps) {
      const cleanedMapId = cleanMapId(mapId);

      // Get map name from database
      const mapData = await findMapByIdOrName(pgDb, gameId, cleanedMapId);

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
 * Fetch team assignments: blue / red / reserves, derived from each participant's match team.
 */
export async function fetchTeamAssignments(matchId: string): Promise<TeamFields> {
  try {
    return await getTeamAssignments(pgDb, matchId);
  } catch (error) {
    logger.error('Error fetching team assignments for match start:', error);
  }

  return { blueTeam: [], redTeam: [], reserves: [] };
}

/**
 * Fetch all match_teams rows with their participants for N-team support.
 */
export async function fetchMatchTeamRows(matchId: string): Promise<MatchTeamRow[]> {
  try {
    const teams = await listTeamsWithParticipants(pgDb, matchId);
    return teams.map(team => ({
      id: team.id,
      team_name: team.team_name,
      team_color: team.team_color ?? undefined,
      team_order: team.team_order,
      voice_channel_id: team.voice_channel_id ?? undefined,
      is_reserve: team.is_reserve,
      participants: team.participants,
    }));
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
  matchId: string,
  client: any
): Promise<string | null> {
  try {
    const originalMessage = await getAnnouncementMessage(pgDb, matchId);

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
