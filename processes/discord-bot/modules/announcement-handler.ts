import fs from 'fs';
import path from 'path';
import type {
  Client,
  Message,
  ThreadChannel
} from 'discord.js';
import {
  EmbedBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle
} from 'discord.js';
import type { Database } from '../../../lib/database/connection';
import type { DiscordSettings, DiscordChannel } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';
import {
  fetchMatchStartData,
  buildMapListField,
  fetchTeamAssignments,
  buildTeamFieldValue,
  getMatchLink,
  attachEventImage,
  getImageAttachmentName
} from './announcement-helpers';

export class AnnouncementHandler {
  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null
  ) {}

  /**
   * Get mention text based on settings
   */
  private getMentionText(): string {
    if (this.settings?.mention_everyone) {
      return '@everyone';
    }
    if (this.settings?.announcement_role_id) {
      return `<@&${this.settings.announcement_role_id}>`;
    }
    return '';
  }

  /**
   * Create signup button component
   */
  private createSignupButton(eventId: string): ActionRowBuilder<ButtonBuilder> {
    const signupButton = new ButtonBuilder()
      .setCustomId(`signup_${eventId}`)
      .setLabel('🎮 Sign Up')
      .setStyle(ButtonStyle.Primary);

    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(signupButton);
  }

  /**
   * Prepare announcement message options
   */
  private prepareAnnouncementMessageOptions(
    embed: EmbedBuilder,
    row: ActionRowBuilder<ButtonBuilder>,
    attachment: AttachmentBuilder | undefined,
    mentionText: string
  ): {
    content: string;
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
    files?: AttachmentBuilder[];
  } {
    const messageOptions = {
      content: mentionText,
      embeds: [embed],
      components: [row],
      ...(attachment ? { files: [attachment] } : {})
    };

    return messageOptions;
  }

  /**
   * Send announcement to all configured channels
   */
  private async sendAnnouncementToChannels(
    announcementChannels: DiscordChannel[],
    messageOptions: {
      content: string;
      embeds: EmbedBuilder[];
      components: ActionRowBuilder<ButtonBuilder>[];
      files?: AttachmentBuilder[];
    }
  ): Promise<{ successCount: number; mainMessage: Message | null }> {
    let successCount = 0;
    let mainMessage: Message | null = null;

    for (const channelConfig of announcementChannels) {
      try {
        const announcementChannel = await this.client.channels.fetch(channelConfig.discord_channel_id);

        if (announcementChannel?.isTextBased() && 'send' in announcementChannel) {
          const message = await announcementChannel.send(messageOptions);

          if (!mainMessage) {
            mainMessage = message;
          }

          successCount++;
        }
      } catch (error) {
        logger.error(`❌ Failed to send announcement to channel ${channelConfig.discord_channel_id}:`, error);
      }
    }

    return { successCount, mainMessage };
  }

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
      logger.warning('⚠️ Bot not ready');
      return false;
    }

    const announcementChannels = await this.getChannelsForNotificationType('announcements');

    if (announcementChannels.length === 0) {
      logger.warning('⚠️ No channels configured for announcements');
      return false;
    }

    try {
      const { embed, attachment } = await this.createEventEmbedWithAttachment(
        eventData.name,
        eventData.description,
        eventData.game_id,
        eventData.type,
        eventData.maps || [],
        eventData.max_participants,
        eventData.livestream_link,
        eventData.event_image_url,
        eventData.start_date,
        eventData.id
      );

      const row = this.createSignupButton(eventData.id);
      const mentionText = this.getMentionText();
      const messageOptions = this.prepareAnnouncementMessageOptions(embed, row, attachment, mentionText);
      const { successCount, mainMessage } = await this.sendAnnouncementToChannels(announcementChannels, messageOptions);

      if (successCount === 0) {
        logger.error('❌ Failed to send announcement to any channels');
        return false;
      }

      return { success: true, mainMessage, successCount };

    } catch (error) {
      logger.error('❌ Error posting event announcement:', error);
      return false;
    }
  }

  async createMapsThread(message: Message, eventName: string, gameId: string, maps: string[], matchId?: string): Promise<ThreadChannel | null> {
    try {
      // Create thread - using public thread for better visibility
      const thread = await message.startThread({
        name: `${eventName} Maps`,
        autoArchiveDuration: 1440, // 24 hours (in minutes)
        reason: 'Map details for event'
      });

      // Get map notes if matchId is provided
      const mapNotes: Record<string, string> = {};
      if (matchId && this.db) {
        try {
          const notesResult = await this.db.all<{map_id: string, notes: string}>(`
            SELECT map_id, notes 
            FROM match_games 
            WHERE match_id = ? AND notes IS NOT NULL AND notes != ''
          `, [matchId]);
          
          notesResult.forEach(note => {
            mapNotes[note.map_id] = note.notes;
          });
        } catch (error) {
          logger.error('Error fetching map notes for Discord:', error);
        }
      }

      // Create an embed for each map
      for (let i = 0; i < maps.length; i++) {
        const mapIdentifier = maps[i];
        const mapNumber = i + 1;
        
        // Try to find the note for this map by index to handle duplicate map names
        let mapNote = mapNotes[mapIdentifier];
        if (!mapNote) {
          // Get the clean map ID without timestamp
          const cleanMapId = mapIdentifier.replace(/-\d+-[a-zA-Z0-9]+$/, '');
          
          // Find all notes that match this base map ID and get by index
          const matchingKeys = Object.keys(mapNotes).filter(key => key.startsWith(`${cleanMapId  }-`)).sort();
          mapNote = matchingKeys[i] ? mapNotes[matchingKeys[i]] : '';
        }
        
        const mapEmbedData = await this.createMapEmbed(gameId, mapIdentifier, mapNumber, mapNote);
        if (mapEmbedData) {
          const messageOptions: {
            embeds: EmbedBuilder[];
            files?: AttachmentBuilder[];
          } = { embeds: [mapEmbedData.embed] };
          if (mapEmbedData.attachment) {
            messageOptions.files = [mapEmbedData.attachment];
          }
          await thread.send(messageOptions);
        }
      }

      return thread;
    } catch (error) {
      logger.error('❌ Error creating maps thread:', error);
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
    startDate?: string,
    _matchId?: string
  ): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder }> {
    const { gameName, gameColor } = await this.fetchGameDisplayData(gameId, type);

    const embed = new EmbedBuilder()
      .setTitle(name)
      .setDescription(description)
      .setColor(gameColor)
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Sign up to participate!' });

    this.addBasicFields(embed, gameName, type, _matchId);
    this.addTimeFields(embed, startDate);
    await this.addMapFields(embed, maps, gameId);
    this.addLivestreamField(embed, livestreamLink);

    const attachment = await this.createEventImageAttachment(eventImageUrl, embed);

    return { embed, attachment };
  }

  private async fetchGameDisplayData(
    gameId: string,
    type: string
  ): Promise<{ gameName: string; gameColor: number }> {
    let gameName = gameId;
    let gameColor = type === 'competitive' ? 0xff6b35 : 0x4caf50;

    if (this.db) {
      try {
        const gameData = await this.db.get<{ name: string; color: string }>(`
          SELECT name, color FROM games WHERE id = ?
        `, [gameId]);

        if (gameData) {
          gameName = gameData.name;
          if (gameData.color) {
            const colorHex = gameData.color.replace('#', '');
            gameColor = parseInt(colorHex, 16);
          }
        }
      } catch (error) {
        logger.error('Error fetching game data:', error);
      }
    }

    return { gameName, gameColor };
  }

  private addBasicFields(embed: EmbedBuilder, gameName: string, type: string, matchId?: string): void {
    embed.addFields({ name: '🎯 Game', value: gameName, inline: true });

    const isTournament = matchId?.startsWith('tournament_');
    if (!isTournament) {
      embed.addFields({
        name: '🏆 Ruleset',
        value: type === 'competitive' ? 'Competitive' : 'Casual',
        inline: true
      });
    }
  }

  private addTimeFields(embed: EmbedBuilder, startDate?: string): void {
    if (!startDate) return;

    const startTime = new Date(startDate);
    const unixTimestamp = Math.floor(startTime.getTime() / 1000);

    embed.addFields(
      { name: '🕐 Match Time', value: `<t:${unixTimestamp}:F>`, inline: true },
      { name: '⏰ Countdown', value: `<t:${unixTimestamp}:R>`, inline: true }
    );
  }

  private async addMapFields(embed: EmbedBuilder, maps: string[], gameId: string): Promise<void> {
    if (maps.length === 0) return;

    const mapDisplay = await this.buildMapDisplay(maps, gameId);

    embed.addFields({
      name: '🗺️ Maps',
      value: mapDisplay || 'Maps will be announced',
      inline: false
    });
  }

  private async buildMapDisplay(maps: string[], gameId: string): Promise<string> {
    if (!this.db) {
      return `${maps.length} map${maps.length > 1 ? 's' : ''} selected - See thread for details`;
    }

    try {
      const mapNames: string[] = [];
      for (const mapId of maps) {
        const cleanMapId = mapId.replace(/-\d+-[a-zA-Z0-9]+$/, '');
        const displayName = await this.fetchMapName(gameId, cleanMapId);
        mapNames.push(`**${displayName}**`);
      }

      return mapNames.join('\n');
    } catch (error) {
      logger.error('Error fetching map names for Discord:', error);
      return `${maps.length} map${maps.length > 1 ? 's' : ''} selected - See thread for details`;
    }
  }

  private async fetchMapName(gameId: string, cleanMapId: string): Promise<string> {
    try {
      const mapData = await this.db!.get<{ name: string }>(`
        SELECT name FROM game_maps
        WHERE game_id = ? AND (id = ? OR LOWER(name) LIKE LOWER(?))
        LIMIT 1
      `, [gameId, cleanMapId, `%${cleanMapId}%`]);

      return mapData ? mapData.name : cleanMapId;
    } catch (error) {
      logger.error(`Error fetching map name for ${cleanMapId}:`, error);
      return cleanMapId;
    }
  }

  private addLivestreamField(embed: EmbedBuilder, livestreamLink?: string): void {
    if (livestreamLink && livestreamLink.trim()) {
      embed.addFields({
        name: '📺 Livestream',
        value: `[Watch Live](${livestreamLink})`,
        inline: true
      });
    }
  }

  private async createEventImageAttachment(
    eventImageUrl: string | undefined,
    embed: EmbedBuilder
  ): Promise<AttachmentBuilder | undefined> {
    if (!eventImageUrl || !eventImageUrl.trim()) {
      return undefined;
    }

    try {
      const imagePath = path.join(process.cwd(), 'public', eventImageUrl.replace(/^\//, ''));

      if (fs.existsSync(imagePath)) {
        const extension = path.extname(imagePath).slice(1);
        const fileName = `event_image.${extension}`;

        const attachment = new AttachmentBuilder(imagePath, { name: fileName });
        embed.setImage(`attachment://${fileName}`);

        return attachment;
      } 
        logger.warning(`⚠️ Event image not found: ${imagePath}`);
      
    } catch (error) {
      logger.error(`❌ Error handling event image ${eventImageUrl}:`, error);
    }

    return undefined;
  }

  /**
   * Fetch map data from database with fallback logic
   */
  private async fetchMapData(
    gameId: string,
    cleanMapId: string
  ): Promise<{ name: string; image_url: string; location: string; mode_id: string } | null> {
    // Try exact match first
    const mapData = await this.db!.get<{
      name: string;
      image_url: string;
      location: string;
      mode_id: string;
    }>(`
      SELECT gm.name, gm.image_url, gm.location, gm.mode_id
      FROM game_maps gm
      WHERE gm.game_id = ? AND (gm.id = ? OR LOWER(gm.name) LIKE LOWER(?))
      LIMIT 1
    `, [gameId, cleanMapId, `%${cleanMapId}%`]);

    if (mapData) return mapData;

    // Try matching by base map name
    return this.fetchMapDataByBaseName(gameId, cleanMapId);
  }

  /**
   * Fetch map data by base name as fallback
   */
  private async fetchMapDataByBaseName(
    gameId: string,
    cleanMapId: string
  ): Promise<{ name: string; image_url: string; location: string; mode_id: string } | null> {
    const parts = cleanMapId.split('-');
    if (parts.length < 2) return null;

    const baseMapName = parts[0];
    const remainingParts = parts.slice(1).join('-');

    const result = await this.db!.get<{
      name: string;
      image_url: string;
      location: string;
      mode_id: string;
    }>(`
      SELECT gm.name, gm.image_url, gm.location, gm.mode_id
      FROM game_maps gm
      WHERE gm.game_id = ? AND gm.id LIKE ?
      LIMIT 1
    `, [gameId, `${baseMapName}%${remainingParts.split('-').pop()}`]);

    return result || null;
  }

  /**
   * Create fallback embed for unknown maps
   */
  private createFallbackMapEmbed(
    mapIdentifier: string,
    mapNumber?: number
  ): { embed: EmbedBuilder; attachment?: AttachmentBuilder } {
    const title = mapNumber ? `Map ${mapNumber}: ${mapIdentifier}` : `🗺️ ${mapIdentifier}`;
    return {
      embed: new EmbedBuilder()
        .setTitle(title)
        .setDescription('Map details not available')
        .setColor(0x95a5a6)
    };
  }

  /**
   * Fetch mode name for a map
   */
  private async fetchModeName(modeId: string, gameId: string): Promise<string> {
    try {
      const modeData = await this.db!.get<{ name: string }>(`
        SELECT name FROM game_modes WHERE id = ? AND game_id = ?
      `, [modeId, gameId]);
      return modeData ? modeData.name : modeId;
    } catch (error) {
      logger.error('Error fetching mode name:', error);
      return modeId;
    }
  }

  /**
   * Fetch game color for embed styling
   */
  private async fetchGameColor(gameId: string): Promise<number> {
    try {
      const gameData = await this.db!.get<{ color: string }>(`
        SELECT color FROM games WHERE id = ?
      `, [gameId]);
      if (gameData?.color) {
        return parseInt(gameData.color.replace('#', ''), 16);
      }
    } catch (error) {
      logger.error('Error fetching game color for map embed:', error);
    }
    return 0x95a5a6; // default gray
  }

  /**
   * Build map embed with provided data
   */
  private buildMapEmbed(
    mapData: { name: string; image_url: string; location: string; mode_id: string },
    modeName: string,
    gameColor: number,
    mapNumber?: number,
    mapNote?: string
  ): EmbedBuilder {
    const title = mapNumber ? `Map ${mapNumber}: ${mapData.name}` : `🗺️ ${mapData.name}`;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(gameColor)
      .addFields({ name: '🎮 Mode', value: modeName, inline: true });

    if (mapData.location) {
      embed.addFields({ name: '📍 Location', value: mapData.location, inline: true });
    }

    if (mapNote && mapNote.trim()) {
      embed.addFields({ name: '📝 Note', value: mapNote.trim(), inline: false });
    }

    return embed;
  }

  /**
   * Create map image attachment if available
   */
  private createMapImageAttachment2(
    imageUrl: string,
    mapName: string
  ): { attachment: AttachmentBuilder; attachmentName: string } | null {
    try {
      const imagePath = path.join(process.cwd(), 'public', imageUrl.replace(/^\//, ''));

      if (fs.existsSync(imagePath)) {
        const attachmentName = `${mapName.replace(/[^a-zA-Z0-9]/g, '_')}.${path.extname(imagePath).slice(1)}`;
        const attachment = new AttachmentBuilder(imagePath, { name: attachmentName });
        return { attachment, attachmentName };
      }
    } catch (error) {
      logger.error(`Error handling map image for ${mapName}:`, error);
    }
    return null;
  }

  private async createMapEmbed(gameId: string, mapIdentifier: string, mapNumber?: number, mapNote?: string): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder } | null> {
    if (!this.db) return null;

    try {
      const cleanMapId = mapIdentifier.replace(/-\d+-[a-zA-Z0-9]+$/, '');
      const mapData = await this.fetchMapData(gameId, cleanMapId);

      if (!mapData) {
        return this.createFallbackMapEmbed(mapIdentifier, mapNumber);
      }

      const modeName = await this.fetchModeName(mapData.mode_id, gameId);
      const gameColor = await this.fetchGameColor(gameId);
      const embed = this.buildMapEmbed(mapData, modeName, gameColor, mapNumber, mapNote);

      if (mapData.image_url) {
        const imageResult = this.createMapImageAttachment2(mapData.image_url, mapData.name);
        if (imageResult) {
          embed.setImage(`attachment://${imageResult.attachmentName}`);
          return { embed, attachment: imageResult.attachment };
        }
      }

      return { embed };

    } catch (error) {
      logger.error(`Error creating map embed for ${mapIdentifier}:`, error);
      return null;
    }
  }

  private async getChannelsForNotificationType(notificationType: 'announcements' | 'reminders' | 'match_start' | 'signup_updates' | 'health_alerts'): Promise<DiscordChannel[]> {
    if (!this.db) {
      return [];
    }

    try {
      const columnMap = {
        'announcements': 'send_announcements',
        'reminders': 'send_reminders',
        'match_start': 'send_match_start',
        'signup_updates': 'send_signup_updates',
        'health_alerts': 'send_health_alerts'
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
        send_health_alerts: number;
        created_at: string;
        updated_at: string;
      }>(`
        SELECT id, discord_channel_id, channel_name, channel_type,
               send_announcements, send_reminders, send_match_start, send_signup_updates, send_health_alerts,
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
        send_health_alerts: Boolean(channel.send_health_alerts),
        created_at: channel.created_at,
        updated_at: channel.updated_at
      }));

    } catch (error) {
      logger.error(`Error fetching channels for ${notificationType}:`, error);
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
      logger.warning('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for reminders (not announcements)
    const reminderChannels = await this.getChannelsForNotificationType('reminders');
    
    if (reminderChannels.length === 0) {
      logger.warning('⚠️ No channels configured for reminders');
      return false;
    }

    try {
      // Create reminder embed
      const { embed, attachment } = await this.createTimedReminderEmbed(eventData);

      // No mention text for reminders - they're just notifications
      const messageOptions: {
        content?: string;
        embeds: EmbedBuilder[];
        components?: ActionRowBuilder<ButtonBuilder>[];
        files?: AttachmentBuilder[];
      } = {
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
          logger.error(`❌ Failed to send timed reminder to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        logger.error('❌ Failed to send timed reminder to any channels');
        return false;
      }

      return { success: true, successCount };

    } catch (error) {
      logger.error('❌ Error posting timed reminder:', error);
      return false;
    }
  }

  /**
   * Fetch game data for reminder embed
   */
  private async fetchReminderGameData(gameId: string, gameName?: string): Promise<{ gameName: string; gameColor: number }> {
    if (!this.db || gameName) {
      return {
        gameName: gameName || gameId,
        gameColor: 0x3498db
      };
    }

    try {
      const gameData = await this.db.get<{ name: string; color: string }>(`
        SELECT name, color FROM games WHERE id = ?
      `, [gameId]);

      if (gameData) {
        const color = gameData.color ? parseInt(gameData.color.replace('#', ''), 16) : 0x3498db;
        return { gameName: gameData.name, gameColor: color };
      }
    } catch (error) {
      logger.error('Error fetching game data for reminder:', error);
    }

    return { gameName: gameId, gameColor: 0x3498db };
  }

  /**
   * Format time away text for reminder
   */
  private formatTimeAwayText(timingInfo: { value: number; unit: 'minutes' | 'hours' | 'days' }): string {
    const { value, unit } = timingInfo;
    return `${value} ${unit}${value > 1 ? '' : unit === 'hours' ? '' : ''}`;
  }

  /**
   * Add time fields to reminder embed
   */
  private addReminderTimeFields(embed: EmbedBuilder, startDate: string): void {
    const startTime = new Date(startDate);
    const unixTimestamp = Math.floor(startTime.getTime() / 1000);

    embed.addFields(
      { name: '🕐 Match Time', value: `<t:${unixTimestamp}:F>`, inline: true },
      { name: '⏰ Starts', value: `<t:${unixTimestamp}:R>`, inline: true }
    );
  }

  /**
   * Try to add original announcement link to reminder
   */
  private async addOriginalAnnouncementLink(embed: EmbedBuilder, matchId: string): Promise<void> {
    if (!this.db) return;

    try {
      const originalMessage = await this.db.get<{
        message_id: string;
        channel_id: string;
      }>(`
        SELECT message_id, channel_id
        FROM discord_match_messages
        WHERE match_id = ? AND message_type = 'announcement'
        LIMIT 1
      `, [matchId]);

      if (originalMessage) {
        const messageLink = `https://discord.com/channels/${this.settings?.guild_id}/${originalMessage.channel_id}/${originalMessage.message_id}`;
        embed.addFields({
          name: '📋 Match Details',
          value: `[View Original Announcement](${messageLink})`,
          inline: false
        });
      }
    } catch (error) {
      logger.error('Error finding original announcement message:', error);
    }
  }

  /**
   * Create reminder image attachment
   */
  private createReminderImageAttachment(imageUrl: string): AttachmentBuilder | undefined {
    if (!imageUrl || !imageUrl.trim()) return undefined;

    try {
      const imagePath = path.join(process.cwd(), 'public', imageUrl.replace(/^\//, ''));

      if (fs.existsSync(imagePath)) {
        return new AttachmentBuilder(imagePath, {
          name: `reminder_image.${path.extname(imagePath).slice(1)}`
        });
      }
    } catch (error) {
      logger.error(`❌ Error handling reminder image ${imageUrl}:`, error);
    }

    return undefined;
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
    const { gameName, gameColor } = await this.fetchReminderGameData(eventData.game_id, eventData.game_name);
    const timeAwayText = this.formatTimeAwayText(eventData._timingInfo);

    const embed = new EmbedBuilder()
      .setTitle(`🔔 ${eventData.name}`)
      .setDescription(`Match starting in **${timeAwayText}**!`)
      .setColor(gameColor)
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Match Reminder' })
      .addFields({ name: '🎯 Game', value: gameName, inline: true });

    if (eventData.start_date) {
      this.addReminderTimeFields(embed, eventData.start_date);
    }

    await this.addOriginalAnnouncementLink(embed, eventData.id);

    const attachment = this.createReminderImageAttachment(eventData.event_image_url || '');
    if (attachment && eventData.event_image_url) {
      embed.setImage(`attachment://reminder_image.${path.extname(eventData.event_image_url).slice(1)}`);
    }

    return { embed, attachment };
  }

  async postMatchStartAnnouncement(eventData: {
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
      logger.warning('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for match start notifications
    const matchStartChannels = await this.getChannelsForNotificationType('match_start');
    
    if (matchStartChannels.length === 0) {
      logger.warning('⚠️ No channels configured for match start notifications');
      return false;
    }

    try {
      // Create match start embed
      const { embed, attachment } = await this.createMatchStartEmbed(eventData);

      // Build message options
      const messageOptions: {
        content?: string;
        embeds: EmbedBuilder[];
        components?: ActionRowBuilder<ButtonBuilder>[];
        files?: AttachmentBuilder[];
      } = {
        embeds: [embed]
      };

      // Add attachment if image exists
      if (attachment) {
        messageOptions.files = [attachment];
      }

      let successCount = 0;

      // Send to all configured match start channels
      for (const channelConfig of matchStartChannels) {
        try {
          const matchStartChannel = await this.client.channels.fetch(channelConfig.discord_channel_id);

          if (matchStartChannel?.isTextBased() && 'send' in matchStartChannel) {
            // Send match start announcement
            await matchStartChannel.send(messageOptions);
            successCount++;
          }
        } catch (error) {
          logger.error(`❌ Failed to send match start announcement to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        logger.error('❌ Failed to send match start announcement to any channels');
        return false;
      }

      return { success: true, successCount };

    } catch (error) {
      logger.error('❌ Error posting match start announcement:', error);
      return false;
    }
  }

  private async createMatchStartEmbed(eventData: {
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
  }): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder }> {
    const matchData = await this.fetchMatchStartDataSafe(eventData);
    const embed = this.createBaseMatchStartEmbed(eventData, matchData);

    await this.addMapsFieldIfNeeded(embed, eventData);
    await this.addTeamFieldsIfNeeded(embed, eventData, matchData);
    await this.addMatchLinkIfNeeded(embed, eventData);
    this.addLivestreamFieldIfNeeded(embed, eventData);

    const attachment = this.attachEventImageIfNeeded(embed, eventData);

    return { embed, attachment };
  }

  private async fetchMatchStartDataSafe(eventData: any) {
    if (!this.db) {
      return {
        gameName: eventData.game_id,
        gameColor: 0xe74c3c,
        blueTeamVoiceChannel: null,
        redTeamVoiceChannel: null
      };
    }

    return await fetchMatchStartData(this.db, eventData.id, eventData.game_id);
  }

  private createBaseMatchStartEmbed(eventData: any, matchData: any): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle(`🚀 ${eventData.name} - MATCH STARTING NOW!`)
      .setDescription(eventData.description || `The ${eventData.name} match is beginning!`)
      .setColor(matchData.gameColor)
      .addFields([
        { name: '🎮 Game', value: matchData.gameName, inline: true },
        { name: '🏆 Type', value: eventData.type.charAt(0).toUpperCase() + eventData.type.slice(1), inline: true },
        { name: '👥 Max Players', value: eventData.max_participants.toString(), inline: true }
      ])
      .setTimestamp()
      .setFooter({ text: 'Match Starting' });
  }

  private async addMapsFieldIfNeeded(embed: EmbedBuilder, eventData: any): Promise<void> {
    const hasMaps = eventData.maps && eventData.maps.length > 0 && this.db;
    if (!hasMaps) return;

    const mapList = await buildMapListField(this.db!, eventData.maps, eventData.game_id);
    embed.addFields([{ name: '🗺️ Maps', value: mapList, inline: false }]);
  }

  private async addTeamFieldsIfNeeded(embed: EmbedBuilder, eventData: any, matchData: any): Promise<void> {
    if (!this.db) return;

    const teams = await fetchTeamAssignments(this.db, eventData.id);

    this.addBlueTeamField(embed, teams.blueTeam, matchData);
    this.addRedTeamField(embed, teams.redTeam, matchData);
    this.addReservesField(embed, teams.reserves);
  }

  private addBlueTeamField(embed: EmbedBuilder, blueTeam: any[], matchData: any): void {
    if (blueTeam.length === 0) return;

    const blueFieldValue = buildTeamFieldValue(blueTeam, matchData.blueTeamVoiceChannel);
    const blueTeamHeader = matchData.team1Name ? `🔵 ${matchData.team1Name}` : '🔵 Blue Team';

    embed.addFields([{
      name: blueTeamHeader,
      value: blueFieldValue,
      inline: true
    }]);
  }

  private addRedTeamField(embed: EmbedBuilder, redTeam: any[], matchData: any): void {
    if (redTeam.length === 0) return;

    const redFieldValue = buildTeamFieldValue(redTeam, matchData.redTeamVoiceChannel);
    const redTeamHeader = matchData.team2Name ? `🔴 ${matchData.team2Name}` : '🔴 Red Team';

    embed.addFields([{
      name: redTeamHeader,
      value: redFieldValue,
      inline: true
    }]);
  }

  private addReservesField(embed: EmbedBuilder, reserves: any[]): void {
    if (reserves.length === 0) return;

    const reserveList = reserves
      .map(p => p.discord_user_id ? `<@${p.discord_user_id}>` : p.username)
      .join('\n');

    embed.addFields([{
      name: '🟡 Reserves',
      value: reserveList,
      inline: true
    }]);
  }

  private async addMatchLinkIfNeeded(embed: EmbedBuilder, eventData: any): Promise<void> {
    if (!this.db) return;

    const matchLink = await getMatchLink(this.db, eventData.id, this.client);
    if (!matchLink) return;

    embed.addFields([{
      name: '🔗 Match Details',
      value: `[View Full Match Info](${matchLink})`,
      inline: false
    }]);
  }

  private addLivestreamFieldIfNeeded(embed: EmbedBuilder, eventData: any): void {
    if (!eventData.livestream_link) return;

    embed.addFields([{
      name: '📺 Livestream',
      value: `[Watch Live](${eventData.livestream_link})`,
      inline: false
    }]);
  }

  private attachEventImageIfNeeded(embed: EmbedBuilder, eventData: any): AttachmentBuilder | undefined {
    if (!eventData.event_image_url) return undefined;

    const attachment = attachEventImage(eventData.event_image_url);
    if (!attachment) return undefined;

    const imageName = getImageAttachmentName(eventData.event_image_url);
    embed.setImage(`attachment://${imageName}`);

    return attachment;
  }

  async postMapScoreNotification(scoreData: {
    matchId: string;
    matchName: string;
    gameId: string;
    gameNumber: number;
    mapId: string;
    winner: 'team1' | 'team2';
    winningTeamName: string;
    winningPlayers: string[];
  }) {
    if (!this.client.isReady()) {
      logger.warning('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for live updates (match_start)
    const liveUpdateChannels = await this.getChannelsForNotificationType('match_start');
    
    if (liveUpdateChannels.length === 0) {
      logger.warning('⚠️ No channels configured for live updates');
      return false;
    }

    try {
      // Create score notification embed
      const { embed, attachment } = await this.createMapScoreEmbed(scoreData);

      // Build message options
      const messageOptions: {
        content?: string;
        embeds: EmbedBuilder[];
        components?: ActionRowBuilder<ButtonBuilder>[];
        files?: AttachmentBuilder[];
      } = {
        embeds: [embed]
      };

      // Add attachment if image exists
      if (attachment) {
        messageOptions.files = [attachment];
      }

      let successCount = 0;

      // Send to all configured live update channels
      for (const channelConfig of liveUpdateChannels) {
        try {
          const liveUpdateChannel = await this.client.channels.fetch(channelConfig.discord_channel_id);

          if (liveUpdateChannel?.isTextBased() && 'send' in liveUpdateChannel) {
            // Send score notification
            await liveUpdateChannel.send(messageOptions);
            successCount++;
          }
        } catch (error) {
          logger.error(`❌ Failed to send map score notification to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        logger.error('❌ Failed to send map score notification to any channels');
        return false;
      }

      return { success: true, successCount };

    } catch (error) {
      logger.error('❌ Error posting map score notification:', error);
      return false;
    }
  }

  /**
   * Fetch map score metadata from database
   */
  private async fetchMapScoreMetadata(
    gameId: string,
    matchId: string,
    mapId: string
  ): Promise<{
    gameName: string;
    gameColor: number;
    mapName: string;
    mapImageUrl: string | null;
    mapNote: string | null;
    totalMaps: number;
    team1Name?: string;
    team2Name?: string;
  }> {
    let gameName = gameId;
    let gameColor = 0x00d4aa;
    let mapName = mapId;
    let mapImageUrl: string | null = null;
    let mapNote: string | null = null;
    let totalMaps = 0;
    let team1Name: string | undefined;
    let team2Name: string | undefined;

    if (!this.db) {
      return { gameName, gameColor, mapName, mapImageUrl, mapNote, totalMaps };
    }

    try {
      // Get game data and team names
      const gameData = await this.db.get<{name: string, color: string}>(`
        SELECT name, color FROM games WHERE id = ?
      `, [gameId]);

      if (gameData) {
        gameName = gameData.name;
        if (gameData.color) {
          gameColor = parseInt(gameData.color.replace('#', ''), 16);
        }
      }

      const matchData = await this.db.get<{team1_name?: string, team2_name?: string}>(`
        SELECT team1_name, team2_name FROM matches WHERE id = ?
      `, [matchId]);

      if (matchData) {
        team1Name = matchData.team1_name;
        team2Name = matchData.team2_name;
      }

      // Get map data
      const cleanMapId = mapId.replace(/-\d+-[a-zA-Z0-9]+$/, '');
      const mapData = await this.db.get<{
        name: string;
        image_url: string;
      }>(`
        SELECT gm.name, gm.image_url
        FROM game_maps gm
        WHERE gm.game_id = ? AND (gm.id = ? OR LOWER(gm.name) LIKE LOWER(?))
        LIMIT 1
      `, [gameId, cleanMapId, `%${cleanMapId}%`]);

      if (mapData) {
        mapName = mapData.name;
        mapImageUrl = mapData.image_url;
      }

      // Get map notes
      const mapNoteData = await this.db.get<{notes: string}>(`
        SELECT notes
        FROM match_games
        WHERE match_id = ? AND map_id = ? AND notes IS NOT NULL AND notes != ''
        LIMIT 1
      `, [matchId, mapId]);

      if (mapNoteData?.notes) {
        mapNote = mapNoteData.notes;
      }

      // Get total maps count
      const mapCountData = await this.db.get<{total_maps: number}>(`
        SELECT COUNT(*) as total_maps FROM match_games WHERE match_id = ?
      `, [matchId]);

      if (mapCountData) {
        totalMaps = mapCountData.total_maps;
      }
    } catch (error) {
      logger.error('Error fetching game/map data for score notification:', error);
    }

    return { gameName, gameColor, mapName, mapImageUrl, mapNote, totalMaps, team1Name, team2Name };
  }

  /**
   * Create map image attachment for embed
   */
  private createMapImageAttachment(mapImageUrl: string, mapName: string): AttachmentBuilder | undefined {
    try {
      const imagePath = path.join(process.cwd(), 'public', mapImageUrl.replace(/^\//, ''));

      if (fs.existsSync(imagePath)) {
        const attachmentName = `map_score_${mapName.replace(/[^a-zA-Z0-9]/g, '_')}.${path.extname(imagePath).slice(1)}`;
        return new AttachmentBuilder(imagePath, { name: attachmentName });
      }
    } catch (error) {
      logger.error(`❌ Error handling map image for score notification:`, error);
    }

    return undefined;
  }

  private async createMapScoreEmbed(scoreData: {
    matchId: string;
    matchName: string;
    gameId: string;
    gameNumber: number;
    mapId: string;
    winner: 'team1' | 'team2';
    winningTeamName: string;
    winningPlayers: string[];
  }): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder }> {
    // Fetch metadata
    const metadata = await this.fetchMapScoreMetadata(scoreData.gameId, scoreData.matchId, scoreData.mapId);

    // Determine winning team display name
    const winningTeamDisplay = (scoreData.winner === 'team1' && metadata.team1Name) ? metadata.team1Name :
                                (scoreData.winner === 'team2' && metadata.team2Name) ? metadata.team2Name :
                                scoreData.winningTeamName;

    // Build embed
    const mapProgress = metadata.totalMaps > 0 ? `${scoreData.gameNumber}/${metadata.totalMaps}` : scoreData.gameNumber.toString();
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${winningTeamDisplay} Wins Map ${scoreData.gameNumber}!`)
      .setDescription(`**${scoreData.matchName}** - ${metadata.mapName}`)
      .setColor(metadata.gameColor)
      .addFields([
        { name: '🎮 Game', value: metadata.gameName, inline: true },
        { name: '🗺️ Map', value: metadata.mapName, inline: true },
        { name: '📊 Map Progress', value: mapProgress, inline: true }
      ])
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Live Score Update' });

    // Add winning team players
    if (scoreData.winningPlayers.length > 0) {
      const playersList = scoreData.winningPlayers.join('\n');
      embed.addFields([{
        name: `${winningTeamDisplay} Players`,
        value: playersList,
        inline: false
      }]);
    }

    // Add map note if available
    if (metadata.mapNote?.trim()) {
      embed.addFields([{
        name: '📝 Map Note',
        value: metadata.mapNote.trim(),
        inline: false
      }]);
    }

    // Add map image if available
    let attachment: AttachmentBuilder | undefined;
    if (metadata.mapImageUrl) {
      attachment = this.createMapImageAttachment(metadata.mapImageUrl, metadata.mapName);
      if (attachment) {
        const attachmentName = `map_score_${metadata.mapName.replace(/[^a-zA-Z0-9]/g, '_')}.${path.extname(metadata.mapImageUrl).slice(1)}`;
        embed.setImage(`attachment://${attachmentName}`);
      }
    }

    return { embed, attachment };
  }

  async postMatchWinnerNotification(winnerData: {
    matchId: string;
    matchName: string;
    gameId: string;
    winner: 'team1' | 'team2' | 'tie';
    winningTeamName: string;
    winningPlayers: string[];
    team1Score: number;
    team2Score: number;
    totalMaps: number;
  }) {
    if (!this.client.isReady()) {
      logger.warning('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for live updates (match_start)
    const matchEndChannels = await this.getChannelsForNotificationType('match_start');
    
    if (matchEndChannels.length === 0) {
      logger.warning('⚠️ No channels configured for match end notifications');
      return false;
    }

    try {
      // Create match winner embed
      const { embed, attachment } = await this.createMatchWinnerEmbed(winnerData);

      // Build message options
      const messageOptions: {
        content?: string;
        embeds: EmbedBuilder[];
        components?: ActionRowBuilder<ButtonBuilder>[];
        files?: AttachmentBuilder[];
      } = {
        embeds: [embed]
      };

      // Add attachment if image exists
      if (attachment) {
        messageOptions.files = [attachment];
      }

      let successCount = 0;

      // Send to all configured match end channels
      for (const channelConfig of matchEndChannels) {
        try {
          const matchEndChannel = await this.client.channels.fetch(channelConfig.discord_channel_id);

          if (matchEndChannel?.isTextBased() && 'send' in matchEndChannel) {
            // Send match winner notification
            await matchEndChannel.send(messageOptions);
            successCount++;
          }
        } catch (error) {
          logger.error(`❌ Failed to send match winner notification to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        logger.error('❌ Failed to send match winner notification to any channels');
        return false;
      }

      return { success: true, successCount };

    } catch (error) {
      logger.error('❌ Error posting match winner notification:', error);
      return false;
    }
  }

  /**
   * Fetch game and match metadata for winner embed
   */
  private async fetchWinnerEmbedMetadata(gameId: string, matchId: string): Promise<{
    gameName: string;
    gameColor: number;
    team1Name?: string;
    team2Name?: string;
  }> {
    let gameName = gameId;
    let gameColor = 0x00d4aa;
    let team1Name: string | undefined;
    let team2Name: string | undefined;

    if (this.db) {
      try {
        const gameData = await this.db.get<{name: string, color: string}>(`
          SELECT name, color FROM games WHERE id = ?
        `, [gameId]);

        if (gameData) {
          gameName = gameData.name;
          if (gameData.color) {
            gameColor = parseInt(gameData.color.replace('#', ''), 16);
          }
        }

        const matchData = await this.db.get<{team1_name?: string, team2_name?: string}>(`
          SELECT team1_name, team2_name FROM matches WHERE id = ?
        `, [matchId]);

        if (matchData) {
          team1Name = matchData.team1_name;
          team2Name = matchData.team2_name;
        }
      } catch (error) {
        logger.error('Error fetching game data for match winner notification:', error);
      }
    }

    return { gameName, gameColor, team1Name, team2Name };
  }

  /**
   * Generate title and description for winner embed
   */
  private generateWinnerTitleDescription(
    winnerData: {
      matchName: string;
      winner: 'team1' | 'team2' | 'tie';
      team1Score: number;
      team2Score: number;
    },
    winningTeamDisplay: string
  ): { title: string; description: string } {
    if (winnerData.winner === 'tie') {
      return {
        title: `🤝 ${winnerData.matchName} - Match Tied!`,
        description: `The match ended in a **${winnerData.team1Score}-${winnerData.team2Score}** tie!`
      };
    }

    const losingScore = winnerData.winner === 'team1' ? winnerData.team2Score : winnerData.team1Score;
    const winningScore = winnerData.winner === 'team1' ? winnerData.team1Score : winnerData.team2Score;

    return {
      title: `🏆 ${winningTeamDisplay} Wins ${winnerData.matchName}!`,
      description: `**${winnerData.matchName}** is complete! Final score: **${winningScore}-${losingScore}**`
    };
  }

  /**
   * Get link to original match announcement
   */
  private async getOriginalMatchLink(matchId: string): Promise<string | null> {
    if (!this.db) return null;

    try {
      const originalMessage = await this.db.get<{
        message_id: string;
        channel_id: string;
      }>(`
        SELECT message_id, channel_id
        FROM discord_match_messages
        WHERE match_id = ? AND message_type = 'announcement'
        LIMIT 1
      `, [matchId]);

      if (originalMessage && this.client.guilds.cache.first()) {
        const guildId = this.client.guilds.cache.first()?.id;
        return `https://discord.com/channels/${guildId}/${originalMessage.channel_id}/${originalMessage.message_id}`;
      }
    } catch (error) {
      logger.error('Error finding original announcement message for match winner:', error);
    }

    return null;
  }

  private async createMatchWinnerEmbed(winnerData: {
    matchId: string;
    matchName: string;
    gameId: string;
    winner: 'team1' | 'team2' | 'tie';
    winningTeamName: string;
    winningPlayers: string[];
    team1Score: number;
    team2Score: number;
    totalMaps: number;
  }): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder }> {
    // Fetch metadata
    const { gameName, gameColor, team1Name, team2Name } = await this.fetchWinnerEmbedMetadata(
      winnerData.gameId,
      winnerData.matchId
    );

    // Determine winning team display name
    const winningTeamDisplay = (winnerData.winner === 'team1' && team1Name) ? team1Name :
                                (winnerData.winner === 'team2' && team2Name) ? team2Name :
                                winnerData.winningTeamName;

    // Generate title and description
    const { title, description } = this.generateWinnerTitleDescription(winnerData, winningTeamDisplay);

    // Adjust color for tie
    const embedColor = winnerData.winner === 'tie' ? 0xffa500 : gameColor;

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(embedColor)
      .addFields([
        { name: '🎮 Game', value: gameName, inline: true },
        { name: '📊 Final Score', value: `${winnerData.team1Score} - ${winnerData.team2Score}`, inline: true },
        { name: '🗺️ Maps Played', value: winnerData.totalMaps.toString(), inline: true }
      ])
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Match Complete' });

    // Add winning team players (if not a tie)
    if (winnerData.winner !== 'tie' && winnerData.winningPlayers.length > 0) {
      const playersList = winnerData.winningPlayers.join('\n');
      embed.addFields([{
        name: `${winningTeamDisplay} Players`,
        value: playersList,
        inline: false
      }]);
    }

    // Add link to original match info if available
    const matchLink = await this.getOriginalMatchLink(winnerData.matchId);
    if (matchLink) {
      embed.addFields([{
        name: '🔗 Match Details',
        value: `[View Original Match Info](${matchLink})`,
        inline: false
      }]);
    }

    return { embed };
  }

  async postTournamentWinnerNotification(tournamentData: {
    tournamentId: string;
    tournamentName: string;
    gameId: string;
    winner: string; // team ID
    winningTeamName: string;
    winningPlayers: string[];
    format: 'single-elimination' | 'double-elimination';
    totalParticipants: number;
  }) {
    if (!this.client.isReady()) {
      logger.warning('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for live updates (match_start)
    const liveUpdateChannels = await this.getChannelsForNotificationType('match_start');

    if (liveUpdateChannels.length === 0) {
      logger.warning('⚠️ No channels configured for tournament winner notifications');
      return false;
    }

    try {
      // Create tournament winner embed
      const { embed, attachment } = await this.createTournamentWinnerEmbed(tournamentData);

      // Build message options
      const messageOptions: {
        content?: string;
        embeds: EmbedBuilder[];
        components?: ActionRowBuilder<ButtonBuilder>[];
        files?: AttachmentBuilder[];
      } = {
        embeds: [embed]
      };

      // Add attachment if image exists
      if (attachment) {
        messageOptions.files = [attachment];
      }

      let successCount = 0;

      // Send to all configured live update channels
      for (const channelConfig of liveUpdateChannels) {
        try {
          const liveUpdateChannel = await this.client.channels.fetch(channelConfig.discord_channel_id);

          if (liveUpdateChannel?.isTextBased() && 'send' in liveUpdateChannel) {
            // Send tournament winner notification
            await liveUpdateChannel.send(messageOptions);
            successCount++;
          }
        } catch (error) {
          logger.error(`❌ Error sending tournament winner notification to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      logger.debug(`🏆 Tournament winner notification sent to ${successCount}/${liveUpdateChannels.length} channels`);
      return successCount > 0 ? { success: true } : false;

    } catch (error) {
      logger.error('❌ Error posting tournament winner notification:', error);
      return false;
    }
  }

  private async createTournamentWinnerEmbed(tournamentData: {
    tournamentId: string;
    tournamentName: string;
    gameId: string;
    winner: string;
    winningTeamName: string;
    winningPlayers: string[];
    format: 'single-elimination' | 'double-elimination';
    totalParticipants: number;
  }): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder }> {
    // Get game data for color and name
    let gameName = tournamentData.gameId;
    let gameColor = 0xffd700; // Gold color for tournament winners
    let attachment: AttachmentBuilder | undefined;

    if (this.db) {
      try {
        const gameData = await this.db.get<{name: string, color: string, icon_url: string}>(`
          SELECT name, color, icon_url FROM games WHERE id = ?
        `, [tournamentData.gameId]);

        if (gameData) {
          gameName = gameData.name;
          if (gameData.color) {
            gameColor = parseInt(gameData.color.replace('#', ''), 16);
          }
        }
      } catch (error) {
        logger.error('Error fetching game data for tournament winner:', error);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Tournament Complete!`)
      .setDescription(`**${tournamentData.tournamentName}** has concluded!`)
      .setColor(gameColor)
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Tournament Results' });

    // Add winner info
    embed.addFields({
      name: '👑 Champion',
      value: `**${tournamentData.winningTeamName}**`,
      inline: false
    });

    // Add winning players
    if (tournamentData.winningPlayers.length > 0) {
      const playersList = tournamentData.winningPlayers.map(player => `• ${player}`).join('\n');
      embed.addFields({
        name: '🎮 Players',
        value: playersList,
        inline: true
      });
    }

    // Add tournament details
    embed.addFields({
      name: '🎯 Game',
      value: gameName,
      inline: true
    });

    embed.addFields({
      name: '🏟️ Format',
      value: tournamentData.format === 'single-elimination' ? 'Single Elimination' : 'Double Elimination',
      inline: true
    });

    embed.addFields({
      name: '👥 Participants',
      value: `${tournamentData.totalParticipants} players`,
      inline: true
    });

    return { embed, attachment };
  }

  async postHealthAlert(alertData: {
    severity: 'critical' | 'warning';
    title: string;
    description: string;
  }): Promise<void> {
    try {
      const channels = await this.getChannelsForNotificationType('health_alerts');

      if (channels.length === 0) {
        logger.warning('No channels configured for health alerts');
        return;
      }

      // Create embed based on severity
      const color = alertData.severity === 'critical' ? 0xFF0000 : 0xFFFF00; // Red or Yellow
      const icon = alertData.severity === 'critical' ? '🚨' : '⚠️';

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${icon} ${alertData.title}`)
        .setDescription(alertData.description)
        .setTimestamp()
        .setFooter({ text: `Severity: ${alertData.severity.toUpperCase()}` });

      // Send to all configured channels
      for (const channel of channels) {
        try {
          const discordChannel = await this.client.channels.fetch(channel.discord_channel_id);

          if (discordChannel?.isTextBased() && 'send' in discordChannel) {
            await discordChannel.send({ embeds: [embed] });
            logger.info(`Health alert sent to channel ${channel.channel_name || channel.discord_channel_id}`);
          }
        } catch (error) {
          logger.error(`Failed to send health alert to channel ${channel.discord_channel_id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error posting health alert:', error);
    }
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}