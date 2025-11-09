import type {
  Client} from 'discord.js';
import {
  EmbedBuilder
} from 'discord.js';
import type { Database } from '../../../lib/database/connection';
import type { DiscordSettings, DiscordChannel } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';

interface EventData {
  id: string;
  name: string;
  game_id: string;
  game_color?: string;
  max_signups?: number;
  [key: string]: unknown;
}

interface AnnouncementMessageData {
  message_id: string;
  channel_id: string;
}

/**
 * Retrieves event data for signup notification (match or tournament)
 */
async function getEventDataForSignup(
  db: Database,
  matchId: string,
  isTournament: boolean
): Promise<EventData | null> {
  const query = isTournament ? `
    SELECT t.*, g.name as game_name, t.max_participants as max_signups, g.color as game_color
    FROM tournaments t
    LEFT JOIN games g ON t.game_id = g.id
    WHERE t.id = ?
  ` : `
    SELECT m.*, g.name as game_name, g.max_signups, g.color as game_color
    FROM matches m
    LEFT JOIN games g ON m.game_id = g.id
    WHERE m.id = ?
  `;

  const result = await db.get<EventData>(query, [matchId]);
  return result ?? null;
}

/**
 * Builds signup notification embed
 */
function buildSignupEmbed(
  signupInfo: { username: string; discordUserId: string; signupData: { [key: string]: string }; participantCount: number },
  eventData: EventData,
  isTournament: boolean,
  announcementMessage: AnnouncementMessageData | null,
  guildId: string | undefined
): EmbedBuilder {
  // Parse game color or use default green
  let gameColor = 0x00ff00;
  if (eventData.game_color) {
    try {
      gameColor = parseInt(eventData.game_color.replace('#', ''), 16);
    } catch {
      logger.warning('⚠️ Invalid game color format, using default green:', eventData.game_color);
    }
  }

  const eventType = isTournament ? 'Tournament' : 'Match';
  const embed = new EmbedBuilder()
    .setTitle('🎮 New Player Signed Up!')
    .setDescription(`**${signupInfo.username}** joined **${eventData.name}**`)
    .setColor(gameColor)
    .addFields(
      {
        name: '👤 Player',
        value: `<@${signupInfo.discordUserId}>`,
        inline: true
      },
      {
        name: `🎯 ${eventType}`,
        value: eventData.name,
        inline: true
      },
      {
        name: '👥 Total Players',
        value: `${signupInfo.participantCount}${eventData.max_signups ? `/${eventData.max_signups}` : ''}`,
        inline: true
      }
    )
    .setTimestamp();

  // Add key signup data fields if available
  const displayFields: string[] = [];
  for (const [key, value] of Object.entries(signupInfo.signupData)) {
    if (value && displayFields.length < 3) {
      const fieldName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      displayFields.push(`**${fieldName}:** ${value}`);
    }
  }

  if (displayFields.length > 0) {
    embed.addFields({
      name: '📝 Player Info',
      value: displayFields.join('\n'),
      inline: false
    });
  }

  // Add link to full match info if announcement message exists
  if (announcementMessage?.message_id && announcementMessage?.channel_id && guildId) {
    const messageLink = `https://discord.com/channels/${guildId}/${announcementMessage.channel_id}/${announcementMessage.message_id}`;
    embed.addFields({
      name: '🔗 View Full Match Info',
      value: `[Click here to see the complete event details](${messageLink})`,
      inline: false
    });
  }

  return embed;
}

/**
 * Sends embed to all configured channels
 */
async function sendEmbedToChannels(
  client: Client,
  channels: DiscordChannel[],
  embed: EmbedBuilder
): Promise<number> {
  let successCount = 0;

  for (const channelConfig of channels) {
    try {
      const channel = await client.channels.fetch(channelConfig.discord_channel_id);

      if (channel?.isTextBased() && 'send' in channel) {
        await channel.send({ embeds: [embed] });
        successCount++;
      }
    } catch (error) {
      logger.error(`❌ Failed to send notification to channel ${channelConfig.discord_channel_id}:`, error);
    }
  }

  return successCount;
}

export class ReminderHandler {
  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null
  ) {}

  async sendPlayerReminders(matchId: string): Promise<boolean> {
    if (!this.client.isReady()) {
      logger.warning('⚠️ Bot not ready');
      return false;
    }

    if (!this.db) {
      logger.error('❌ Database not available');
      return false;
    }

    try {
      // Get match data with game information and voice channels
      const matchData = await this.db.get<{
        id: string;
        name: string;
        description?: string;
        start_date?: string;
        game_name?: string;
        game_color?: string;
        blue_team_voice_channel?: string;
        red_team_voice_channel?: string;
        event_image_url?: string;
        [key: string]: unknown;
      }>(`
        SELECT m.*, g.name as game_name, g.color as game_color
        FROM matches m
        LEFT JOIN games g ON m.game_id = g.id
        WHERE m.id = ?
      `, [matchId]);

      if (!matchData) {
        logger.error('❌ Match not found for player reminders:', matchId);
        return false;
      }

      // Get participants with Discord user IDs
      const participants = await this.db.all<{
        discord_user_id: string;
        username: string;
        team_assignment?: string;
        signup_data?: string;
      }>(`
        SELECT discord_user_id, username, team_assignment, signup_data
        FROM match_participants
        WHERE match_id = ? AND discord_user_id IS NOT NULL
      `, [matchId]);

      if (!participants || participants.length === 0) {
        return true; // Not an error, just no one to notify
      }

      // Get announcement message link for embed
      const announcementMessage = await this.db.get<{
        message_id: string;
        channel_id: string;
      }>(`
        SELECT message_id, channel_id
        FROM discord_match_messages
        WHERE match_id = ? AND message_type = 'announcement'
        LIMIT 1
      `, [matchId]);

      let successCount = 0;
      // let _failureCount = 0; // Commented out unused variable

      // Send DM to each participant
      for (const participant of participants) {
        try {
          const user = await this.client.users.fetch(participant.discord_user_id);
          
          // Create personalized embed for this player
          const embed = await this.createPlayerReminderEmbed(
            matchData, 
            participant, 
            announcementMessage
          );

          await user.send({
            embeds: [embed]
          });

          successCount++;

        } catch (error) {
          // failureCount++; // Commented out unused variable
          logger.error(`❌ Failed to send player reminder DM to ${participant.username} (${participant.discord_user_id}):`, error);
        }
      }


      return successCount > 0; // Success if at least one DM was sent

    } catch (error) {
      logger.error('❌ Error sending player reminders:', error);
      return false;
    }
  }

  async sendSignupNotification(matchId: string, signupInfo: {
    username: string;
    discordUserId: string;
    signupData: {[key: string]: string};
    participantCount: number;
  }): Promise<boolean> {
    if (!this.client.isReady()) {
      logger.warning('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for signup updates
    const signupChannels = await this.getChannelsForNotificationType('signup_updates');

    if (signupChannels.length === 0) {
      return true; // Not an error, just no channels configured
    }

    try {
      // Check if this is a tournament or match
      const isTournament = matchId.startsWith('tournament_');

      // Get event data using helper function
      const eventData = await getEventDataForSignup(this.db, matchId, isTournament);

      if (!eventData) {
        logger.error(`❌ ${isTournament ? 'Tournament' : 'Match'} not found for signup notification:`, matchId);
        return false;
      }

      // Get announcement message info for linking
      const announcementMessage = await this.db?.get<AnnouncementMessageData>(`
        SELECT message_id, channel_id
        FROM discord_match_messages
        WHERE match_id = ? AND message_type = 'announcement'
        LIMIT 1
      `, [matchId]);

      // Build signup embed using helper function
      const guildId = this.client.guilds.cache.first()?.id;
      const embed = buildSignupEmbed(signupInfo, eventData, isTournament, announcementMessage || null, guildId);

      // Send to all configured channels using helper function
      const successCount = await sendEmbedToChannels(this.client, signupChannels, embed);

      if (successCount === 0) {
        logger.error('❌ Failed to send signup notification to any channels');
        return false;
      }

      return true;

    } catch (error) {
      logger.error('❌ Error sending signup notification:', error);
      return false;
    }
  }

  /**
   * Parse game color from match data
   */
  private parseGameColor(gameColor?: string): number {
    if (!gameColor) return 0x4caf50;

    try {
      return parseInt(gameColor.replace('#', ''), 16);
    } catch (error) {
      logger.error('Error parsing game color:', error);
      return 0x4caf50;
    }
  }

  /**
   * Add match time fields to embed
   */
  private addMatchTimeFields(embed: EmbedBuilder, startDate: string): void {
    const startTime = new Date(startDate);
    const unixTimestamp = Math.floor(startTime.getTime() / 1000);
    embed.addFields(
      { name: '🕐 Match Time', value: `<t:${unixTimestamp}:F>`, inline: true },
      { name: '⏰ Starting', value: `<t:${unixTimestamp}:R>`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true }
    );
  }

  /**
   * Check if match is single-team configuration
   */
  private isSingleTeamMatch(blueChannel?: string, redChannel?: string): boolean {
    return !!blueChannel && !redChannel;
  }

  /**
   * Get team display info
   */
  private getTeamDisplayInfo(teamAssignment: string): { emoji: string; name: string } {
    const emoji = teamAssignment === 'blue' ? '🔵' : teamAssignment === 'red' ? '🔴' : '🟡';
    const name = teamAssignment.charAt(0).toUpperCase() + teamAssignment.slice(1);
    return { emoji, name };
  }

  /**
   * Add team and voice channel fields
   */
  private addTeamAndVoiceFields(
    embed: EmbedBuilder,
    participant: { team_assignment?: string },
    matchData: { blue_team_voice_channel?: string; red_team_voice_channel?: string }
  ): void {
    const isSingleTeam = this.isSingleTeamMatch(matchData.blue_team_voice_channel, matchData.red_team_voice_channel);

    if (participant.team_assignment && participant.team_assignment !== 'unassigned') {
      const { emoji, name } = this.getTeamDisplayInfo(participant.team_assignment);

      embed.addFields({
        name: '👥 Your Team',
        value: `${emoji} ${name} Team`,
        inline: true
      });

      if (participant.team_assignment === 'blue' && matchData.blue_team_voice_channel) {
        embed.addFields({
          name: '🎙️ Voice Channel',
          value: `<#${matchData.blue_team_voice_channel}>`,
          inline: true
        });
      } else if (participant.team_assignment === 'red' && matchData.red_team_voice_channel) {
        embed.addFields({
          name: '🎙️ Voice Channel',
          value: `<#${matchData.red_team_voice_channel}>`,
          inline: true
        });
      }
    } else if (isSingleTeam) {
      embed.addFields({
        name: '🎙️ Voice Channel',
        value: `<#${matchData.blue_team_voice_channel}>`,
        inline: true
      });
    }
  }

  /**
   * Add announcement link to embed
   */
  private addAnnouncementLink(
    embed: EmbedBuilder,
    announcementMessage?: { message_id: string; channel_id: string }
  ): void {
    if (!announcementMessage || !this.client.guilds.cache.first()) return;

    const guildId = this.client.guilds.cache.first()?.id;
    const messageLink = `https://discord.com/channels/${guildId}/${announcementMessage.channel_id}/${announcementMessage.message_id}`;
    embed.addFields({
      name: '🔗 Match Details',
      value: `[View Full Match Info](${messageLink})`,
      inline: false
    });
  }

  private async createPlayerReminderEmbed(
    matchData: {
      name: string;
      description?: string;
      start_date?: string;
      game_name?: string;
      game_color?: string;
      blue_team_voice_channel?: string;
      red_team_voice_channel?: string;
      [key: string]: unknown;
    },
    participant: {
      username: string;
      team_assignment?: string;
      signup_data?: string;
    },
    announcementMessage?: {
      message_id: string;
      channel_id: string;
    }
  ): Promise<EmbedBuilder> {
    const gameColor = this.parseGameColor(matchData.game_color);

    const embed = new EmbedBuilder()
      .setTitle(`🎮 Match Reminder: ${matchData.name}`)
      .setDescription(matchData.description || 'Your match is starting soon!')
      .setColor(gameColor)
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Good luck and have fun!' });

    if (matchData.start_date) {
      this.addMatchTimeFields(embed, matchData.start_date);
    }

    if (matchData.game_name) {
      embed.addFields({ name: '🎮 Game', value: matchData.game_name, inline: true });
    }

    this.addTeamAndVoiceFields(embed, participant, matchData);
    this.addAnnouncementLink(embed, announcementMessage);

    return embed;
  }

  async sendMapCodePMs(matchId: string, mapName: string, mapCode: string): Promise<boolean> {
    if (!this.client.isReady()) {
      logger.warning('⚠️ Bot not ready');
      return false;
    }

    if (!this.db) {
      logger.error('❌ Database not available');
      return false;
    }

    try {
      // Get match data
      const matchData = await this.db.get<{
        id: string;
        name: string;
        game_name?: string;
        game_color?: string;
      }>(`
        SELECT m.*, g.name as game_name, g.color as game_color
        FROM matches m
        LEFT JOIN games g ON m.game_id = g.id
        WHERE m.id = ?
      `, [matchId]);

      if (!matchData) {
        logger.error('❌ Match not found for map code PMs:', matchId);
        return false;
      }

      // Get participants who should receive map codes
      const participants = await this.db.all<{
        discord_user_id: string;
        username: string;
        team_assignment?: string;
      }>(`
        SELECT discord_user_id, username, team_assignment
        FROM match_participants
        WHERE match_id = ? AND discord_user_id IS NOT NULL AND receives_map_codes = 1
      `, [matchId]);

      if (!participants || participants.length === 0) {
        logger.debug('ℹ️ No participants configured to receive map codes for match:', matchId);
        return true; // Not an error, just no one to notify
      }

      let successCount = 0;
      // let _failureCount = 0; // Commented out unused variable

      // Send DM to each participant who should receive map codes
      for (const participant of participants) {
        try {
          const user = await this.client.users.fetch(participant.discord_user_id);
          
          // Create map code embed
          const embed = await this.createMapCodeEmbed(
            matchData, 
            participant,
            mapName,
            mapCode
          );

          await user.send({
            embeds: [embed]
          });

          successCount++;

        } catch (error) {
          // failureCount++; // Commented out unused variable
          logger.error(`❌ Failed to send map code DM to ${participant.username} (${participant.discord_user_id}):`, error);
        }
      }

      logger.debug(`📱 Map code PMs sent: ${successCount} successful`);
      return successCount > 0; // Success if at least one DM was sent

    } catch (error) {
      logger.error('❌ Error sending map code PMs:', error);
      return false;
    }
  }

  private async createMapCodeEmbed(
    matchData: {
      name: string;
      game_name?: string;
      game_color?: string;
    }, 
    participant: {
      username: string;
      team_assignment?: string;
    },
    mapName: string,
    mapCode: string
  ): Promise<EmbedBuilder> {
    // Parse game color or use default
    let gameColor = 0x2196f3; // default blue for map codes
    if (matchData.game_color) {
      try {
        gameColor = parseInt(matchData.game_color.replace('#', ''), 16);
      } catch (error) {
        logger.error('Error parsing game color:', error);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`🗺️ Map Code: ${mapName}`)
      .setDescription(`Here's your map code for **${matchData.name}**`)
      .setColor(gameColor)
      .addFields(
        { 
          name: '🔢 Map Code', 
          value: `\`${mapCode}\``, 
          inline: false 
        },
        { 
          name: '🗺️ Map Name', 
          value: mapName, 
          inline: true 
        }
      )
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Good luck!' });

    // Add game info if available
    if (matchData.game_name) {
      embed.addFields({ name: '🎮 Game', value: matchData.game_name, inline: true });
    }

    // Add team assignment if available
    if (participant.team_assignment && participant.team_assignment !== 'unassigned') {
      const teamEmoji = participant.team_assignment === 'blue' ? '🔵' : 
                       participant.team_assignment === 'red' ? '🔴' : '🟡';
      const teamName = participant.team_assignment.charAt(0).toUpperCase() + participant.team_assignment.slice(1);
      
      embed.addFields({ 
        name: '👥 Your Team', 
        value: `${teamEmoji} ${teamName} Team`, 
        inline: true 
      });
    }

    return embed;
  }

  private async getChannelsForNotificationType(notificationType: 'announcements' | 'reminders' | 'match_start' | 'signup_updates'): Promise<DiscordChannel[]> {
    if (!this.db) {
      return [];
    }

    try {
      const columnMap = {
        'announcements': 'send_announcements',
        'reminders': 'send_reminders', 
        'match_start': 'send_match_start',
        'signup_updates': 'send_signup_updates'
      };

      const column = columnMap[notificationType];
      if (!column) {
        logger.error(`Invalid notification type: ${notificationType}`);
        return [];
      }

      const channels = await this.db.all<{
        id: string;
        discord_channel_id: string;
        channel_name: string;
        channel_type: string;
        send_announcements: number;
        send_reminders: number;
        send_match_start: number;
        send_signup_updates: number;
        created_at: string;
        updated_at: string;
      }>(`
        SELECT id, discord_channel_id, channel_name, channel_type, 
               send_announcements, send_reminders, send_match_start, send_signup_updates,
               created_at, updated_at
        FROM discord_channels 
        WHERE ${column} = 1
      `);

      return channels.map(channel => ({
        id: channel.id,
        discord_channel_id: channel.discord_channel_id,
        channel_name: channel.channel_name,
        channel_type: channel.channel_type as 'text' | 'voice',
        send_announcements: Boolean(channel.send_announcements),
        send_reminders: Boolean(channel.send_reminders),
        send_match_start: Boolean(channel.send_match_start),
        send_signup_updates: Boolean(channel.send_signup_updates),
        created_at: channel.created_at,
        updated_at: channel.updated_at
      }));

    } catch (error) {
      logger.error(`Error fetching channels for ${notificationType}:`, error);
      return [];
    }
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}