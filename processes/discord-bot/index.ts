import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder, ChatInputCommandInteraction, ActivityType } from 'discord.js';
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
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      await this.handleSlashCommand(interaction);
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
            ephemeral: true
          });
      }
    } catch (error) {
      console.error('❌ Error handling slash command:', error);
      
      const errorMessage = '❌ An error occurred while processing your command.';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
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
      `👥 Servers: ${this.client.guilds.cache.size}`,
      `📡 Ping: ${this.client.ws.ping}ms`,
      `🗄️ Database: ${this.db ? '✅ Connected' : '❌ Disconnected'}`
    ].join('\n');

    await interaction.reply({
      content: status,
      ephemeral: true
    });
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