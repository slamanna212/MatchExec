import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder, ChatInputCommandInteraction, ActivityType, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, AttachmentBuilder, Message, ChannelType } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { initializeDatabase } from '../../lib/database';
import { Database } from '../../lib/database/connection';

interface DiscordSettings {
  bot_token: string;
  guild_id: string;
  announcement_channel_id?: string;
  results_channel_id?: string;
  participant_role_id?: string;
}

class MatchExecBot {
  private client: Client;
  private db: Database | null = null;
  private settings: DiscordSettings | null = null;
  private isReady = false;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
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
          announcement_channel_id,
          results_channel_id,
          participant_role_id
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
  }) {
    if (!this.isReady || !this.settings?.announcement_channel_id) {
      console.warn('⚠️ Bot not ready or announcement channel not configured');
      return false;
    }

    try {
      // Create event embed (without attachments)
      const embed = await this.createEventEmbed(
        eventData.name,
        eventData.description,
        eventData.game_id,
        eventData.type,
        eventData.maps || [],
        eventData.max_participants,
        eventData.livestream_link
      );

      // Create signup button
      const signupButton = new ButtonBuilder()
        .setCustomId(`signup_${eventData.id}`)
        .setLabel('🎮 Sign Up')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(signupButton);

      // Get announcement channel
      const announcementChannel = await this.client.channels.fetch(this.settings.announcement_channel_id);

      if (announcementChannel?.isTextBased() && 'send' in announcementChannel) {
        // Send main announcement
        const message = await announcementChannel.send({
          embeds: [embed],
          components: [row]
        });

        let threadId: string | null = null;

        // Create maps thread if there are maps
        if (eventData.maps && eventData.maps.length > 0) {
          const thread = await this.createMapsThread(message, eventData.name, eventData.game_id, eventData.maps);
          threadId = thread?.id || null;
        }

        // Store Discord message information for later cleanup
        if (this.db) {
          try {
            const messageRecordId = `discord_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await this.db.run(`
              INSERT INTO discord_match_messages (id, match_id, message_id, channel_id, thread_id)
              VALUES (?, ?, ?, ?, ?)
            `, [messageRecordId, eventData.id, message.id, message.channelId, threadId]);
            
            console.log(`✅ Stored Discord message tracking for match: ${eventData.id}`);
          } catch (error) {
            console.error('❌ Error storing Discord message tracking:', error);
          }
        }

        console.log(`✅ Event announcement posted for: ${eventData.name}`);
        return true;
      } else {
        console.error('❌ Could not find or access announcement channel');
        return false;
      }

    } catch (error) {
      console.error('❌ Error posting event announcement:', error);
      return false;
    }
  }


  private async createEventEmbed(
    name: string,
    description: string,
    gameId: string,
    type: string,
    maps: string[],
    maxParticipants: number,
    livestreamLink?: string
  ): Promise<EmbedBuilder> {
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
        { name: '🏆 Ruleset', value: type === 'competitive' ? '🥇 Competitive' : '🎮 Casual', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Sign up to participate!' });

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

    return embed;
  }

  private async createMapsThread(message: Message, eventName: string, gameId: string, maps: string[]): Promise<any> {
    try {
      // Create thread - using public thread for better visibility
      const thread = await message.startThread({
        name: `${eventName} Maps`,
        autoArchiveDuration: 1440, // 24 hours (in minutes)
        type: ChannelType.PublicThread,
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

        const eventData = await this.db.get<{max_participants: number}>(`
          SELECT max_participants FROM matches WHERE id = ?
        `, [eventId]);

        if (participantCount?.count >= (eventData?.max_participants || 16)) {
          await interaction.reply({
            content: '❌ This event is full!',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
      }

      // Show signup form modal
      const modal = new ModalBuilder()
        .setCustomId(`signup_form_${eventId}`)
        .setTitle('Event Sign Up');

      const usernameInput = new TextInputBuilder()
        .setCustomId('username')
        .setLabel('In-game Username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter your in-game username')
        .setRequired(true)
        .setMaxLength(50);

      const notesInput = new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Additional Notes (Optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Any additional information or preferences')
        .setRequired(false)
        .setMaxLength(500);

      const firstRow = new ActionRowBuilder<TextInputBuilder>()
        .addComponents(usernameInput);
      const secondRow = new ActionRowBuilder<TextInputBuilder>()
        .addComponents(notesInput);

      modal.addComponents(firstRow, secondRow);

      await interaction.showModal(modal);

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
    const username = interaction.fields.getTextInputValue('username');
    const notes = interaction.fields.getTextInputValue('notes') || null;

    try {
      if (this.db) {
        // Generate participant ID
        const participantId = `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Add participant to database
        await this.db.run(`
          INSERT INTO match_participants (id, match_id, user_id, username)
          VALUES (?, ?, ?, ?)
        `, [participantId, eventId, interaction.user.id, username]);

        // Get current participant count
        const participantCount = await this.db.get<{count: number}>(`
          SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?
        `, [eventId]);

        await interaction.reply({
          content: `✅ Successfully signed up for the event!\n**Username:** ${username}\n**Participants:** ${participantCount?.count || 1}`,
          flags: MessageFlags.Ephemeral
        });

        console.log(`✅ User ${interaction.user.tag} (${username}) signed up for event ${eventId}`);
      } else {
        throw new Error('Database not available');
      }

    } catch (error) {
      console.error('❌ Error processing signup:', error);
      
      if (error.message?.includes('UNIQUE constraint failed')) {
        await interaction.reply({
          content: '❌ You are already signed up for this event!',
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: '❌ Failed to sign up. Please try again.',
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
    
    // Clean up expired match messages every hour
    setInterval(async () => {
      await this.cleanupExpiredMatches();
    }, 3600000); // 1 hour
    
    console.log('✅ Announcement queue processor started');
    console.log('✅ Deletion queue processor started');
    console.log('✅ Expired match cleanup scheduler started');
  }

  private async processAnnouncementQueue() {
    if (!this.db || !this.isReady || !this.settings?.announcement_channel_id) {
      return;
    }

    try {
      // Get pending announcements
      const pendingAnnouncements = await this.db.all(`
        SELECT daq.*, m.name, m.description, m.game_id, m.max_participants, m.guild_id, m.maps, m.livestream_link
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
            type: 'casual', // Default to casual, we'll need to add this field to matches table later
            maps: maps,
            max_participants: announcement.max_participants,
            guild_id: announcement.guild_id,
            livestream_link: announcement.livestream_link
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
          `, [error.message || 'Unknown error', announcement.id]);
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
      const pendingDeletions = await this.db.all(`
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
          `, [error.message || 'Unknown error', deletion.id]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing deletion queue:', error);
    }
  }

  async deleteMatchAnnouncement(matchId: string): Promise<boolean> {
    if (!this.db || !this.isReady) {
      console.warn('⚠️ Bot not ready or database not available for message deletion');
      return false;
    }

    try {
      // Get Discord message info for this match
      const messageRecords = await this.db.all(`
        SELECT message_id, channel_id, thread_id 
        FROM discord_match_messages 
        WHERE match_id = ?
      `, [matchId]);

      for (const record of messageRecords) {
        try {
          // Delete the main message
          const channel = await this.client.channels.fetch(record.channel_id);
          if (channel?.isTextBased() && 'messages' in channel) {
            try {
              const message = await channel.messages.fetch(record.message_id);
              await message.delete();
              console.log(`✅ Deleted Discord message for match: ${matchId}`);
            } catch (error) {
              console.warn(`⚠️ Could not delete message ${record.message_id}:`, error.message);
            }
          }

          // Thread will be automatically deleted when the parent message is deleted
          
        } catch (error) {
          console.error(`❌ Error deleting Discord message for match ${matchId}:`, error);
        }
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

  private async cleanupExpiredMatches() {
    if (!this.db || !this.isReady) {
      return;
    }

    try {
      // Find matches that are more than 1 day old
      const expiredMatches = await this.db.all(`
        SELECT dmm.match_id, dmm.message_id, dmm.channel_id, dmm.thread_id
        FROM discord_match_messages dmm
        JOIN matches m ON dmm.match_id = m.id
        WHERE DATE(m.scheduled_at) < DATE('now', '-1 day')
      `);

      console.log(`🧹 Found ${expiredMatches.length} expired match announcements to clean up`);

      for (const match of expiredMatches) {
        await this.deleteMatchAnnouncement(match.match_id);
      }

      if (expiredMatches.length > 0) {
        console.log(`✅ Cleaned up ${expiredMatches.length} expired match announcements`);
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
      console.log('✅ Database initialized');

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

  async stop() {
    console.log('🛑 Stopping Discord bot...');
    
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