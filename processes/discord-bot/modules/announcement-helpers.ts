/**
 * Helper functions for announcement embed building
 */

import { AttachmentBuilder } from 'discord.js';
import { logger } from '../../../src/lib/logger/server';
import { cleanMapId } from '../../../src/lib/utils/map-utils';
import type { Database } from '../../../lib/database/connection';
import * as path from 'path';
import * as fs from 'fs';

export interface MatchStartData {
  gameName: string;
  gameColor: number;
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
    }>(`
      SELECT g.name as game_name, g.color as game_color, g.icon_url as game_icon,
             m.blue_team_voice_channel, m.red_team_voice_channel,
             m.team1_name, m.team2_name
      FROM matches m
      JOIN games g ON m.game_id = g.id
      WHERE m.id = ?
    `, [matchId]);

    if (matchData) {
      return {
        gameName: matchData.game_name,
        gameColor: matchData.game_color ? parseInt(matchData.game_color.replace('#', ''), 16) : defaultData.gameColor,
        blueTeamVoiceChannel: matchData.blue_team_voice_channel || null,
        redTeamVoiceChannel: matchData.red_team_voice_channel || null,
        team1Name: matchData.team1_name,
        team2Name: matchData.team2_name
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
 * Fetch team assignments from database
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
    const participants = await db.all<Participant>(`
      SELECT username, team_assignment, discord_user_id
      FROM match_participants
      WHERE match_id = ?
      ORDER BY team_assignment ASC, username ASC
    `, [matchId]);

    if (participants && participants.length > 0) {
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
export function attachEventImage(imageUrl: string): AttachmentBuilder | undefined {
  if (!imageUrl || !imageUrl.trim()) {
    return undefined;
  }

  try {
    const imagePath = path.join(process.cwd(), 'public', imageUrl.replace(/^\//, ''));

    if (fs.existsSync(imagePath)) {
      return new AttachmentBuilder(imagePath, {
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
