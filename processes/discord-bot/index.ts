import { Client, GatewayIntentBits } from 'discord.js';
import { getDbInstance } from '../../src/lib/database-init.js';
import { Database } from '../../lib/database/connection';
import { DiscordSettings } from '../../shared/types';

// Import our modules
import { VoiceHandler } from './modules/voice-handler';
import { EventHandler } from './modules/event-handler';
import { AnnouncementHandler } from './modules/announcement-handler';
import { SettingsManager } from './modules/settings-manager';
import { QueueProcessor } from './modules/queue-processor';
import { ReminderHandler } from './modules/reminder-handler';
import { InteractionHandler } from './modules/interaction-handler';

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
  private reminderHandler: ReminderHandler | null = null;
  private queueProcessor: QueueProcessor | null = null;
  private interactionHandler: InteractionHandler | null = null;

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
      
      // Set bot status to display website
      this.client.user.setPresence({
        activities: [{
          name: 'ALPHA BUILD | matchexec.com',
          type: 4 // ActivityType.Custom
        }],
        status: 'online'
      });
      
      // Register slash commands
      if (this.interactionHandler) {
        await this.interactionHandler.registerSlashCommands();
      }
      
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
      // Connect to database (migrations should be run separately)
      console.log('🗄️ Connecting to database...');
      this.db = await getDbInstance();
      console.log('✅ Database connected');
      
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
      this.reminderHandler = new ReminderHandler(this.client, this.db, this.settings);
      this.interactionHandler = new InteractionHandler(
        this.client,
        this.db,
        this.settings,
        this.sendSignupNotification.bind(this)
      );
      this.queueProcessor = new QueueProcessor(
        this.client,
        this.db,
        this.settings,
        this.announcementHandler,
        this.reminderHandler,
        this.eventHandler,
        this.voiceHandler
      );

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
          this.reminderHandler?.updateSettings(newSettings);
          this.interactionHandler?.updateSettings(newSettings);
          this.queueProcessor?.updateSettings(newSettings);
          this.queueProcessor?.updateVoiceHandler(this.voiceHandler);
        }
      }
    }, 30000);

    // Queue processing every 5 seconds (simplified)
    setInterval(async () => {
      await this.processQueues();
    }, 5000);
  }

  // Process all queues using the QueueProcessor
  private async processQueues() {
    if (!this.queueProcessor || !this.isReady) return;

    try {
      await this.queueProcessor.processAllQueues();
    } catch (error) {
      console.error('❌ Error processing queues:', error);
    }
  }

  // Interaction handlers - delegate to InteractionHandler module
  private async handleSlashCommand(interaction: any) {
    if (this.interactionHandler) {
      await this.interactionHandler.handleSlashCommand(interaction);
    }
  }

  private async handleButtonInteraction(interaction: any) {
    if (this.interactionHandler) {
      await this.interactionHandler.handleButtonInteraction(interaction);
    }
  }

  private async handleModalSubmit(interaction: any) {
    if (this.interactionHandler) {
      await this.interactionHandler.handleModalSubmit(interaction);
    }
  }

  // Signup notification method for InteractionHandler
  private async sendSignupNotification(eventId: string, signupInfo: any) {
    try {
      if (this.reminderHandler) {
        // Use reminder handler to send signup notifications
        await this.reminderHandler.sendSignupNotification(eventId, signupInfo);
      }
    } catch (error) {
      console.error('❌ Error sending signup notification:', error);
    }
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
    // Initialize database and settings first
    await this.initialize();
    
    if (!this.settings?.bot_token) {
      console.error('❌ No bot token available, cannot start bot');
      return;
    }

    try {
      console.log('🔐 Attempting to login to Discord...');
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
    console.log('🔧 About to start bot...');
    await bot.start();
    console.log('✅ Bot start method completed');
  } catch (error) {
    console.error('❌ Failed to start Discord bot:', error);
    console.error('Full error:', error);
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