import type {
  Client} from 'discord.js';
import {
  EmbedBuilder
} from 'discord.js';
import type { Database } from '../../../lib/database/connection';
import type { DiscordSettings, DiscordChannel } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';
import { capTitle } from './utils';
import { db as pgDb } from '../../../lib/db';
import { eq, getTableColumns } from 'drizzle-orm';
import { games, matches } from '../../../lib/db/schema';
import { listChannelsForNotification } from '../../../src/lib/discord-channels';
import { getAnnouncementMessage } from '../../../src/lib/discord-messages';
import { getBlueRedChannels, getMatchWithGame, listDmRecipients } from '../../../src/lib/matches';
import { getTournamentSignupEventData } from '../../../src/lib/tournaments';

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
  matchId: string,
  isTournament: boolean
): Promise<EventData | null> {
  if (!isTournament) {
    const [row] = await pgDb.select({ ...getTableColumns(matches), game_name: games.name, max_signups: games.max_signups, game_color: games.color })
      .from(matches).leftJoin(games, eq(matches.game_id, games.id)).where(eq(matches.id, matchId));
    return (row as unknown as EventData | undefined) ?? null;
  }
  return ((await getTournamentSignupEventData(pgDb, matchId)) as unknown as EventData | undefined) ?? null;
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
      const matchRow = await getMatchWithGame(pgDb, matchId);
      const channels = await getBlueRedChannels(pgDb, matchId);
      const matchData = matchRow ? {
        ...matchRow,
        description: matchRow.description ?? undefined,
        start_date: matchRow.start_date.toISOString(),
        game_name: matchRow.game_name ?? undefined,
        game_color: matchRow.game_color ?? undefined,
        blue_team_voice_channel: channels.blue,
        red_team_voice_channel: channels.red,
        event_image_url: matchRow.event_image_url ?? undefined,
      } : undefined;

      if (!matchData) {
        logger.error('❌ Match not found for player reminders:', matchId);
        return false;
      }

      // Get participants with Discord user IDs
      const participants = await listDmRecipients(pgDb, matchId);

      if (!participants || participants.length === 0) {
        return true; // Not an error, just no one to notify
      }

      // Get announcement message link for embed
      const announcementMessage = await getAnnouncementMessage(pgDb, matchId);

      let successCount = 0;

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
      const eventData = await getEventDataForSignup(matchId, isTournament);

      if (!eventData) {
        logger.error(`❌ ${isTournament ? 'Tournament' : 'Match'} not found for signup notification:`, matchId);
        return false;
      }

      // Get announcement message info for linking
      const announcementMessage = await getAnnouncementMessage(pgDb, matchId);

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
    let emoji = '🟡';
    if (teamAssignment === 'blue') emoji = '🔵';
    else if (teamAssignment === 'red') emoji = '🔴';
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
      signup_data?: unknown;
    },
    announcementMessage?: {
      message_id: string;
      channel_id: string;
    }
  ): Promise<EmbedBuilder> {
    const gameColor = this.parseGameColor(matchData.game_color);

    const embed = new EmbedBuilder()
      .setTitle(capTitle(`🎮 Match Reminder: ${matchData.name}`))
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
      const matchRow = await getMatchWithGame(pgDb, matchId);
      const matchData = matchRow ? { ...matchRow, game_name: matchRow.game_name ?? undefined, game_color: matchRow.game_color ?? undefined } : undefined;

      if (!matchData) {
        logger.error('❌ Match not found for map code PMs:', matchId);
        return false;
      }

      // Get participants who should receive map codes
      const participants = await listDmRecipients(pgDb, matchId, { commandersOnly: true });

      if (!participants || participants.length === 0) {
        logger.debug('ℹ️ No participants configured to receive map codes for match:', matchId);
        return true; // Not an error, just no one to notify
      }

      let successCount = 0;

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
      .setTitle(capTitle(`🗺️ Map Code: ${mapName}`))
      .setDescription(`Here's your map code for **${matchData.name}**`)
      .setColor(gameColor)
      .addFields(
        {
          name: '🔢 Map Code',
          value: `\`${mapCode}\``,
          inline: false
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
      let teamEmoji = '🟡';
      if (participant.team_assignment === 'blue') teamEmoji = '🔵';
      else if (participant.team_assignment === 'red') teamEmoji = '🔴';
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
    try {
      const channels = await listChannelsForNotification(pgDb, notificationType);

      return channels.map(channel => ({
        id: channel.id,
        discord_channel_id: channel.discord_channel_id,
        channel_name: channel.channel_name ?? undefined,
        channel_type: channel.channel_type as 'text' | 'voice',
        send_announcements: channel.send_announcements,
        send_reminders: channel.send_reminders,
        send_match_start: channel.send_match_start,
        send_signup_updates: channel.send_signup_updates,
        send_health_alerts: channel.send_health_alerts,
        last_name_refresh: channel.last_name_refresh?.toISOString(),
        created_at: channel.created_at.toISOString(),
        updated_at: channel.updated_at.toISOString()
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