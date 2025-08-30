import { Client, GatewayIntentBits } from 'discord.js';
import { waitForDatabaseReady } from '../../lib/database';
import { Database } from '../../lib/database';
import { DiscordSettings } from '../../shared/types';
import { getVersionInfo } from '../../lib/version-server';

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
    this.client.once('clientReady', async () => {
      if (!this.client.user) return;
      
      
      // Set bot status to display website and version
      const versionInfo = getVersionInfo();
      const statusText = versionInfo.isDev 
        ? `matchexec.com | ${versionInfo.version}`
        : `matchexec.com | ${versionInfo.version}`;
      
      this.client.user.setPresence({
        activities: [{
          name: statusText,
          type: 4 // ActivityType.Custom
        }],
        status: 'online'
      });
      
      // Register slash commands
      if (this.interactionHandler) {
        try {
          await this.interactionHandler.registerSlashCommands();
        } catch (error) {
          console.error('❌ Error registering slash commands:', error);
          // Don't crash if slash command registration fails
        }
      }
      
      this.isReady = true;
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
    
    // Add global error handlers to prevent crashes
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      // Don't exit, just log the error
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit, just log the error
    });
  }

  private async checkWelcomeFlowCompleted(): Promise<boolean> {
    if (!this.db) return false;
    
    try {
      const result = await this.db.get<{ setting_value: string }>(
        'SELECT setting_value FROM app_settings WHERE setting_key = ?',
        ['welcome_flow_completed']
      );
      
      return result?.setting_value === 'true';
    } catch (error) {
      console.error('❌ Error checking welcome flow status:', error);
      return false;
    }
  }

  private async initialize() {
    try {
      // Wait for database to be ready (migrations should be run separately)
      this.db = await waitForDatabaseReady();
      
      // Check if welcome flow is completed
      const welcomeCompleted = await this.checkWelcomeFlowCompleted();
      if (!welcomeCompleted) {
        console.log('⏳ Welcome flow not completed yet, waiting...');
        return false;
      }
      
      // Initialize settings manager
      this.settingsManager = new SettingsManager(this.db);
      this.settings = await this.settingsManager.loadSettings();

      if (!this.settings?.bot_token) {
        console.warn('⚠️ Bot token not configured');
        return false;
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


      // Start periodic tasks
      this.startPeriodicTasks();
      
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize bot:', error);
      return false;
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
      // Don't let queue processing errors crash the bot
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
    
    if (this.voiceHandler) {
      await this.voiceHandler.disconnectFromAllVoiceChannels();
    }
    
    if (this.client) {
      this.client.destroy();
    }
    
    process.exit(0);
  }

  async start() {
    // Initialize database and settings first
    const initialized = await this.initialize();
    
    if (!initialized) {
      // If initialization failed due to incomplete welcome flow, 
      // set up a periodic check to try again
      this.startWelcomeFlowWatcher();
      return;
    }
    
    if (!this.settings?.bot_token) {
      console.error('❌ No bot token available, cannot start bot');
      return;
    }

    try {
      await this.client.login(this.settings.bot_token);
      console.log('✅ Discord bot successfully connected');
    } catch (error) {
      console.error('❌ Failed to login to Discord:', error);
    }
  }

  private startWelcomeFlowWatcher() {
    console.log('👀 Watching for welcome flow completion...');
    
    const checkInterval = setInterval(async () => {
      const welcomeCompleted = await this.checkWelcomeFlowCompleted();
      
      if (welcomeCompleted) {
        console.log('✅ Welcome flow completed! Initializing Discord bot...');
        clearInterval(checkInterval);
        
        // Try to initialize and start the bot again
        const initialized = await this.initialize();
        if (initialized && this.settings?.bot_token) {
          try {
            await this.client.login(this.settings.bot_token);
            console.log('✅ Discord bot successfully connected');
          } catch (error) {
            console.error('❌ Failed to login to Discord:', error);
          }
        }
      }
    }, 5000); // Check every 5 seconds
  }
}

// Create and start the bot
const bot = new MatchExecBot();

// Initialize database and start the bot
(async () => {
  try {
    await bot.start();
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