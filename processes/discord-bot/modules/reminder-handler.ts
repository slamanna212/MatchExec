import {
  Client,
  EmbedBuilder
} from 'discord.js';
import { Database } from '../../../lib/database/connection';
import { DiscordSettings, DiscordChannel } from '../../../shared/types';

export class ReminderHandler {
  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null
  ) {}

  async sendPlayerReminders(matchId: string): Promise<boolean> {
    if (!this.client.isReady()) {
      console.warn('⚠️ Bot not ready');
      return false;
    }

    if (!this.db) {
      console.error('❌ Database not available');
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
        [key: string]: any;
      }>(`
        SELECT m.*, g.name as game_name, g.color as game_color
        FROM matches m
        LEFT JOIN games g ON m.game_id = g.id
        WHERE m.id = ?
      `, [matchId]);

      if (!matchData) {
        console.error('❌ Match not found for player reminders:', matchId);
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
      let failureCount = 0;

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
          failureCount++;
          console.error(`❌ Failed to send player reminder DM to ${participant.username} (${participant.discord_user_id}):`, error);
        }
      }

      const totalParticipants = participants.length;

      return successCount > 0; // Success if at least one DM was sent

    } catch (error) {
      console.error('❌ Error sending player reminders:', error);
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
      console.warn('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for signup updates
    const signupChannels = await this.getChannelsForNotificationType('signup_updates');
    
    if (signupChannels.length === 0) {
      return true; // Not an error, just no channels configured
    }

    try {
      // Get match data
      const matchData = await this.db?.get<{
        id: string;
        name: string;
        game_id: string;
        game_color?: string;
        max_participants?: number;
        [key: string]: any;
      }>(`
        SELECT m.*, g.name as game_name, g.max_signups, g.color as game_color
        FROM matches m
        LEFT JOIN games g ON m.game_id = g.id
        WHERE m.id = ?
      `, [matchId]);

      // Get announcement message info for linking
      const announcementMessage = await this.db?.get<{
        message_id: string;
        channel_id: string;
      }>(`
        SELECT message_id, channel_id
        FROM discord_match_messages
        WHERE match_id = ? AND message_type = 'announcement'
        LIMIT 1
      `, [matchId]);

      if (!matchData) {
        console.error('❌ Match not found for signup notification:', matchId);
        return false;
      }

      // Parse game color or use default green
      let gameColor = 0x00ff00; // default green for positive action
      if (matchData.game_color) {
        try {
          gameColor = parseInt(matchData.game_color.replace('#', ''), 16);
        } catch (error) {
          console.warn('⚠️ Invalid game color format, using default green:', matchData.game_color);
        }
      }

      // Create signup embed
      const embed = new EmbedBuilder()
        .setTitle('🎮 New Player Signed Up!')
        .setDescription(`**${signupInfo.username}** joined **${matchData.name}**`)
        .setColor(gameColor)
        .addFields(
          { 
            name: '👤 Player', 
            value: `<@${signupInfo.discordUserId}>`, 
            inline: true 
          },
          { 
            name: '🎯 Match', 
            value: matchData.name, 
            inline: true 
          },
          { 
            name: '👥 Total Players', 
            value: `${signupInfo.participantCount}${matchData.max_signups ? `/${matchData.max_signups}` : ''}`, 
            inline: true 
          }
        )
        .setTimestamp();

      // Add key signup data fields if available
      const displayFields: string[] = [];
      for (const [key, value] of Object.entries(signupInfo.signupData)) {
        if (value && displayFields.length < 3) { // Limit to 3 additional fields
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
      if (announcementMessage?.message_id && announcementMessage?.channel_id && this.client.guilds.cache.first()) {
        const guildId = this.client.guilds.cache.first()?.id;
        const messageLink = `https://discord.com/channels/${guildId}/${announcementMessage.channel_id}/${announcementMessage.message_id}`;
        embed.addFields({
          name: '🔗 View Full Match Info',
          value: `[Click here to see the complete event details](${messageLink})`,
          inline: false
        });
      }

      let successCount = 0;

      // Send to all configured signup update channels
      for (const channelConfig of signupChannels) {
        try {
          const signupChannel = await this.client.channels.fetch(channelConfig.discord_channel_id);

          if (signupChannel?.isTextBased() && 'send' in signupChannel) {
            // Send signup notification
            await signupChannel.send({
              embeds: [embed]
            });
            
            successCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to send signup notification to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        console.error('❌ Failed to send signup notification to any channels');
        return false;
      }

      return true;

    } catch (error) {
      console.error('❌ Error sending signup notification:', error);
      return false;
    }
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
      [key: string]: any;
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
    // Parse game color or use default
    let gameColor = 0x4caf50; // default green for reminder
    if (matchData.game_color) {
      try {
        gameColor = parseInt(matchData.game_color.replace('#', ''), 16);
      } catch (error) {
        console.error('Error parsing game color:', error);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎮 Match Reminder: ${matchData.name}`)
      .setDescription(matchData.description || 'Your match is starting soon!')
      .setColor(gameColor)
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Good luck and have fun!' });

    // Add match time if available
    if (matchData.start_date) {
      const startTime = new Date(matchData.start_date);
      const unixTimestamp = Math.floor(startTime.getTime() / 1000);
      embed.addFields(
        { name: '🕐 Match Time', value: `<t:${unixTimestamp}:F>`, inline: true },
        { name: '⏰ Starting', value: `<t:${unixTimestamp}:R>`, inline: true },
        { name: '\u200b', value: '\u200b', inline: true } // Empty field to force new line
      );
    }

    // Add game info
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

      // Add voice channel if assigned to a team with a voice channel
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
    }

    // Add link to original announcement if available
    if (announcementMessage && this.client.guilds.cache.first()) {
      const guildId = this.client.guilds.cache.first()?.id;
      const messageLink = `https://discord.com/channels/${guildId}/${announcementMessage.channel_id}/${announcementMessage.message_id}`;
      embed.addFields({
        name: '🔗 Match Details',
        value: `[View Full Match Info](${messageLink})`,
        inline: false
      });
    }

    return embed;
  }

  async sendMapCodePMs(matchId: string, mapName: string, mapCode: string): Promise<boolean> {
    if (!this.client.isReady()) {
      console.warn('⚠️ Bot not ready');
      return false;
    }

    if (!this.db) {
      console.error('❌ Database not available');
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
        console.error('❌ Match not found for map code PMs:', matchId);
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
        console.log('ℹ️ No participants configured to receive map codes for match:', matchId);
        return true; // Not an error, just no one to notify
      }

      let successCount = 0;
      let failureCount = 0;

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
          failureCount++;
          console.error(`❌ Failed to send map code DM to ${participant.username} (${participant.discord_user_id}):`, error);
        }
      }

      console.log(`📱 Map code PMs sent: ${successCount} successful, ${failureCount} failed`);
      return successCount > 0; // Success if at least one DM was sent

    } catch (error) {
      console.error('❌ Error sending map code PMs:', error);
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
        console.error('Error parsing game color:', error);
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
        console.error(`Invalid notification type: ${notificationType}`);
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
      console.error(`Error fetching channels for ${notificationType}:`, error);
      return [];
    }
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}