import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder, ChatInputCommandInteraction, ActivityType, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction } from 'discord.js';
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
  }) {
    if (!this.isReady || !this.settings?.announcement_channel_id) {
      console.warn('⚠️ Bot not ready or announcement channel not configured');
      return false;
    }

    try {
      // Create event embed
      const embed = await this.createEventEmbed(
        eventData.name,
        eventData.description,
        eventData.game_id,
        eventData.type,
        eventData.maps || [],
        eventData.max_participants
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
        await announcementChannel.send({
          embeds: [embed],
          components: [row]
        });

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
    game: string,
    type: string,
    maps: string[],
    maxParticipants: number
  ): Promise<EmbedBuilder> {
    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${name}`)
      .setDescription(description)
      .setColor(type === 'competitive' ? 0xff6b35 : 0x4caf50)
      .addFields(
        { name: '🎯 Game', value: game, inline: true },
        { name: '🏆 Type', value: type === 'competitive' ? '🥇 Competitive' : '🎮 Casual', inline: true },
        { name: '👥 Max Players', value: maxParticipants.toString(), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'MatchExec • Sign up to participate!' });

    // Add maps if provided
    if (maps.length > 0) {
      // Try to get map images from database
      let mapText = '';
      for (const mapName of maps) {
        if (this.db) {
          try {
            const mapData = await this.db.get<{name: string, image_url: string}>(`
              SELECT name, image_url FROM game_maps 
              WHERE LOWER(name) LIKE LOWER(?) 
              LIMIT 1
            `, [`%${mapName}%`]);

            if (mapData?.image_url) {
              mapText += `**${mapData.name}**\n`;
              // Use first map image as thumbnail if available
              if (!embed.data.thumbnail && mapData.image_url) {
                embed.setThumbnail(mapData.image_url);
              }
            } else {
              mapText += `**${mapName}**\n`;
            }
          } catch (error) {
            mapText += `**${mapName}**\n`;
          }
        } else {
          mapText += `**${mapName}**\n`;
        }
      }
      
      embed.addFields({ name: '🗺️ Maps', value: mapText || 'Maps will be announced', inline: false });
    }

    return embed;
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
    
    console.log('✅ Announcement queue processor started');
  }

  private async processAnnouncementQueue() {
    if (!this.db || !this.isReady || !this.settings?.announcement_channel_id) {
      return;
    }

    try {
      // Get pending announcements
      const pendingAnnouncements = await this.db.all(`
        SELECT daq.*, m.name, m.description, m.game_id, m.max_participants, m.guild_id, m.maps
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
            guild_id: announcement.guild_id
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