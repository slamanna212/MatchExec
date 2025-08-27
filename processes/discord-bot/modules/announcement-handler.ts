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

      return { success: true, mainMessage, successCount };

    } catch (error) {
      console.error('❌ Error posting event announcement:', error);
      return false;
    }
  }

  async createMapsThread(message: Message, eventName: string, gameId: string, maps: string[], matchId?: string): Promise<any> {
    try {
      // Create thread - using public thread for better visibility
      const thread = await message.startThread({
        name: `${eventName} Maps`,
        autoArchiveDuration: 1440, // 24 hours (in minutes)
        reason: 'Map details for event'
      });

      // Get map notes if matchId is provided
      let mapNotes: Record<string, string> = {};
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
          console.error('Error fetching map notes for Discord:', error);
        }
      }

      // Create an embed for each map
      for (let i = 0; i < maps.length; i++) {
        const mapIdentifier = maps[i];
        const mapNumber = i + 1;
        const mapNote = mapNotes[mapIdentifier];
        const mapEmbedData = await this.createMapEmbed(gameId, mapIdentifier, mapNumber, mapNote);
        if (mapEmbedData) {
          const messageOptions: any = { embeds: [mapEmbedData.embed] };
          if (mapEmbedData.attachment) {
            messageOptions.files = [mapEmbedData.attachment];
          }
          await thread.send(messageOptions);
        }
      }

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
        
        
        if (gameData) {
          gameName = gameData.name;
          if (gameData.color) {
            // Convert hex string to number (remove # and parse as hex)
            const colorHex = gameData.color.replace('#', '');
            gameColor = parseInt(colorHex, 16);
          } else {
          }
        } else {
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
          
        } else {
          console.warn(`⚠️ Event image not found: ${imagePath}`);
        }
      } catch (error) {
        console.error(`❌ Error handling event image ${eventImageUrl}:`, error);
      }
    }

    return { embed, attachment };
  }

  private async createMapEmbed(gameId: string, mapIdentifier: string, mapNumber?: number, mapNote?: string): Promise<{ embed: EmbedBuilder; attachment?: AttachmentBuilder } | null> {
    if (!this.db) return null;

    try {
      // Strip timestamp suffix from map identifier if present (e.g., "yacht-hostage-1756235829102" -> "yacht-hostage")
      const cleanMapId = mapIdentifier.replace(/-\d+$/, '');
      
      // Get map data from database - try exact match first
      let mapData = await this.db.get<{
        name: string, 
        image_url: string, 
        location: string,
        mode_id: string
      }>(`
        SELECT gm.name, gm.image_url, gm.location, gm.mode_id
        FROM game_maps gm
        WHERE gm.game_id = ? AND (gm.id = ? OR LOWER(gm.name) LIKE LOWER(?))
        LIMIT 1
      `, [gameId, cleanMapId, `%${cleanMapId}%`]);

      // If no exact match, try matching by base map name regardless of mode/naming variations
      if (!mapData) {
        const parts = cleanMapId.split('-');
        if (parts.length >= 2) {
          const baseMapName = parts[0]; // e.g., "emerald", "bartlett"
          const remainingParts = parts.slice(1).join('-'); // e.g., "secure-area" or "u-hostage"
          
          // Try to find any map with matching base name and similar remaining parts
          mapData = await this.db.get<{
            name: string, 
            image_url: string, 
            location: string,
            mode_id: string
          }>(`
            SELECT gm.name, gm.image_url, gm.location, gm.mode_id
            FROM game_maps gm
            WHERE gm.game_id = ? AND gm.id LIKE ?
            LIMIT 1
          `, [gameId, `${baseMapName}%${remainingParts.split('-').pop()}`]);
        }
      }

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

      if (mapNote && mapNote.trim()) {
        embed.addFields({ name: '📝 Note', value: mapNote.trim(), inline: false });
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
        }
      } catch (error) {
        console.error(`❌ Error handling reminder image ${eventData.event_image_url}:`, error);
      }
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
      console.warn('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for match start notifications
    const matchStartChannels = await this.getChannelsForNotificationType('match_start');
    
    if (matchStartChannels.length === 0) {
      console.warn('⚠️ No channels configured for match start notifications');
      return false;
    }

    try {
      // Create match start embed
      const { embed, attachment } = await this.createMatchStartEmbed(eventData);

      // Build message options
      const messageOptions: any = {
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
          console.error(`❌ Failed to send match start announcement to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        console.error('❌ Failed to send match start announcement to any channels');
        return false;
      }

      return { success: true, successCount };

    } catch (error) {
      console.error('❌ Error posting match start announcement:', error);
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
    // Get game data and match voice channels
    let gameName = eventData.game_id;
    let gameColor = 0xe74c3c; // Red color for match start
    let attachment: AttachmentBuilder | undefined;
    let blueTeamVoiceChannel: string | null = null;
    let redTeamVoiceChannel: string | null = null;

    if (this.db) {
      try {
        // Get game data and match voice channels in one query
        const matchData = await this.db.get<{
          game_name: string;
          game_color?: string;
          game_icon?: string;
          blue_team_voice_channel?: string;
          red_team_voice_channel?: string;
        }>(`
          SELECT g.name as game_name, g.color as game_color, g.icon_url as game_icon,
                 m.blue_team_voice_channel, m.red_team_voice_channel
          FROM matches m
          JOIN games g ON m.game_id = g.id
          WHERE m.id = ?
        `, [eventData.id]);
        
        if (matchData) {
          gameName = matchData.game_name;
          blueTeamVoiceChannel = matchData.blue_team_voice_channel || null;
          redTeamVoiceChannel = matchData.red_team_voice_channel || null;
          if (matchData.game_color) {
            gameColor = parseInt(matchData.game_color.replace('#', ''), 16);
          }
        }
      } catch (error) {
        console.error('Error fetching match data for match start:', error);
      }
    }

    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle(`🚀 ${eventData.name} - MATCH STARTING NOW!`)
      .setDescription(eventData.description || `The ${eventData.name} match is beginning!`)
      .setColor(gameColor)
      .addFields([
        { name: '🎮 Game', value: gameName, inline: true },
        { name: '🏆 Type', value: eventData.type.charAt(0).toUpperCase() + eventData.type.slice(1), inline: true },
        { name: '👥 Max Players', value: eventData.max_participants.toString(), inline: true }
      ])
      .setTimestamp()
      .setFooter({ text: 'Match Starting' });

    // Add maps if available - fetch names from database
    if (eventData.maps && eventData.maps.length > 0) {
      let mapList = eventData.maps.join(', '); // Fallback to IDs
      
      // Try to get map names from database
      if (this.db) {
        try {
          const mapNames: string[] = [];
          for (const mapId of eventData.maps) {
            // Clean the map ID (remove timestamp suffix if present)
            const cleanMapId = mapId.replace(/-\d+$/, '');
            
            // Get map name from database
            const mapData = await this.db.get<{ name: string }>(`
              SELECT name FROM game_maps 
              WHERE game_id = ? AND (id = ? OR LOWER(name) LIKE LOWER(?))
              LIMIT 1
            `, [eventData.game_id, cleanMapId, `%${cleanMapId}%`]);
            
            if (mapData) {
              mapNames.push(mapData.name);
            } else {
              // Fallback to the original ID if name not found
              mapNames.push(mapId);
            }
          }
          
          if (mapNames.length > 0) {
            mapList = mapNames.length > 3 
              ? `${mapNames.slice(0, 3).join(', ')} +${mapNames.length - 3} more`
              : mapNames.join(', ');
          }
        } catch (error) {
          console.error('Error fetching map names for match start:', error);
          // Keep the original mapList as fallback
        }
      }
      
      embed.addFields([{ name: '🗺️ Maps', value: mapList, inline: false }]);
    }

    // Get team assignments and add them to the embed
    if (this.db) {
      try {
        const participants = await this.db.all<{
          username: string;
          team_assignment?: string;
          discord_user_id?: string;
        }>(`
          SELECT username, team_assignment, discord_user_id
          FROM match_participants
          WHERE match_id = ?
          ORDER BY team_assignment ASC, username ASC
        `, [eventData.id]);

        if (participants && participants.length > 0) {
          // Group participants by team
          const blueTeam = participants.filter(p => p.team_assignment === 'blue');
          const redTeam = participants.filter(p => p.team_assignment === 'red');
          const reserves = participants.filter(p => p.team_assignment === 'reserve' || !p.team_assignment);

          // Add team rosters
          if (blueTeam.length > 0) {
            const blueList = blueTeam.map(p => 
              p.discord_user_id ? `<@${p.discord_user_id}>` : p.username
            ).join('\n');
            
            let blueFieldValue = blueList;
            if (blueTeamVoiceChannel) {
              blueFieldValue += `\n\n🎙️ Voice: <#${blueTeamVoiceChannel}>`;
            }
            
            embed.addFields([{ 
              name: '🔵 Blue Team', 
              value: blueFieldValue, 
              inline: true 
            }]);
          }

          if (redTeam.length > 0) {
            const redList = redTeam.map(p => 
              p.discord_user_id ? `<@${p.discord_user_id}>` : p.username
            ).join('\n');
            
            let redFieldValue = redList;
            if (redTeamVoiceChannel) {
              redFieldValue += `\n\n🎙️ Voice: <#${redTeamVoiceChannel}>`;
            }
            
            embed.addFields([{ 
              name: '🔴 Red Team', 
              value: redFieldValue, 
              inline: true 
            }]);
          }

          if (reserves.length > 0) {
            const reserveList = reserves.map(p => 
              p.discord_user_id ? `<@${p.discord_user_id}>` : p.username
            ).join('\n');
            embed.addFields([{ 
              name: '🟡 Reserves', 
              value: reserveList, 
              inline: true 
            }]);
          }
        }
      } catch (error) {
        console.error('Error fetching team assignments for match start:', error);
      }
    }

    // Add link to original match info if available
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

        if (originalMessage && this.client.guilds.cache.first()) {
          const guildId = this.client.guilds.cache.first()?.id;
          const messageLink = `https://discord.com/channels/${guildId}/${originalMessage.channel_id}/${originalMessage.message_id}`;
          embed.addFields([{ 
            name: '🔗 Match Details', 
            value: `[View Full Match Info](${messageLink})`, 
            inline: false 
          }]);
        }
      } catch (error) {
        console.error('Error finding original announcement message:', error);
      }
    }

    // Add livestream link if available
    if (eventData.livestream_link) {
      embed.addFields([{ name: '📺 Livestream', value: `[Watch Live](${eventData.livestream_link})`, inline: false }]);
    }

    // Add event image if provided
    if (eventData.event_image_url && eventData.event_image_url.trim()) {
      try {
        const imagePath = path.join(process.cwd(), 'public', eventData.event_image_url.replace(/^\//, ''));
        
        if (fs.existsSync(imagePath)) {
          attachment = new AttachmentBuilder(imagePath, {
            name: `match_start_image.${path.extname(imagePath).slice(1)}`
          });
          
          embed.setImage(`attachment://match_start_image.${path.extname(imagePath).slice(1)}`);
        }
      } catch (error) {
        console.error(`❌ Error handling match start image ${eventData.event_image_url}:`, error);
      }
    }

    return { embed, attachment };
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
      console.warn('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for live updates (match_start)
    const liveUpdateChannels = await this.getChannelsForNotificationType('match_start');
    
    if (liveUpdateChannels.length === 0) {
      console.warn('⚠️ No channels configured for live updates');
      return false;
    }

    try {
      // Create score notification embed
      const { embed, attachment } = await this.createMapScoreEmbed(scoreData);

      // Build message options
      const messageOptions: any = {
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
          console.error(`❌ Failed to send map score notification to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        console.error('❌ Failed to send map score notification to any channels');
        return false;
      }

      return { success: true, successCount };

    } catch (error) {
      console.error('❌ Error posting map score notification:', error);
      return false;
    }
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
    // Get game data and map details
    let gameName = scoreData.gameId;
    let gameColor = 0x00d4aa; // Green for victory
    let mapName = scoreData.mapId;
    let mapImageUrl: string | null = null;
    let attachment: AttachmentBuilder | undefined;
    let totalMaps = 0;

    if (this.db) {
      try {
        // Get game data
        const gameData = await this.db.get<{name: string, color: string}>(`
          SELECT name, color FROM games WHERE id = ?
        `, [scoreData.gameId]);
        
        if (gameData) {
          gameName = gameData.name;
          if (gameData.color) {
            gameColor = parseInt(gameData.color.replace('#', ''), 16);
          }
        }

        // Get map data
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
        `, [scoreData.gameId, scoreData.mapId, `%${scoreData.mapId}%`]);

        if (mapData) {
          mapName = mapData.name;
          mapImageUrl = mapData.image_url;
        }

        // Get total number of maps in this match
        const mapCountData = await this.db.get<{total_maps: number}>(`
          SELECT COUNT(*) as total_maps
          FROM match_games
          WHERE match_id = ?
        `, [scoreData.matchId]);

        if (mapCountData) {
          totalMaps = mapCountData.total_maps;
        }
      } catch (error) {
        console.error('Error fetching game/map data for score notification:', error);
      }
    }

    // Create the embed
    const mapProgress = totalMaps > 0 ? `${scoreData.gameNumber}/${totalMaps}` : scoreData.gameNumber.toString();
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${scoreData.winningTeamName} Wins Map ${scoreData.gameNumber}!`)
      .setDescription(`**${scoreData.matchName}** - ${mapName}`)
      .setColor(gameColor)
      .addFields([
        { name: '🎮 Game', value: gameName, inline: true },
        { name: '🗺️ Map', value: mapName, inline: true },
        { name: '📊 Map Progress', value: mapProgress, inline: true }
      ])
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Live Score Update' });

    // Add winning team players
    if (scoreData.winningPlayers.length > 0) {
      const playersList = scoreData.winningPlayers.join('\n');
      embed.addFields([{ 
        name: `${scoreData.winningTeamName} Players`, 
        value: playersList, 
        inline: false 
      }]);
    }

    // Add map image if available
    if (mapImageUrl) {
      try {
        const imagePath = path.join(process.cwd(), 'public', mapImageUrl.replace(/^\//, ''));
        
        if (fs.existsSync(imagePath)) {
          attachment = new AttachmentBuilder(imagePath, {
            name: `map_score_${mapName.replace(/[^a-zA-Z0-9]/g, '_')}.${path.extname(imagePath).slice(1)}`
          });
          
          const attachmentName = `map_score_${mapName.replace(/[^a-zA-Z0-9]/g, '_')}.${path.extname(imagePath).slice(1)}`;
          embed.setImage(`attachment://${attachmentName}`);
        }
      } catch (error) {
        console.error(`❌ Error handling map image for score notification:`, error);
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
      console.warn('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for live updates (match_start)
    const matchEndChannels = await this.getChannelsForNotificationType('match_start');
    
    if (matchEndChannels.length === 0) {
      console.warn('⚠️ No channels configured for match end notifications');
      return false;
    }

    try {
      // Create match winner embed
      const { embed, attachment } = await this.createMatchWinnerEmbed(winnerData);

      // Build message options
      const messageOptions: any = {
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
          console.error(`❌ Failed to send match winner notification to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        console.error('❌ Failed to send match winner notification to any channels');
        return false;
      }

      return { success: true, successCount };

    } catch (error) {
      console.error('❌ Error posting match winner notification:', error);
      return false;
    }
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
    // Get game data
    let gameName = winnerData.gameId;
    let gameColor = winnerData.winner === 'tie' ? 0xffa500 : 0x00d4aa; // Orange for tie, green for victory
    let attachment: AttachmentBuilder | undefined;

    if (this.db) {
      try {
        // Get game data
        const gameData = await this.db.get<{name: string, color: string}>(`
          SELECT name, color FROM games WHERE id = ?
        `, [winnerData.gameId]);
        
        if (gameData) {
          gameName = gameData.name;
          if (gameData.color) {
            gameColor = parseInt(gameData.color.replace('#', ''), 16);
          }
        }
      } catch (error) {
        console.error('Error fetching game data for match winner notification:', error);
      }
    }

    // Create appropriate title and description based on winner
    let title: string;
    let description: string;
    
    if (winnerData.winner === 'tie') {
      title = `🤝 ${winnerData.matchName} - Match Tied!`;
      description = `The match ended in a **${winnerData.team1Score}-${winnerData.team2Score}** tie!`;
    } else {
      title = `🏆 ${winnerData.winningTeamName} Wins ${winnerData.matchName}!`;
      const losingScore = winnerData.winner === 'team1' ? winnerData.team2Score : winnerData.team1Score;
      const winningScore = winnerData.winner === 'team1' ? winnerData.team1Score : winnerData.team2Score;
      description = `**${winnerData.matchName}** is complete! Final score: **${winningScore}-${losingScore}**`;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(gameColor)
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
        name: `${winnerData.winningTeamName} Players`, 
        value: playersList, 
        inline: false 
      }]);
    }

    // Add link to original match info if available
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
        `, [winnerData.matchId]);

        if (originalMessage && this.client.guilds.cache.first()) {
          const guildId = this.client.guilds.cache.first()?.id;
          const messageLink = `https://discord.com/channels/${guildId}/${originalMessage.channel_id}/${originalMessage.message_id}`;
          embed.addFields([{ 
            name: '🔗 Match Details', 
            value: `[View Original Match Info](${messageLink})`, 
            inline: false 
          }]);
        }
      } catch (error) {
        console.error('Error finding original announcement message for match winner:', error);
      }
    }

    return { embed, attachment };
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}