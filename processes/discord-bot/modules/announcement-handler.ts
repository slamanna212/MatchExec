import fs from 'fs';
import path from 'path';
import {
  Client,
  Message,
  EmbedBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle
} from 'discord.js';
import { Database } from '../../../lib/database/connection';
import { DiscordSettings, DiscordChannel } from '../../../shared/types';

export class AnnouncementHandler {
  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null
  ) {}

  async postEventAnnouncement(eventData: {
    id: string;
    name: string;
    description: string;
    game_id: string;
    type: 'competitive' | 'casual';
    maps?: string[];
    max_participants: number;
    guild_id: string;
    livestream_link?: string;
    event_image_url?: string;
    start_date?: string;
  }) {
    if (!this.client.isReady()) {
      console.warn('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for announcements
    const announcementChannels = await this.getChannelsForNotificationType('announcements');
    
    if (announcementChannels.length === 0) {
      console.warn('⚠️ No channels configured for announcements');
      return false;
    }

    try {
      // Create event embed with attachment  
      const { embed, attachment } = await this.createEventEmbedWithAttachment(
        eventData.name,
        eventData.description,
        eventData.game_id,
        eventData.type,
        eventData.maps || [],
        eventData.max_participants,
        eventData.livestream_link,
        eventData.event_image_url,
        eventData.start_date
      );

      // Create signup button
      const signupButton = new ButtonBuilder()
        .setCustomId(`signup_${eventData.id}`)
        .setLabel('🎮 Sign Up')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(signupButton);

      // Determine what to mention based on settings
      let mentionText = '';
      if (this.settings?.mention_everyone) {
        mentionText = '@everyone';
      } else if (this.settings?.announcement_role_id) {
        mentionText = `<@&${this.settings.announcement_role_id}>`;
      }

      // Prepare message options
      const messageOptions: any = {
        content: mentionText, // Add the mention above the embed
        embeds: [embed],
        components: [row]
      };

      // Add attachment if image exists
      if (attachment) {
        messageOptions.files = [attachment];
      }

      let successCount = 0;
      let mainMessage: Message | null = null;

      // Send to all configured announcement channels
      for (const channelConfig of announcementChannels) {
        try {
          const announcementChannel = await this.client.channels.fetch(channelConfig.discord_channel_id);

          if (announcementChannel?.isTextBased() && 'send' in announcementChannel) {
            // Send announcement
            const message = await announcementChannel.send(messageOptions);
            
            if (!mainMessage) {
              mainMessage = message; // Use first successful message for event creation
            }
            
            successCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to send announcement to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        console.error('❌ Failed to send announcement to any channels');
        return false;
      }

      console.log(`✅ Event announcement posted to ${successCount} channel(s) for: ${eventData.name}`);
      return { success: true, mainMessage, successCount };

    } catch (error) {
      console.error('❌ Error posting event announcement:', error);
      return false;
    }
  }

  async createMapsThread(message: Message, eventName: string, gameId: string, maps: string[]): Promise<any> {
    try {
      // Create thread - using public thread for better visibility
      const thread = await message.startThread({
        name: `${eventName} Maps`,
        autoArchiveDuration: 1440, // 24 hours (in minutes)
        reason: 'Map details for event'
      });

      console.log(`✅ Created PUBLIC thread: ${thread.name} (ID: ${thread.id}) in channel ${message.channelId}`);

      // Create an embed for each map
      for (let i = 0; i < maps.length; i++) {
        const mapIdentifier = maps[i];
        const mapNumber = i + 1;
        const mapEmbedData = await this.createMapEmbed(gameId, mapIdentifier, mapNumber);
        if (mapEmbedData) {
          const messageOptions: any = { embeds: [mapEmbedData.embed] };
          if (mapEmbedData.attachment) {
            messageOptions.files = [mapEmbedData.attachment];
          }
          await thread.send(messageOptions);
        }
      }

      console.log(`✅ Created maps thread with ${maps.length} map embeds`);
      return thread;
    } catch (error) {
      console.error('❌ Error creating maps thread:', error);
      return null;
    }
  }

  private async createEventEmbedWithAttachment(
    name: string,
    description: string,
    gameId: string,
    type: string,
    maps: string[],
    maxParticipants: number,
    livestreamLink?: string,
    eventImageUrl?: string,
    startDate?: string
  ): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder }> {
    // Get game data from database for nice name and color
    let gameName = gameId;
    let gameColor = type === 'competitive' ? 0xff6b35 : 0x4caf50; // fallback colors
    
    if (this.db) {
      try {
        const gameData = await this.db.get<{name: string, color: string}>(`
          SELECT name, color FROM games WHERE id = ?
        `, [gameId]);
        
        console.log('Game data from database:', gameData);
        
        if (gameData) {
          gameName = gameData.name;
          if (gameData.color) {
            // Convert hex string to number (remove # and parse as hex)
            const colorHex = gameData.color.replace('#', '');
            gameColor = parseInt(colorHex, 16);
            console.log(`Using game color: ${gameData.color} -> ${gameColor} (0x${colorHex})`);
          } else {
            console.log('No color found for game, using fallback');
          }
        } else {
          console.log('No game data found for ID:', gameId);
        }
      } catch (error) {
        console.error('Error fetching game data:', error);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(name)
      .setDescription(description)
      .setColor(gameColor)
      .addFields(
        { name: '🎯 Game', value: gameName, inline: true },
        { name: '🏆 Ruleset', value: type === 'competitive' ? 'Competitive' : 'Casual', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Sign up to participate!' });

    // Add match time and countdown if start date is provided
    if (startDate) {
      const startTime = new Date(startDate);
      const unixTimestamp = Math.floor(startTime.getTime() / 1000);
      
      // Add match time in EDT and countdown
      embed.addFields(
        { name: '🕐 Match Time', value: `<t:${unixTimestamp}:F>`, inline: true },
        { name: '⏰ Countdown', value: `<t:${unixTimestamp}:R>`, inline: true }
      );
    }

    // Add maps count if provided (but not the actual maps - those go in thread)
    if (maps.length > 0) {
      embed.addFields({ 
        name: '🗺️ Maps', 
        value: `${maps.length} map${maps.length > 1 ? 's' : ''} selected - See thread for details`, 
        inline: false 
      });
    }

    // Add livestream link if provided
    if (livestreamLink && livestreamLink.trim()) {
      embed.addFields({
        name: '📺 Livestream',
        value: `[Watch Live](${livestreamLink})`,
        inline: true
      });
    }

    let attachment: AttachmentBuilder | undefined;

    // Add event image if provided - use as attachment like map images
    if (eventImageUrl && eventImageUrl.trim()) {
      try {
        // Convert URL path to file system path for local files
        const imagePath = path.join(process.cwd(), 'public', eventImageUrl.replace(/^\//, ''));
        
        if (fs.existsSync(imagePath)) {
          // Create attachment for the event image
          attachment = new AttachmentBuilder(imagePath, {
            name: `event_image.${path.extname(imagePath).slice(1)}`
          });
          
          // Use attachment://filename to reference the attached image
          embed.setImage(`attachment://event_image.${path.extname(imagePath).slice(1)}`);
          
          console.log(`✅ Added event image attachment: ${eventImageUrl}`);
        } else {
          console.warn(`⚠️ Event image not found: ${imagePath}`);
        }
      } catch (error) {
        console.error(`❌ Error handling event image ${eventImageUrl}:`, error);
      }
    }

    return { embed, attachment };
  }

  private async createMapEmbed(gameId: string, mapIdentifier: string, mapNumber?: number): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder } | null> {
    if (!this.db) return null;

    try {
      // Get map data from database
      const mapData = await this.db.get<{
        name: string, 
        image_url: string, 
        location: string,
        mode_id: string
      }>(`
        SELECT gm.name, gm.image_url, gm.location, gm.mode_id
        FROM game_maps gm
        WHERE gm.game_id = ? AND (gm.id = ? OR LOWER(gm.name) LIKE LOWER(?))
        LIMIT 1
      `, [gameId, mapIdentifier, `%${mapIdentifier}%`]);

      if (!mapData) {
        // Fallback embed for unknown maps
        const title = mapNumber ? `Map ${mapNumber}: ${mapIdentifier}` : `🗺️ ${mapIdentifier}`;
        return {
          embed: new EmbedBuilder()
            .setTitle(title)
            .setDescription('Map details not available')
            .setColor(0x95a5a6)
        };
      }

      // Get game mode name
      let modeName = mapData.mode_id;
      if (this.db) {
        try {
          const modeData = await this.db.get<{name: string}>(`
            SELECT name FROM game_modes WHERE id = ? AND game_id = ?
          `, [mapData.mode_id, gameId]);
          if (modeData) {
            modeName = modeData.name;
          }
        } catch (error) {
          console.error('Error fetching mode name:', error);
        }
      }

      // Get game color for consistent styling
      let gameColor = 0x95a5a6; // default gray
      try {
        const gameData = await this.db.get<{color: string}>(`
          SELECT color FROM games WHERE id = ?
        `, [gameId]);
        if (gameData?.color) {
          gameColor = parseInt(gameData.color.replace('#', ''), 16);
        }
      } catch (error) {
        console.error('Error fetching game color for map embed:', error);
      }

      const title = mapNumber ? `Map ${mapNumber}: ${mapData.name}` : `🗺️ ${mapData.name}`;
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(gameColor)
        .addFields(
          { name: '🎮 Mode', value: modeName, inline: true }
        );

      if (mapData.location) {
        embed.addFields({ name: '📍 Location', value: mapData.location, inline: true });
      }

      // Add image if available - use as attachment for local files
      if (mapData.image_url) {
        try {
          // Convert URL path to file system path for local files
          const imagePath = path.join(process.cwd(), 'public', mapData.image_url.replace(/^\//, ''));
          
          if (fs.existsSync(imagePath)) {
            // Create attachment for the map image
            const attachment = new AttachmentBuilder(imagePath, {
              name: `${mapData.name.replace(/[^a-zA-Z0-9]/g, '_')}.${path.extname(imagePath).slice(1)}`
            });
            
            // Use attachment://filename to reference the attached image
            const attachmentName = `${mapData.name.replace(/[^a-zA-Z0-9]/g, '_')}.${path.extname(imagePath).slice(1)}`;
            embed.setImage(`attachment://${attachmentName}`);
            
            return { embed, attachment };
          }
        } catch (error) {
          console.error(`Error handling map image for ${mapData.name}:`, error);
        }
      }

      return { embed };

    } catch (error) {
      console.error(`Error creating map embed for ${mapIdentifier}:`, error);
      return null;
    }
  }

  private async getChannelsForNotificationType(notificationType: 'announcements' | 'reminders' | 'match_start' | 'signup_updates'): Promise<DiscordChannel[]> {
    if (!this.db) {
      return [];
    }

    try {
      const columnMap = {
        'announcements': 'send_announcements',
        'reminders': 'send_reminders', 
        'match_start': 'send_match_start_notifications',
        'signup_updates': 'send_signup_updates'
      };

      const column = columnMap[notificationType];
      if (!column) {
        console.error(`Invalid notification type: ${notificationType}`);
        return [];
      }

      const channels = await this.db.all<{
        discord_channel_id: string;
        channel_name: string;
        channel_type: string;
        send_announcements: number;
        send_reminders: number;
        send_match_start_notifications: number;
        send_signup_updates: number;
      }>(`
        SELECT discord_channel_id, channel_name, channel_type, 
               send_announcements, send_reminders, send_match_start_notifications, send_signup_updates
        FROM discord_channels 
        WHERE ${column} = 1
      `);

      return channels.map(channel => ({
        discord_channel_id: channel.discord_channel_id,
        channel_name: channel.channel_name,
        channel_type: channel.channel_type as 'text' | 'voice',
        send_announcements: Boolean(channel.send_announcements),
        send_reminders: Boolean(channel.send_reminders),
        send_match_start_notifications: Boolean(channel.send_match_start_notifications),
        send_signup_updates: Boolean(channel.send_signup_updates)
      }));

    } catch (error) {
      console.error(`Error fetching channels for ${notificationType}:`, error);
      return [];
    }
  }

  async postTimedReminder(eventData: {
    id: string;
    name: string;
    description: string;
    game_id: string;
    game_name?: string;
    start_date: string;
    event_image_url?: string;
    _timingInfo: { value: number; unit: 'minutes' | 'hours' | 'days' };
  }) {
    if (!this.client.isReady()) {
      console.warn('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for reminders (not announcements)
    const reminderChannels = await this.getChannelsForNotificationType('reminders');
    
    if (reminderChannels.length === 0) {
      console.warn('⚠️ No channels configured for reminders');
      return false;
    }

    try {
      // Create reminder embed
      const { embed, attachment } = await this.createTimedReminderEmbed(eventData);

      // No mention text for reminders - they're just notifications
      const messageOptions: any = {
        embeds: [embed]
      };

      // Add attachment if image exists
      if (attachment) {
        messageOptions.files = [attachment];
      }

      let successCount = 0;

      // Send to all configured reminder channels
      for (const channelConfig of reminderChannels) {
        try {
          const reminderChannel = await this.client.channels.fetch(channelConfig.discord_channel_id);

          if (reminderChannel?.isTextBased() && 'send' in reminderChannel) {
            // Send reminder
            await reminderChannel.send(messageOptions);
            successCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to send timed reminder to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        console.error('❌ Failed to send timed reminder to any channels');
        return false;
      }

      console.log(`✅ Timed reminder posted to ${successCount} channel(s) for: ${eventData.name}`);
      return { success: true, successCount };

    } catch (error) {
      console.error('❌ Error posting timed reminder:', error);
      return false;
    }
  }

  private async createTimedReminderEmbed(eventData: {
    id: string;
    name: string;
    description: string;
    game_id: string;
    game_name?: string;
    start_date: string;
    event_image_url?: string;
    _timingInfo: { value: number; unit: 'minutes' | 'hours' | 'days' };
  }): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder }> {
    // Get game data for color if not provided
    let gameName = eventData.game_name || eventData.game_id;
    let gameColor = 0x3498db; // Blue color for reminders
    
    if (this.db && !eventData.game_name) {
      try {
        const gameData = await this.db.get<{name: string, color: string}>(`
          SELECT name, color FROM games WHERE id = ?
        `, [eventData.game_id]);
        
        if (gameData) {
          gameName = gameData.name;
          if (gameData.color) {
            gameColor = parseInt(gameData.color.replace('#', ''), 16);
          }
        }
      } catch (error) {
        console.error('Error fetching game data for reminder:', error);
      }
    }

    // Format the time away message
    const { value, unit } = eventData._timingInfo;
    const timeAwayText = `${value} ${unit}${value > 1 ? '' : unit === 'hours' ? '' : ''}`;
    
    const embed = new EmbedBuilder()
      .setTitle(`🔔 ${eventData.name}`)
      .setDescription(`Match starting in **${timeAwayText}**!`)
      .setColor(gameColor)
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Match Reminder' });

    // Add game info
    embed.addFields({ name: '🎯 Game', value: gameName, inline: true });

    // Add match time with Discord's time formatting
    if (eventData.start_date) {
      const startTime = new Date(eventData.start_date);
      const unixTimestamp = Math.floor(startTime.getTime() / 1000);
      
      embed.addFields(
        { name: '🕐 Match Time', value: `<t:${unixTimestamp}:F>`, inline: true },
        { name: '⏰ Starts', value: `<t:${unixTimestamp}:R>`, inline: true }
      );
    }

    // Try to find the original announcement message to link to
    if (this.db) {
      try {
        const originalMessage = await this.db.get<{
          message_id: string;
          channel_id: string;
        }>(`
          SELECT message_id, channel_id 
          FROM discord_match_messages 
          WHERE match_id = ? AND message_type = 'announcement'
          LIMIT 1
        `, [eventData.id]);

        if (originalMessage) {
          const messageLink = `https://discord.com/channels/${this.settings?.guild_id}/${originalMessage.channel_id}/${originalMessage.message_id}`;
          embed.addFields({ 
            name: '📋 Match Details', 
            value: `[View Original Announcement](${messageLink})`, 
            inline: false 
          });
        }
      } catch (error) {
        console.error('Error finding original announcement message:', error);
      }
    }

    let attachment: AttachmentBuilder | undefined;

    // Add event image if provided
    if (eventData.event_image_url && eventData.event_image_url.trim()) {
      try {
        const imagePath = path.join(process.cwd(), 'public', eventData.event_image_url.replace(/^\//, ''));
        
        if (fs.existsSync(imagePath)) {
          attachment = new AttachmentBuilder(imagePath, {
            name: `reminder_image.${path.extname(imagePath).slice(1)}`
          });
          
          embed.setImage(`attachment://reminder_image.${path.extname(imagePath).slice(1)}`);
          console.log(`✅ Added reminder image attachment: ${eventData.event_image_url}`);
        }
      } catch (error) {
        console.error(`❌ Error handling reminder image ${eventData.event_image_url}:`, error);
      }
    }

    return { embed, attachment };
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}