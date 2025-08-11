import { Client, GatewayIntentBits } from 'discord.js';
import { initializeDatabase } from '../../lib/database';
import { Database } from '../../lib/database/connection';
import { DiscordSettings } from '../../shared/types';

// Import our modules
import { VoiceHandler } from './modules/voice-handler';
import { EventHandler } from './modules/event-handler';
import { AnnouncementHandler } from './modules/announcement-handler';
import { SettingsManager } from './modules/settings-manager';

class MatchExecBot {
  private client: Client;
  private db: Database | null = null;
  private settings: DiscordSettings | null = null;
  private isReady = false;

  // Module instances
  private voiceHandler: VoiceHandler | null = null;
  private eventHandler: EventHandler | null = null;
  private announcementHandler: AnnouncementHandler | null = null;
  private settingsManager: SettingsManager | null = null;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages
      ]
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.client.once('ready', async () => {
      if (!this.client.user) return;
      
      console.log(`✅ Discord bot logged in as ${this.client.user.tag}`);
      
      // Initialize database and settings
      await this.initialize();
      
      this.isReady = true;
      console.log('🤖 MatchExec Discord Bot is ready!');
    });

    // Basic interaction handling (simplified)
    this.client.on('interactionCreate', async (interaction) => {
      if (!this.isReady || !this.settings) return;

      try {
        if (interaction.isChatInputCommand()) {
          await this.handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
          await this.handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
          await this.handleModalSubmit(interaction);
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
      }
    });

    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private async initialize() {
    try {
      // Initialize database with migrations
      this.db = await initializeDatabase();
      
      // Initialize settings manager
      this.settingsManager = new SettingsManager(this.db);
      this.settings = await this.settingsManager.loadSettings();

      if (!this.settings?.bot_token) {
        console.warn('⚠️ Bot token not configured');
        return;
      }

      // Initialize modules
      this.voiceHandler = new VoiceHandler(this.client, this.db, this.settings);
      this.eventHandler = new EventHandler(this.client, this.db, this.settings);
      this.announcementHandler = new AnnouncementHandler(this.client, this.db, this.settings);

      console.log('✅ Bot modules initialized');

      // Start periodic tasks
      this.startPeriodicTasks();

    } catch (error) {
      console.error('❌ Failed to initialize bot:', error);
    }
  }

  private startPeriodicTasks() {
    // Settings reload every 30 seconds
    setInterval(async () => {
      if (this.settingsManager && this.db) {
        const newSettings = await this.settingsManager.loadSettings();
        if (newSettings) {
          this.settings = newSettings;
          this.voiceHandler?.updateSettings(newSettings);
          this.eventHandler?.updateSettings(newSettings);
          this.announcementHandler?.updateSettings(newSettings);
        }
      }
    }, 30000);

    // Queue processing every 5 seconds (simplified)
    setInterval(async () => {
      await this.processQueues();
    }, 5000);
  }

  // Simplified queue processing - just voice tests for now
  private async processQueues() {
    if (!this.db || !this.isReady) return;

    try {
      // Process voice test requests
      const requests = await this.db.all<{
        id: string;
        type: string;
        data: string;
        created_at: string;
      }>(`
        SELECT id, type, data, created_at
        FROM discord_bot_requests
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 10
      `);

      for (const request of requests) {
        try {
          if (request.type === 'voice_test' && this.voiceHandler) {
            const data = JSON.parse(request.data);
            const result = await this.voiceHandler.testVoiceLineForUser(data.userId, data.voiceId);
            
            // Update request with result
            await this.db.run(`
              UPDATE discord_bot_requests
              SET status = ?, result = ?, updated_at = datetime('now')
              WHERE id = ?
            `, [
              result.success ? 'completed' : 'failed',
              JSON.stringify(result),
              request.id
            ]);

            console.log(`✅ Processed voice test request ${request.id}: ${result.success ? 'success' : 'failed'}`);
          }
        } catch (error) {
          console.error(`❌ Error processing request ${request.id}:`, error);
          
          // Mark request as failed
          await this.db.run(`
            UPDATE discord_bot_requests
            SET status = 'failed', result = ?, updated_at = datetime('now')
            WHERE id = ?
          `, [
            JSON.stringify({ success: false, message: error instanceof Error ? error.message : 'Unknown error' }),
            request.id
          ]);
        }
      }
    } catch (error) {
      console.error('❌ Error processing queues:', error);
    }
  }

  // Simplified interaction handlers
  private async handleSlashCommand(interaction: any) {
    if (interaction.commandName === 'status') {
      await interaction.reply({
        content: `🤖 Bot Status: ${this.isReady ? 'Ready' : 'Not Ready'}\n⚙️ Settings Loaded: ${this.settings ? 'Yes' : 'No'}`,
        ephemeral: true
      });
    }
  }

  private async handleButtonInteraction(interaction: any) {
    // Simplified button handling - just acknowledge for now
    await interaction.reply({
      content: 'Button interaction received but handler not fully implemented yet.',
      ephemeral: true
    });
  }

  private async handleModalSubmit(interaction: any) {
    // Simplified modal handling - just acknowledge for now  
    await interaction.reply({
      content: 'Modal submission received but handler not fully implemented yet.',
      ephemeral: true
    });
  }

  // Public API methods for external use
  async testVoiceLineForUser(userId: string, voiceId?: string) {
    if (!this.voiceHandler) {
      return { success: false, message: 'Voice handler not initialized' };
    }
    return await this.voiceHandler.testVoiceLineForUser(userId, voiceId);
  }

  async postEventAnnouncement(eventData: any) {
    if (!this.announcementHandler) {
      return false;
    }
    return await this.announcementHandler.postEventAnnouncement(eventData);
  }

  private async shutdown() {
    console.log('🛑 Received shutdown signal, gracefully shutting down...');
    
    if (this.voiceHandler) {
      await this.voiceHandler.disconnectFromAllVoiceChannels();
    }
    
    if (this.client) {
      this.client.destroy();
    }
    
    console.log('🛑 Discord bot shut down complete');
    process.exit(0);
  }

  async start() {
    if (!this.settings?.bot_token) {
      // Try to load settings first
      if (this.settingsManager) {
        this.settings = await this.settingsManager.loadSettings();
      }
    }

    if (!this.settings?.bot_token) {
      console.error('❌ No bot token available, cannot start bot');
      return;
    }

    try {
      await this.client.login(this.settings.bot_token);
    } catch (error) {
      console.error('❌ Failed to login to Discord:', error);
    }
  }
}

// Create and start the bot
const bot = new MatchExecBot();

// Initialize database and start the bot
(async () => {
  console.log('🚀 Starting MatchExec Discord Bot...');
  try {
    await bot.start();
  } catch (error) {
    console.error('❌ Failed to start Discord bot:', error);
    process.exit(1);
  }
})();

// Export bot instance and methods for external use
export default bot;
export const testVoiceLineForUser = async (userId: string, voiceId?: string) => {
  return await bot.testVoiceLineForUser(userId, voiceId);
};

export const postEventAnnouncement = async (eventData: any) => {
  return await bot.postEventAnnouncement(eventData);
};