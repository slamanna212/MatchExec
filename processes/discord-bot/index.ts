import fs from 'fs';
import path from 'path';
import { 
  Client, 
  GatewayIntentBits, 
  SlashCommandBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder, 
  EmbedBuilder, 
  ChannelType, 
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventEntityType,
  ComponentType,
  Events,
  ActivityType,
  REST,
  Routes,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  MessageFlags,
  Message,
  GuildScheduledEventCreateOptions,
  AttachmentBuilder
} from 'discord.js';
import { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnectionStatus,
  getVoiceConnection,
  entersState
} from '@discordjs/voice';
import { initializeDatabase } from '../../lib/database';
import { Database } from '../../lib/database/connection';
import { SignupFormLoader, SignupField } from '../../lib/signup-forms';

interface DiscordSettings {
  bot_token: string;
  guild_id: string;
  announcement_role_id?: string;
  mention_everyone?: boolean;
  event_duration_minutes?: number;
  match_reminder_minutes?: number;
  player_reminder_minutes?: number;
  announcer_voice?: string;
  voice_announcements_enabled?: boolean;
}

interface DiscordChannel {
  id: string;
  discord_channel_id: string;
  channel_name?: string;
  channel_type: 'text' | 'voice';
  send_announcements: boolean;
  send_reminders: boolean;
  send_match_start: boolean;
  send_signup_updates: boolean;
}

class MatchExecBot {
  private client: Client;
  private db: Database | null = null;
  private settings: DiscordSettings | null = null;
  private isReady = false;
  private audioPlayer = createAudioPlayer();
  private voiceConnections = new Map<string, any>(); // channelId -> connection

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.client.once(Events.ClientReady, async (readyClient) => {
      console.log(`✅ Discord bot ready! Logged in as ${readyClient.user.tag}`);
      this.isReady = true;
      
      // Set bot status
      this.client.user?.setActivity('Match Management', { type: ActivityType.Playing });
      
      // Register slash commands
      await this.registerSlashCommands();
      
      // Start announcement queue processor
      this.startAnnouncementProcessor();
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.handleModalSubmit(interaction);
      }
    });

    this.client.on(Events.Error, (error) => {
      console.error('❌ Discord client error:', error);
    });

    this.client.on(Events.Warn, (warning) => {
      console.warn('⚠️ Discord client warning:', warning);
    });

    this.client.on(Events.Debug, (info) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('🐛 Discord debug:', info);
      }
    });
  }

  private async loadSettings(): Promise<DiscordSettings | null> {
    if (!this.db) {
      console.error('❌ Database not initialized');
      return null;
    }

    try {
      const settings = await this.db.get<DiscordSettings>(`
        SELECT 
          bot_token,
          guild_id,
          announcement_role_id,
          mention_everyone,
          event_duration_minutes,
          match_reminder_minutes,
          player_reminder_minutes,
          announcer_voice,
          voice_announcements_enabled
        FROM discord_settings 
        WHERE id = 1
      `);

      if (!settings?.bot_token) {
        console.log('⚠️ No bot token found in database');
        return null;
      }

      return settings;
    } catch (error) {
      console.error('❌ Error loading Discord settings:', error);
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
      
      const channels = await this.db.all<DiscordChannel>(`
        SELECT 
          id,
          discord_channel_id,
          channel_name,
          channel_type,
          send_announcements,
          send_reminders,
          send_match_start,
          send_signup_updates
        FROM discord_channels 
        WHERE channel_type = 'text' AND ${column} = 1
      `);

      return channels.map(channel => ({
        ...channel,
        send_announcements: Boolean(channel.send_announcements),
        send_reminders: Boolean(channel.send_reminders),
        send_match_start: Boolean(channel.send_match_start),
        send_signup_updates: Boolean(channel.send_signup_updates)
      }));
    } catch (error) {
      console.error(`❌ Error loading channels for ${notificationType}:`, error);
      return [];
    }
  }

  private async registerSlashCommands() {
    if (!this.settings?.bot_token || !this.settings?.guild_id) {
      console.warn('⚠️ Missing bot token or guild ID, skipping command registration');
      return;
    }

    const commands = [
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check bot status and configuration')
    ];

    try {
      const rest = new REST().setToken(this.settings.bot_token);
      
      console.log('🔄 Started refreshing application (/) commands.');

      const data = await rest.put(
        Routes.applicationGuildCommands(this.client.user!.id, this.settings.guild_id),
        { body: commands }
      ) as any[];

      console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
      console.error('❌ Error registering slash commands:', error);
    }
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction) {
    const { commandName } = interaction;

    try {
      switch (commandName) {
        case 'status':
          await this.handleStatusCommand(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown command.',
            flags: MessageFlags.Ephemeral
          });
      }
    } catch (error) {
      console.error('❌ Error handling slash command:', error);
      
      const errorMessage = '❌ An error occurred while processing your command.';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      }
    }
  }


  private async handleStatusCommand(interaction: ChatInputCommandInteraction) {
    const uptime = process.uptime();
    const uptimeString = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
    
    const status = [
      `🤖 **MatchExec Bot Status**`,
      `✅ Bot Online`,
      `⏱️ Uptime: ${uptimeString}`,
      `🏠 Guild: ${interaction.guildId}`,
      `📡 Ping: ${this.client.ws.ping}ms`,
      `🗄️ Database: ${this.db ? '✅ Connected' : '❌ Disconnected'}`
    ].join('\n');

    await interaction.reply({
      content: status,
      flags: MessageFlags.Ephemeral
    });
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
    if (!this.isReady) {
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
      if (this.settings.mention_everyone) {
        mentionText = '@everyone';
      } else if (this.settings.announcement_role_id) {
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

      // Use the main message for thread and event creation
      const message = mainMessage!;

      let threadId: string | null = null;
      let discordEventId: string | null = null;

      // Create maps thread if there are maps
      if (eventData.maps && eventData.maps.length > 0) {
        const thread = await this.createMapsThread(message, eventData.name, eventData.game_id, eventData.maps);
        threadId = thread?.id || null;
      }

      // Create Discord server event
      if (eventData.start_date && typeof eventData.start_date === 'string') {
        const rounds = eventData.maps?.length || 1;
        discordEventId = await this.createDiscordEvent({
          ...eventData,
          start_date: eventData.start_date
        }, message, rounds);
      }

      // Store Discord message information for later cleanup
      if (this.db) {
        try {
          const messageRecordId = `discord_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await this.db.run(`
            INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, thread_id, discord_event_id, message_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [messageRecordId, eventData.id, message.id, message.channelId, threadId, discordEventId, 'announcement']);
          
          console.log(`✅ Stored Discord message tracking for match: ${eventData.id}`);
        } catch (error) {
          console.error('❌ Error storing Discord message tracking:', error);
        }
      }

      console.log(`✅ Event announcement posted to ${successCount} channel(s) for: ${eventData.name}`);
      return true;

    } catch (error) {
      console.error('❌ Error posting event announcement:', error);
      return false;
    }
  }

  async sendPlayerReminders(matchId: string): Promise<boolean> {
    if (!this.isReady) {
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
        console.log('ℹ️ No participants with Discord IDs found for player reminders:', matchId);
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
          console.log(`✅ Sent player reminder DM to ${participant.username} (${participant.discord_user_id})`);

        } catch (error) {
          failureCount++;
          console.error(`❌ Failed to send player reminder DM to ${participant.username} (${participant.discord_user_id}):`, error);
        }
      }

      const totalParticipants = participants.length;
      console.log(`📩 Player reminder results: ${successCount}/${totalParticipants} sent successfully, ${failureCount} failed`);

      return successCount > 0; // Success if at least one DM was sent

    } catch (error) {
      console.error('❌ Error sending player reminders:', error);
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

  async sendSignupNotification(matchId: string, signupInfo: {
    username: string;
    discordUserId: string;
    signupData: {[key: string]: string};
    participantCount: number;
  }): Promise<boolean> {
    if (!this.isReady) {
      console.warn('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for signup updates
    const signupChannels = await this.getChannelsForNotificationType('signup_updates');
    
    if (signupChannels.length === 0) {
      console.log('ℹ️ No channels configured for signup updates');
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

      console.log(`✅ Signup notification sent to ${successCount} channel(s) for: ${matchData.name}`);
      return true;

    } catch (error) {
      console.error('❌ Error sending signup notification:', error);
      return false;
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

  private async createDiscordEvent(eventData: {
    id: string;
    name: string;
    description: string;
    game_id: string;
    type: 'competitive' | 'casual';
    start_date: string;
    livestream_link?: string;
    event_image_url?: string;
  }, message: Message, rounds: number = 1): Promise<string | null> {
    try {
      const guild = this.client.guilds.cache.get(this.settings?.guild_id || '');
      if (!guild) {
        console.warn('⚠️ Guild not found for Discord event creation');
        return null;
      }

      // Get game name for better event description
      let gameName = eventData.game_id;
      if (this.db) {
        try {
          const gameData = await this.db.get<{name: string}>(`
            SELECT name FROM games WHERE id = ?
          `, [eventData.game_id]);
          if (gameData) {
            gameName = gameData.name;
          }
        } catch (error) {
          console.error('Error fetching game name for Discord event:', error);
        }
      }

      // Calculate event duration based on settings and rounds
      const durationMinutes = (this.settings?.event_duration_minutes || 45) * rounds;
      const startTime = new Date(eventData.start_date);
      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

      // Create event description with match details and link to announcement
      let eventDescription = eventData.description || 'Join us for this exciting match!';
      eventDescription += `\n\n🎯 Game: ${gameName}`;
      eventDescription += `\n🏆 Type: ${eventData.type === 'competitive' ? 'Competitive' : 'Casual'}`;
      
      if (eventData.livestream_link) {
        eventDescription += `\n📺 Livestream: ${eventData.livestream_link}`;
      }

      // Add link to the announcement message
      eventDescription += `\n\n📢 View full details: https://discord.com/channels/${guild.id}/${message.channelId}/${message.id}`;

      const eventOptions: GuildScheduledEventCreateOptions = {
        name: eventData.name,
        description: eventDescription.substring(0, 1000), // Discord limit
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: {
          location: eventData.livestream_link || 'Discord Server'
        }
      };

      // Add cover image if event image is provided
      if (eventData.event_image_url) {
        try {
          // Convert URL path to file system path for local files
          const imagePath = path.join(process.cwd(), 'public', eventData.event_image_url.replace(/^\//, ''));
          
          if (fs.existsSync(imagePath)) {
            // Read the image file as a buffer
            const imageBuffer = fs.readFileSync(imagePath);
            eventOptions.image = imageBuffer;
            console.log(`✅ Added cover image to Discord event: ${eventData.event_image_url}`);
          } else {
            console.warn(`⚠️ Event image not found for Discord event: ${imagePath}`);
          }
        } catch (error) {
          console.error(`❌ Error adding cover image to Discord event:`, error);
        }
      }

      const discordEvent = await guild.scheduledEvents.create(eventOptions);
      
      console.log(`✅ Created Discord event: ${discordEvent.name} (ID: ${discordEvent.id}) - Duration: ${durationMinutes} minutes (${rounds} rounds × ${this.settings?.event_duration_minutes || 45} min/round)`);
      return discordEvent.id;

    } catch (error) {
      console.error('❌ Error creating Discord event:', error);
      return null;
    }
  }

  private async createMapsThread(message: Message, eventName: string, gameId: string, maps: string[]): Promise<any> {
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
      console.error('Error creating map embed:', error);
      return null;
    }
  }

  private async handleButtonInteraction(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith('signup_')) return;

    const eventId = interaction.customId.replace('signup_', '');

    try {
      // Check if user is already signed up
      if (this.db) {
        const existingParticipant = await this.db.get(`
          SELECT id FROM match_participants 
          WHERE match_id = ? AND user_id = ?
        `, [eventId, interaction.user.id]);

        if (existingParticipant) {
          await interaction.reply({
            content: '✅ You are already signed up for this event!',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Check if event is full
        const participantCount = await this.db.get<{count: number}>(`
          SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?
        `, [eventId]);

        const eventData = await this.db.get<{max_signups: number, game_id: string}>(`
          SELECT m.game_id, g.max_signups 
          FROM matches m 
          JOIN games g ON m.game_id = g.id 
          WHERE m.id = ?
        `, [eventId]);

        if ((participantCount?.count ?? 0) >= (eventData?.max_signups || 16)) {
          await interaction.reply({
            content: '❌ This event is full!',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Load the game-specific signup form
        const signupForm = await SignupFormLoader.loadSignupForm(eventData?.game_id || '');
        if (!signupForm) {
          await interaction.reply({
            content: '❌ Could not load signup form. Please try again.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Create dynamic modal based on signup form
        const modal = new ModalBuilder()
          .setCustomId(`signup_form_${eventId}`)
          .setTitle('Event Sign Up');

        const rows: ActionRowBuilder<TextInputBuilder>[] = [];

        for (let i = 0; i < Math.min(signupForm.fields.length, 5); i++) { // Discord modal limit is 5 components
          const field = signupForm.fields[i];
          
          const textInput = new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label)
            .setStyle(field.type === 'largetext' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(field.required)
            .setMaxLength(field.type === 'largetext' ? 1000 : 100);

          if (field.placeholder) {
            textInput.setPlaceholder(field.placeholder);
          }

          const row = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(textInput);
          
          rows.push(row);
        }

        modal.addComponents(...rows);
        await interaction.showModal(modal);
      }

    } catch (error) {
      console.error('❌ Error handling signup button:', error);
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  private async handleModalSubmit(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith('signup_form_')) return;

    const eventId = interaction.customId.replace('signup_form_', '');

    try {
      if (this.db) {
        // Get game ID to load the signup form structure
        const eventData = await this.db.get<{game_id: string}>(`
          SELECT game_id FROM matches WHERE id = ?
        `, [eventId]);

        if (!eventData) {
          throw new Error('Event not found');
        }

        // Load signup form to get field structure
        const signupForm = await SignupFormLoader.loadSignupForm(eventData.game_id);
        if (!signupForm) {
          throw new Error('Could not load signup form');
        }

        // Collect all form data
        const signupData: {[key: string]: string} = {};
        let displayUsername = interaction.user.username; // fallback

        for (const field of signupForm.fields) {
          try {
            const value = interaction.fields.getTextInputValue(field.id);
            signupData[field.id] = value;

            // Use the first field as the display username (usually username/battlenet_name)
            if (field.id === 'username' || field.id === 'battlenet_name') {
              displayUsername = value;
            }
          } catch (e) {
            // Field might not exist in modal if we hit the 5-field limit
            if (field.required) {
              throw new Error(`Required field ${field.id} is missing`);
            }
          }
        }

        // Generate participant ID
        const participantId = `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Add participant to database with signup data and Discord user ID
        await this.db.run(`
          INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, signup_data)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [participantId, eventId, interaction.user.id, interaction.user.id, displayUsername, JSON.stringify(signupData)]);

        // Get current participant count
        const participantCount = await this.db.get<{count: number}>(`
          SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?
        `, [eventId]);

        // Create confirmation message with submitted data
        let confirmationMessage = `✅ Successfully signed up for the event!\n`;
        
        // Show key information from the signup form
        for (const field of signupForm.fields.slice(0, 3)) { // Show first 3 fields
          if (signupData[field.id]) {
            const label = field.label.replace(/\s*\(Optional\)\s*$/i, ''); // Remove "(Optional)" from display
            confirmationMessage += `**${label}:** ${signupData[field.id]}\n`;
          }
        }
        
        confirmationMessage += `**Participants:** ${participantCount?.count || 1}`;

        await interaction.reply({
          content: confirmationMessage,
          flags: MessageFlags.Ephemeral
        });

        // Send signup notification to configured channels
        await this.sendSignupNotification(eventId, {
          username: displayUsername,
          discordUserId: interaction.user.id,
          signupData: signupData,
          participantCount: participantCount?.count || 1
        });

        console.log(`✅ User ${interaction.user.tag} (${displayUsername}) signed up for event ${eventId}:`, signupData);
      } else {
        throw new Error('Database not available');
      }

    } catch (error) {
      console.error('❌ Error processing signup:', error);
      
      if (error instanceof Error && error.message?.includes('UNIQUE constraint failed')) {
        await interaction.reply({
          content: '❌ You are already signed up for this event!',
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: `❌ Failed to sign up: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }

  private startAnnouncementProcessor() {
    // Process announcement queue every 10 seconds
    setInterval(async () => {
      await this.processAnnouncementQueue();
    }, 10000);
    
    // Process deletion queue every 10 seconds
    setInterval(async () => {
      await this.processDeletionQueue();
    }, 10000);
    
    // Process status update queue every 10 seconds
    setInterval(async () => {
      await this.processStatusUpdateQueue();
    }, 10000);
    
    // Process reminder queue every 10 seconds
    setInterval(async () => {
      await this.processReminderQueue();
    }, 10000);
    
    // Process match start notification queue every 10 seconds
    setInterval(async () => {
      await this.processMatchStartQueue();
    }, 10000);
    
    // Process player reminder queue every 10 seconds
    setInterval(async () => {
      await this.processPlayerReminderQueue();
    }, 10000);
    
    // Clean up expired match messages every hour
    setInterval(async () => {
      await this.cleanupExpiredMatches();
    }, 3600000); // 1 hour
    
    console.log('✅ Announcement queue processor started');
    console.log('✅ Deletion queue processor started');
    console.log('✅ Status update queue processor started');
    console.log('✅ Reminder queue processor started');
    console.log('✅ Match start notification queue processor started');
    console.log('✅ Player reminder queue processor started');
    console.log('✅ Expired match cleanup scheduler started');
  }

  private async processAnnouncementQueue() {
    if (!this.db || !this.isReady) {
      return;
    }

    try {
      // Get pending announcements
      const pendingAnnouncements = await this.db.all<{
        id: string;
        match_id: string;
        name: string;
        description: string;
        game_id: string;
        max_participants: number;
        guild_id: string;
        maps?: string;
        livestream_link?: string;
        event_image_url?: string;
        start_date?: string;
        rules?: 'competitive' | 'casual';
      }>(`
        SELECT daq.*, m.name, m.description, m.game_id, m.max_participants, m.guild_id, m.maps, m.livestream_link, m.event_image_url, m.start_date, m.rules
        FROM discord_announcement_queue daq
        JOIN matches m ON daq.match_id = m.id
        WHERE daq.status = 'pending'
        ORDER BY daq.created_at ASC
        LIMIT 5
      `);

      for (const announcement of pendingAnnouncements) {
        try {
          // Parse maps if they exist
          let maps: string[] = [];
          if (announcement.maps) {
            try {
              maps = JSON.parse(announcement.maps);
            } catch (e) {
              maps = [];
            }
          }

          // Post the announcement
          const success = await this.postEventAnnouncement({
            id: announcement.match_id,
            name: announcement.name,
            description: announcement.description || 'No description provided',
            game_id: announcement.game_id,
            type: announcement.rules || 'casual', // Use rules field from database
            maps: maps,
            max_participants: announcement.max_participants,
            guild_id: announcement.guild_id,
            livestream_link: announcement.livestream_link,
            event_image_url: announcement.event_image_url,
            start_date: announcement.start_date
          });

          if (success) {
            // Mark as posted
            await this.db.run(`
              UPDATE discord_announcement_queue 
              SET status = 'posted', posted_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [announcement.id]);
            
            console.log(`✅ Posted announcement for: ${announcement.name}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_announcement_queue 
              SET status = 'failed', error_message = 'Failed to post announcement'
              WHERE id = ?
            `, [announcement.id]);
            
            console.log(`❌ Failed to post announcement for: ${announcement.name}`);
          }
        } catch (error) {
          console.error(`❌ Error processing announcement for ${announcement.name}:`, error);
          
          // Mark as failed with error message
          await this.db.run(`
            UPDATE discord_announcement_queue 
            SET status = 'failed', error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', announcement.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing announcement queue:', error);
    }
  }

  private async processDeletionQueue() {
    if (!this.db || !this.isReady) {
      return;
    }

    try {
      // Get pending deletions
      const pendingDeletions = await this.db.all<{
        id: string;
        match_id: string;
        status: string;
        created_at: string;
      }>(`
        SELECT * FROM discord_deletion_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const deletion of pendingDeletions) {
        try {
          const success = await this.deleteMatchAnnouncement(deletion.match_id);

          if (success) {
            // Mark as completed
            await this.db.run(`
              UPDATE discord_deletion_queue 
              SET status = 'completed', processed_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [deletion.id]);
            
            console.log(`✅ Processed deletion for match: ${deletion.match_id}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_deletion_queue 
              SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = 'Deletion failed'
              WHERE id = ?
            `, [deletion.id]);
            
            console.log(`❌ Failed to delete messages for match: ${deletion.match_id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing deletion for match ${deletion.match_id}:`, error);
          
          // Mark as failed with error message
          await this.db.run(`
            UPDATE discord_deletion_queue 
            SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', deletion.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing deletion queue:', error);
    }
  }

  private async processStatusUpdateQueue() {
    if (!this.db || !this.isReady) {
      return;
    }

    try {
      // Get pending status updates
      const pendingUpdates = await this.db.all<{
        id: string;
        match_id: string;
        new_status: string;
        status: string;
        created_at: string;
      }>(`
        SELECT * FROM discord_status_update_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const update of pendingUpdates) {
        try {
          const success = await this.updateMatchStatus(update.match_id, update.new_status);

          if (success) {
            // Mark as processed
            await this.db.run(`
              UPDATE discord_status_update_queue 
              SET status = 'processed', processed_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [update.id]);
            
            console.log(`✅ Processed status update for match ${update.match_id} -> ${update.new_status}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_status_update_queue 
              SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = 'Status update failed'
              WHERE id = ?
            `, [update.id]);
            
            console.log(`❌ Failed to update Discord message for match: ${update.match_id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing status update for match ${update.match_id}:`, error);
          
          // Mark as failed with error message
          await this.db.run(`
            UPDATE discord_status_update_queue 
            SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = ?
            WHERE id = ?
          `, [(error as Error)?.message || 'Unknown error', update.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing status update queue:', error);
    }
  }

  private async processReminderQueue() {
    if (!this.db || !this.isReady) {
      return;
    }

    try {
      // Get pending reminders
      const pendingReminders = await this.db.all<{
        id: string;
        match_id: string;
        status: string;
        created_at: string;
      }>(`
        SELECT * FROM discord_match_reminder_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const reminder of pendingReminders) {
        try {
          const success = await this.postMatchReminder(reminder.match_id);

          if (success) {
            // Mark as processed
            await this.db.run(`
              UPDATE discord_match_reminder_queue 
              SET status = 'processed', processed_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [reminder.id]);
            
            console.log(`✅ Processed match reminder for: ${reminder.match_id}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_match_reminder_queue 
              SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = 'Reminder failed'
              WHERE id = ?
            `, [reminder.id]);
            
            console.log(`❌ Failed to post match reminder for: ${reminder.match_id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing reminder for match ${reminder.match_id}:`, error);
          
          // Mark as failed with error message
          await this.db.run(`
            UPDATE discord_match_reminder_queue 
            SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', reminder.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing reminder queue:', error);
    }
  }

  private async processMatchStartQueue() {
    if (!this.db || !this.isReady) {
      return;
    }

    try {
      // Get pending match start notifications
      const pendingNotifications = await this.db.all<{
        id: string;
        match_id: string;
        status: string;
        created_at: string;
      }>(`
        SELECT * FROM discord_match_start_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 5
      `);

      for (const notification of pendingNotifications) {
        try {
          const success = await this.postMatchStartNotification(notification.match_id);

          if (success) {
            // Mark as processed
            await this.db.run(`
              UPDATE discord_match_start_queue 
              SET status = 'processed', processed_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [notification.id]);
            
            console.log(`✅ Processed match start notification for: ${notification.match_id}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_match_start_queue 
              SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = 'Notification failed'
              WHERE id = ?
            `, [notification.id]);
            
            console.log(`❌ Failed to post match start notification for: ${notification.match_id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing match start notification for ${notification.match_id}:`, error);
          
          // Mark as failed with error message
          await this.db.run(`
            UPDATE discord_match_start_queue 
            SET status = 'failed', processed_at = CURRENT_TIMESTAMP, error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', notification.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing match start queue:', error);
    }
  }

  private async processPlayerReminderQueue() {
    if (!this.db || !this.isReady) {
      return;
    }

    try {
      // Get player reminders that are due
      const dueReminders = await this.db.all<{
        id: string;
        match_id: string;
        reminder_time: string;
        status: string;
      }>(`
        SELECT * FROM discord_player_reminder_queue
        WHERE status = 'pending'
        AND datetime(reminder_time) <= datetime('now')
        ORDER BY reminder_time ASC
        LIMIT 5
      `);

      for (const reminder of dueReminders) {
        try {
          const success = await this.sendPlayerReminders(reminder.match_id);

          if (success) {
            // Mark as sent
            await this.db.run(`
              UPDATE discord_player_reminder_queue 
              SET status = 'sent', sent_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [reminder.id]);
            
            console.log(`✅ Processed player reminder DMs for match: ${reminder.match_id}`);
          } else {
            // Mark as failed
            await this.db.run(`
              UPDATE discord_player_reminder_queue 
              SET status = 'failed', error_message = 'Failed to send player reminders'
              WHERE id = ?
            `, [reminder.id]);
            
            console.log(`❌ Failed to send player reminder DMs for match: ${reminder.match_id}`);
          }
        } catch (error) {
          console.error(`❌ Error processing player reminders for match ${reminder.match_id}:`, error);
          
          // Mark as failed with error message
          await this.db.run(`
            UPDATE discord_player_reminder_queue 
            SET status = 'failed', error_message = ?
            WHERE id = ?
          `, [error instanceof Error ? error.message : 'Unknown error', reminder.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing player reminder queue:', error);
    }
  }

  async postMatchStartNotification(matchId: string): Promise<boolean> {
    if (!this.isReady) {
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
      // Get match data with game information and voice channels
      const matchData = await this.db?.get<{
        id: string;
        name: string;
        start_date?: string;
        game_name?: string;
        game_color?: string;
        blue_team_voice_channel?: string;
        red_team_voice_channel?: string;
        [key: string]: any;
      }>(`
        SELECT m.*, g.name as game_name, g.color as game_color
        FROM matches m
        LEFT JOIN games g ON m.game_id = g.id
        WHERE m.id = ?
      `, [matchId]);

      if (!matchData) {
        console.error('❌ Match not found for start notification:', matchId);
        return false;
      }

      // Get team assignments with Discord user IDs
      const participants = await this.db?.all(`
        SELECT username, discord_user_id, team_assignment, signup_data
        FROM match_participants
        WHERE match_id = ?
        ORDER BY team_assignment, username
      `, [matchId]);

      // Create match start embed
      const embed = await this.createMatchStartEmbed(matchData, participants || []);

      let successCount = 0;
      let mainMessage: Message | null = null;

      // Send to all configured match start channels
      for (const channelConfig of matchStartChannels) {
        try {
          const matchStartChannel = await this.client.channels.fetch(channelConfig.discord_channel_id);

          if (matchStartChannel?.isTextBased() && 'send' in matchStartChannel) {
            // Send match start notification
            const startMessage = await matchStartChannel.send({
              embeds: [embed]
            });
            
            if (!mainMessage) {
              mainMessage = startMessage;
            }
            
            successCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to send match start notification to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        console.error('❌ Failed to send match start notification to any channels');
        return false;
      }

      const startMessage = mainMessage!;

      // Store start notification message for later cleanup
      if (this.db) {
        try {
          const messageRecordId = `discord_start_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          await this.db.run(`
            INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, thread_id, discord_event_id, message_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [messageRecordId, matchId, startMessage.id, startMessage.channelId, null, null, 'match_start']);
          
          console.log(`✅ Stored Discord match start notification tracking for match: ${matchId}`);
        } catch (error) {
          console.error('❌ Error storing Discord start notification message tracking:', error);
        }
      }

      console.log(`✅ Match start notification posted to ${successCount} channel(s) for: ${matchData.name}`);
      return true;

    } catch (error) {
      console.error('❌ Error posting match start notification:', error);
      return false;
    }
  }

  async postMatchReminder(matchId: string): Promise<boolean> {
    if (!this.isReady) {
      console.warn('⚠️ Bot not ready');
      return false;
    }

    // Get channels configured for reminders
    const reminderChannels = await this.getChannelsForNotificationType('reminders');
    
    if (reminderChannels.length === 0) {
      console.warn('⚠️ No channels configured for reminders');
      return false;
    }

    try {
      // Get match data with game information and voice channels
      const matchData = await this.db?.get<{
        id: string;
        name: string;
        start_date?: string;
        game_name?: string;
        game_color?: string;
        blue_team_voice_channel?: string;
        red_team_voice_channel?: string;
        [key: string]: any;
      }>(`
        SELECT m.*, g.name as game_name, g.color as game_color
        FROM matches m
        LEFT JOIN games g ON m.game_id = g.id
        WHERE m.id = ?
      `, [matchId]);

      if (!matchData) {
        console.error('❌ Match not found for reminder:', matchId);
        return false;
      }

      // Get team assignments with Discord user IDs
      const participants = await this.db?.all(`
        SELECT username, discord_user_id, team_assignment, signup_data
        FROM match_participants
        WHERE match_id = ?
        ORDER BY team_assignment, username
      `, [matchId]);

      if (!participants || participants.length === 0) {
        console.error('❌ No participants found for match reminder:', matchId);
        return false;
      }

      // Create reminder embed
      const embed = await this.createReminderEmbed(matchData, participants);

      // Determine what to mention based on settings
      let mentionText = '';
      if (this.settings.mention_everyone) {
        mentionText = '@everyone';
      } else if (this.settings.announcement_role_id) {
        mentionText = `<@&${this.settings.announcement_role_id}>`;
      }

      let successCount = 0;
      let mainMessage: Message | null = null;

      // Send to all configured reminder channels
      for (const channelConfig of reminderChannels) {
        try {
          const reminderChannel = await this.client.channels.fetch(channelConfig.discord_channel_id);

          if (reminderChannel?.isTextBased() && 'send' in reminderChannel) {
            // Send reminder message
            const reminderMessage = await reminderChannel.send({
              content: mentionText,
              embeds: [embed]
            });
            
            if (!mainMessage) {
              mainMessage = reminderMessage;
            }
            
            successCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to send reminder to channel ${channelConfig.discord_channel_id}:`, error);
        }
      }

      if (successCount === 0) {
        console.error('❌ Failed to send reminder to any channels');
        return false;
      }

      const reminderMessage = mainMessage!;

      // Store reminder message for later cleanup
      if (this.db) {
        try {
          const messageRecordId = `discord_reminder_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          await this.db.run(`
            INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, thread_id, discord_event_id, message_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [messageRecordId, matchId, reminderMessage.id, reminderMessage.channelId, null, null, 'reminder']);
          
          console.log(`✅ Stored Discord reminder message tracking for match: ${matchId}`);
        } catch (error) {
          console.error('❌ Error storing Discord reminder message tracking:', error);
        }
      }

      console.log(`✅ Match reminder posted to ${successCount} channel(s) for: ${matchData.name}`);
      return true;

    } catch (error) {
      console.error('❌ Error posting match reminder:', error);
      return false;
    }
  }

  private async createReminderEmbed(matchData: {
    name: string;
    start_date?: string;
    game_name?: string;
    game_color?: string;
    blue_team_voice_channel?: string;
    red_team_voice_channel?: string;
    [key: string]: any;
  }, participants: any[]): Promise<EmbedBuilder> {
    // Parse game color or use default
    let gameColor = 0x95a5a6; // default gray
    if (matchData.game_color) {
      try {
        gameColor = parseInt(matchData.game_color.replace('#', ''), 16);
      } catch (error) {
        console.error('Error parsing game color:', error);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`${matchData.name} is about to begin!`)
      .setColor(gameColor)
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Get ready to play!' });

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

    // Group participants by team
    const blueTeam = participants.filter(p => p.team_assignment === 'blue');
    const redTeam = participants.filter(p => p.team_assignment === 'red');
    const reserves = participants.filter(p => p.team_assignment === 'reserve');

    // Add team rosters with Discord mentions and voice channels side by side
    if (blueTeam.length > 0 && redTeam.length > 0) {
      let blueRosterValue = '';
      if (matchData.blue_team_voice_channel) {
        blueRosterValue += `🎙️ <#${matchData.blue_team_voice_channel}>\n\n`;
      }
      blueRosterValue += blueTeam.map(p => this.formatPlayerMention(p)).join('\n');

      let redRosterValue = '';
      if (matchData.red_team_voice_channel) {
        redRosterValue += `🎙️ <#${matchData.red_team_voice_channel}>\n\n`;
      }
      redRosterValue += redTeam.map(p => this.formatPlayerMention(p)).join('\n');

      embed.addFields(
        { name: '🔵 Blue Team', value: blueRosterValue, inline: true },
        { name: '🔴 Red Team', value: redRosterValue, inline: true }
      );
    } else if (blueTeam.length > 0) {
      let blueRosterValue = '';
      if (matchData.blue_team_voice_channel) {
        blueRosterValue += `🎙️ <#${matchData.blue_team_voice_channel}>\n\n`;
      }
      blueRosterValue += blueTeam.map(p => this.formatPlayerMention(p)).join('\n');
      embed.addFields({ name: '🔵 Blue Team', value: blueRosterValue, inline: true });
    } else if (redTeam.length > 0) {
      let redRosterValue = '';
      if (matchData.red_team_voice_channel) {
        redRosterValue += `🎙️ <#${matchData.red_team_voice_channel}>\n\n`;
      }
      redRosterValue += redTeam.map(p => this.formatPlayerMention(p)).join('\n');
      embed.addFields({ name: '🔴 Red Team', value: redRosterValue, inline: true });
    }

    // Add reserves if any
    if (reserves.length > 0) {
      const reserveRoster = reserves.map(p => this.formatPlayerMention(p)).join('\n');
      embed.addFields({ name: '🟡 Reserves', value: reserveRoster, inline: false });
    }

    // Add game info
    if (matchData.game_name) {
      embed.addFields({ name: '🎮 Game', value: matchData.game_name, inline: false });
    }

    // Add link to original match announcement
    if (this.db) {
      try {
        const announcementMessage = await this.db.get<{
          message_id: string;
          channel_id: string;
        }>(`
          SELECT message_id, channel_id 
          FROM discord_match_messages 
          WHERE match_id = ? 
          AND message_type = 'announcement' 
          ORDER BY created_at ASC 
          LIMIT 1
        `, [matchData.id]);

        if (announcementMessage && this.client.guilds.cache.first()) {
          const guildId = this.client.guilds.cache.first()?.id;
          const messageLink = `https://discord.com/channels/${guildId}/${announcementMessage.channel_id}/${announcementMessage.message_id}`;
          embed.addFields({ 
            name: '🔗 Match Details', 
            value: `[View Original Match Post](${messageLink})`, 
            inline: false 
          });
        }
      } catch (error) {
        console.error('Error adding match announcement link:', error);
      }
    }

    return embed;
  }

  private async createMatchStartEmbed(matchData: {
    name: string;
    start_date?: string;
    game_name?: string;
    game_color?: string;
    blue_team_voice_channel?: string;
    red_team_voice_channel?: string;
    [key: string]: any;
  }, participants: any[] = []): Promise<EmbedBuilder> {
    // Parse game color or use default
    let gameColor = 0x00ff00; // green for "started"
    if (matchData.game_color) {
      try {
        gameColor = parseInt(matchData.game_color.replace('#', ''), 16);
      } catch (error) {
        console.error('Error parsing game color:', error);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`🏁 ${matchData.name} has started!`)
      .setColor(gameColor)
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Good luck and have fun!' });

    // Add game info
    if (matchData.game_name) {
      embed.addFields({ name: '🎮 Game', value: matchData.game_name, inline: false });
    }

    // Add match time if available
    if (matchData.start_date) {
      const startTime = new Date(matchData.start_date);
      const unixTimestamp = Math.floor(startTime.getTime() / 1000);
      embed.addFields(
        { name: '🕐 Started At', value: `<t:${unixTimestamp}:F>`, inline: true }
      );
    }

    // Group participants by team
    const blueTeam = participants.filter(p => p.team_assignment === 'blue');
    const redTeam = participants.filter(p => p.team_assignment === 'red');

    // Add team rosters with voice channels
    if (blueTeam.length > 0 || redTeam.length > 0) {
      const fields = [];

      if (blueTeam.length > 0) {
        let blueTeamValue = '';
        if (matchData.blue_team_voice_channel) {
          blueTeamValue += `🎙️ <#${matchData.blue_team_voice_channel}>\n\n`;
        }
        blueTeamValue += blueTeam.map(p => this.formatPlayerMention(p)).join('\n');
        fields.push({ name: '🔵 Blue Team', value: blueTeamValue, inline: true });
      }

      if (redTeam.length > 0) {
        let redTeamValue = '';
        if (matchData.red_team_voice_channel) {
          redTeamValue += `🎙️ <#${matchData.red_team_voice_channel}>\n\n`;
        }
        redTeamValue += redTeam.map(p => this.formatPlayerMention(p)).join('\n');
        fields.push({ name: '🔴 Red Team', value: redTeamValue, inline: true });
      }

      embed.addFields(...fields);
    }

    embed.setDescription('The match is now underway. Players should check their team assignments and get ready to compete!');

    return embed;
  }

  private formatPlayerMention(player: { username: string; discord_user_id?: string }): string {
    if (player.discord_user_id) {
      try {
        // Use Discord mention format
        return `• <@${player.discord_user_id}>`;
      } catch (error) {
        console.warn(`⚠️ Failed to format mention for Discord user ${player.discord_user_id}, falling back to username`);
        return `• ${player.username}`;
      }
    }
    
    // Fallback to username if no Discord ID available
    return `• ${player.username}`;
  }

  async updateMatchStatus(matchId: string, newStatus: string): Promise<boolean> {
    if (!this.db || !this.isReady) {
      console.warn('⚠️ Bot not ready or database not available for message update');
      return false;
    }

    try {
      // Get Discord message info for this match
      const messageRecords = await this.db.all(`
        SELECT message_id, channel_id 
        FROM discord_match_messages 
        WHERE match_id = ?
      `, [matchId]);

      if (messageRecords.length === 0) {
        console.warn(`⚠️ No Discord messages found for match: ${matchId}`);
        return false;
      }

      for (const record of messageRecords) {
        try {
          // Get the message
          const channel = await this.client.channels.fetch((record as any).channel_id);
          if (channel?.isTextBased() && 'messages' in channel) {
            const message = await channel.messages.fetch((record as any).message_id);
            
            if (newStatus === 'assign') {
              // Remove the signup button when signups are closed
              const embed = message.embeds[0];
              if (embed) {
                const updatedEmbed = EmbedBuilder.from(embed);
                updatedEmbed.setFooter({ text: 'MatchExec • Signups are now closed!' });
                
                // Handle image properly - convert attachment references to inline images
                if (embed.image?.url?.startsWith('attachment://')) {
                  // Remove the image since we can't preserve attachments in edits
                  updatedEmbed.setImage(null);
                }
                
                await message.edit({
                  embeds: [updatedEmbed],
                  components: [], // Remove all components (buttons)
                  files: [] // Clear any attachments to prevent duplication
                });
              } else {
                // Fallback if no embed found
                await message.edit({
                  embeds: message.embeds,
                  components: [], // Remove all components (buttons)
                  files: [] // Clear any attachments to prevent duplication
                });
              }
              
              console.log(`✅ Updated message for match ${matchId} - signups closed`);
            }
          }
        } catch (error) {
          console.error(`❌ Error updating Discord message for match ${matchId}:`, error);
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Error in updateMatchStatus:', error);
      return false;
    }
  }

  async deleteMatchAnnouncement(matchId: string): Promise<boolean> {
    if (!this.db || !this.isReady) {
      console.warn('⚠️ Bot not ready or database not available for message deletion');
      return false;
    }

    try {
      // Get match info including event image for cleanup
      const matchData = await this.db.get(`
        SELECT event_image_url FROM matches WHERE id = ?
      `, [matchId]);

      // Get Discord message info for this match (both announcements and reminders)
      const messageRecords = await this.db.all(`
        SELECT message_id, channel_id, thread_id, discord_event_id, message_type
        FROM discord_match_messages 
        WHERE match_id = ?
      `, [matchId]);

      for (const record of messageRecords) {
        try {
          // Delete the main message
          const channel = await this.client.channels.fetch((record as any).channel_id);
          if (channel?.isTextBased() && 'messages' in channel) {
            try {
              const message = await channel.messages.fetch((record as any).message_id);
              await message.delete();
              const messageType = (record as any).message_type || 'announcement';
              console.log(`✅ Deleted Discord ${messageType} message for match: ${matchId}`);
            } catch (error) {
              const messageType = (record as any).message_type || 'announcement';
              console.warn(`⚠️ Could not delete ${messageType} message ${(record as any).message_id}:`, (error as Error)?.message);
            }
          }

          // Delete Discord event if it exists
          if ((record as any).discord_event_id) {
            try {
              const guild = this.client.guilds.cache.get(this.settings?.guild_id || '');
              if (guild) {
                const event = await guild.scheduledEvents.fetch((record as any).discord_event_id);
                if (event) {
                  await event.delete('Match deleted');
                  console.log(`✅ Deleted Discord event for match: ${matchId}`);
                }
              }
            } catch (error) {
              console.warn(`⚠️ Could not delete Discord event ${(record as any).discord_event_id}:`, (error as Error)?.message);
            }
          }

          // Thread will be automatically deleted when the parent message is deleted
          
        } catch (error) {
          console.error(`❌ Error deleting Discord message for match ${matchId}:`, error);
        }
      }

      // Clean up event image if it exists
      if ((matchData as any)?.event_image_url) {
        await this.cleanupEventImage((matchData as any).event_image_url);
      }

      // Remove tracking records
      await this.db.run(`
        DELETE FROM discord_match_messages WHERE match_id = ?
      `, [matchId]);

      return true;
    } catch (error) {
      console.error('❌ Error in deleteMatchAnnouncement:', error);
      return false;
    }
  }

  private async cleanupEventImage(imageUrl: string): Promise<void> {
    try {
      // Call the deletion API endpoint
      const response = await fetch(`${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/upload/event-image?imageUrl=${encodeURIComponent(imageUrl)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        console.log(`✅ Cleaned up event image: ${imageUrl}`);
      } else {
        console.warn(`⚠️ Failed to clean up event image: ${imageUrl}`);
      }
    } catch (error) {
      console.error(`❌ Error cleaning up event image ${imageUrl}:`, error);
    }
  }

  private async cleanupExpiredMatches() {
    if (!this.db || !this.isReady) {
      return;
    }

    try {
      // Find matches that are more than 1 day old OR completed/cancelled
      const expiredMatches = await this.db.all(`
        SELECT dmm.match_id, dmm.message_id, dmm.channel_id, dmm.thread_id, dmm.discord_event_id, m.event_image_url
        FROM discord_match_messages dmm
        JOIN matches m ON dmm.match_id = m.id
        WHERE DATE(m.start_date) < DATE('now', '-1 day')
        OR m.status IN ('completed', 'cancelled')
      `);

      console.log(`🧹 Found ${expiredMatches.length} expired/completed match messages to clean up`);

      for (const match of expiredMatches) {
        await this.deleteMatchAnnouncement((match as any).match_id);
      }

      if (expiredMatches.length > 0) {
        console.log(`✅ Cleaned up ${expiredMatches.length} expired/completed match messages`);
      }
    } catch (error) {
      console.error('❌ Error cleaning up expired matches:', error);
    }
  }

  async start() {
    try {
      console.log('🚀 Starting MatchExec Discord Bot...');
      
      // Initialize database
      this.db = await initializeDatabase();

      // Load settings
      this.settings = await this.loadSettings();
      
      if (!this.settings?.bot_token) {
        console.log('⚠️ No bot token configured. Please configure Discord settings in the web interface.');
        console.log('🕐 Waiting for configuration...');
        
        // Poll for settings every 30 seconds
        this.pollForSettings();
        return;
      }

      // Login to Discord
      await this.client.login(this.settings.bot_token);
      
    } catch (error) {
      console.error('❌ Failed to start Discord bot:', error);
      process.exit(1);
    }
  }

  private async pollForSettings() {
    const checkSettings = async () => {
      this.settings = await this.loadSettings();
      
      if (this.settings?.bot_token && !this.isReady) {
        console.log('✅ Bot token configured! Attempting to connect...');
        try {
          await this.client.login(this.settings.bot_token);
        } catch (error) {
          console.error('❌ Failed to login with bot token:', error);
          setTimeout(checkSettings, 30000); // Try again in 30 seconds
        }
      } else if (!this.isReady) {
        setTimeout(checkSettings, 30000); // Check again in 30 seconds
      }
    };

    setTimeout(checkSettings, 30000); // Initial delay of 30 seconds
  }

  async restart() {
    console.log('🔄 Restarting Discord bot...');
    
    if (this.client.isReady()) {
      this.client.destroy();
    }
    
    this.isReady = false;
    await this.start();
  }

  async playVoiceAnnouncement(channelId: string, audioType: 'welcome' | 'nextround' | 'finish', lineNumber?: number): Promise<boolean> {
    if (!this.isReady || !this.settings) {
      console.warn('⚠️ Bot not ready or settings not loaded');
      return false;
    }

    if (!this.settings.voice_announcements_enabled) {
      console.log('ℹ️ Voice announcements are disabled');
      return false;
    }

    if (!this.settings.announcer_voice) {
      console.error('❌ No announcer voice selected');
      return false;
    }

    try {
      // Get the audio file path
      const audioFilePath = await this.getAudioFilePath(this.settings.announcer_voice, audioType, lineNumber);
      if (!audioFilePath) {
        console.error(`❌ Audio file not found for ${this.settings.announcer_voice} ${audioType} ${lineNumber || 'random'}`);
        return false;
      }

      // Connect to voice channel and play audio
      return await this.connectAndPlayAudio(channelId, audioFilePath);

    } catch (error) {
      console.error('❌ Error playing voice announcement:', error);
      return false;
    }
  }

  private async getAudioFilePath(voiceId: string, audioType: string, lineNumber?: number): Promise<string | null> {
    if (!this.db) return null;

    try {
      // Get voice path from database
      const voice = await this.db.get<{ path: string }>(`
        SELECT path FROM voices WHERE id = ?
      `, [voiceId]);

      if (!voice) {
        console.error(`❌ Voice not found: ${voiceId}`);
        return null;
      }

      // Generate filename based on type and line number
      let filename: string;
      if (lineNumber) {
        filename = `${audioType}${lineNumber}.mp3`;
      } else {
        // Pick a random line number based on type
        const maxLines = audioType === 'welcome' ? 5 : audioType === 'nextround' ? 6 : 6;
        const randomLine = Math.floor(Math.random() * maxLines) + 1;
        filename = `${audioType}${randomLine}.mp3`;
      }

      // Construct full path
      const fullPath = path.join(process.cwd(), voice.path, filename);
      
      // Check if file exists
      if (fs.existsSync(fullPath)) {
        return fullPath;
      } else {
        console.error(`❌ Audio file does not exist: ${fullPath}`);
        return null;
      }

    } catch (error) {
      console.error('❌ Error getting audio file path:', error);
      return null;
    }
  }

  private async connectAndPlayAudio(channelId: string, audioFilePath: string): Promise<boolean> {
    try {
      // Get the voice channel
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        console.error(`❌ Channel ${channelId} is not a voice channel`);
        return false;
      }

      // Check if we already have a connection to this channel
      let connection = getVoiceConnection(channel.guild.id);
      
      if (!connection || connection.joinConfig.channelId !== channelId) {
        // Join the voice channel
        connection = joinVoiceChannel({
          channelId: channelId,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator,
        });

        // Store the connection
        this.voiceConnections.set(channelId, connection);
      }

      // Wait for the connection to be ready
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

      // Create audio resource
      const resource = createAudioResource(audioFilePath);

      // Play the audio
      this.audioPlayer.play(resource);
      connection.subscribe(this.audioPlayer);

      console.log(`🔊 Playing voice announcement in channel ${channelId}: ${path.basename(audioFilePath)}`);

      // Wait for the audio to finish playing
      return new Promise((resolve) => {
        const onFinish = () => {
          this.audioPlayer.removeListener(AudioPlayerStatus.Idle, onFinish);
          this.audioPlayer.removeListener('error', onError);
          console.log(`✅ Voice announcement finished playing in channel ${channelId}`);
          resolve(true);
        };

        const onError = (error: Error) => {
          this.audioPlayer.removeListener(AudioPlayerStatus.Idle, onFinish);
          this.audioPlayer.removeListener('error', onError);
          console.error(`❌ Error playing voice announcement:`, error);
          resolve(false);
        };

        this.audioPlayer.once(AudioPlayerStatus.Idle, onFinish);
        this.audioPlayer.once('error', onError);
      });

    } catch (error) {
      console.error('❌ Error connecting to voice channel and playing audio:', error);
      return false;
    }
  }

  async disconnectFromVoiceChannel(channelId: string): Promise<boolean> {
    try {
      const connection = this.voiceConnections.get(channelId);
      if (connection) {
        connection.destroy();
        this.voiceConnections.delete(channelId);
        console.log(`🔇 Disconnected from voice channel ${channelId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error disconnecting from voice channel:', error);
      return false;
    }
  }

  async stop() {
    console.log('🛑 Stopping Discord bot...');
    
    // Disconnect from all voice channels
    for (const [channelId, connection] of this.voiceConnections) {
      try {
        connection.destroy();
        console.log(`🔇 Disconnected from voice channel ${channelId}`);
      } catch (error) {
        console.error(`❌ Error disconnecting from voice channel ${channelId}:`, error);
      }
    }
    this.voiceConnections.clear();
    
    if (this.client.isReady()) {
      this.client.destroy();
    }
    
    this.isReady = false;
  }
}

// Create and start the bot
const bot = new MatchExecBot();

// Export bot instance for use by other processes
export const getBotInstance = () => bot;

// Export method for deleting match announcements
export const deleteMatchDiscordAnnouncement = async (matchId: string) => {
  return await bot.deleteMatchAnnouncement(matchId);
};

// Export method for sending player reminder DMs
export const sendPlayerReminderDMs = async (matchId: string) => {
  return await bot.sendPlayerReminders(matchId);
};

// Export method for playing voice announcements
export const playVoiceAnnouncement = async (channelId: string, audioType: 'welcome' | 'nextround' | 'finish', lineNumber?: number) => {
  return await bot.playVoiceAnnouncement(channelId, audioType, lineNumber);
};

// Handle process signals
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

// Start the bot
bot.start().catch(console.error);

export { MatchExecBot };