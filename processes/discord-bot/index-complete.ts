import { Client, GatewayIntentBits } from 'discord.js';
import { getDbInstance } from '../../lib/database-init';
import { Database } from '../../lib/database/connection';
import { DiscordSettings } from '../../shared/types';

// Import our modules
import { VoiceHandler } from './modules/voice-handler';
import { EventHandler } from './modules/event-handler';
import { AnnouncementHandler } from './modules/announcement-handler';
import { SettingsManager } from './modules/settings-manager';
import { InteractionHandler } from './modules/interaction-handler';
import { ReminderHandler } from './modules/reminder-handler';
import { QueueProcessor } from './modules/queue-processor';
import { Utils } from './modules/utils';

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
  private interactionHandler: InteractionHandler | null = null;
  private reminderHandler: ReminderHandler | null = null;
  private queueProcessor: QueueProcessor | null = null;
  private utils: Utils | null = null;

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
      
      // Set bot status
      this.client.user.setActivity('Managing matches • /status', { type: 'PLAYING' as any });

      // Initialize database and settings
      await this.initialize();
      
      this.isReady = true;
      console.log('🤖 MatchExec Discord Bot is ready!');
    });

    // Interaction handling
    this.client.on('interactionCreate', async (interaction) => {
      if (!this.isReady || !this.settings || !this.interactionHandler) return;

      try {
        if (interaction.isChatInputCommand()) {
          await this.interactionHandler.handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
          await this.interactionHandler.handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
          await this.interactionHandler.handleModalSubmit(interaction);
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private async initialize() {
    try {
      // Initialize database
      this.db = await getDbInstance();
      
      // Initialize settings manager
      this.settingsManager = new SettingsManager(this.db);
      this.settings = await this.settingsManager.loadSettings();

      if (!this.settings?.bot_token) {
        console.warn('⚠️ Bot token not configured');
        return;
      }

      // Initialize utility module
      this.utils = new Utils(this.db);

      // Initialize all modules
      this.voiceHandler = new VoiceHandler(this.client, this.db, this.settings);
      this.eventHandler = new EventHandler(this.client, this.db, this.settings);
      this.announcementHandler = new AnnouncementHandler(this.client, this.db, this.settings);
      this.reminderHandler = new ReminderHandler(this.client, this.db, this.settings);
      
      // Initialize interaction handler with signup callback
      this.interactionHandler = new InteractionHandler(
        this.client, 
        this.db, 
        this.settings,
        (eventId: string, signupInfo: any) => this.reminderHandler?.sendSignupNotification(eventId, signupInfo) || Promise.resolve()
      );

      // Initialize queue processor
      this.queueProcessor = new QueueProcessor(
        this.client,
        this.db,
        this.settings,
        this.announcementHandler,
        this.reminderHandler,
        this.eventHandler
      );

      // Register slash commands
      await this.interactionHandler.registerSlashCommands();

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
          this.updateAllModuleSettings(newSettings);
        }
      }
    }, 30000);

    // Queue processing every 5 seconds
    setInterval(async () => {
      if (this.queueProcessor) {
        await this.queueProcessor.processAllQueues();
      }
    }, 5000);

    // Voice test request processing (specific handling)
    setInterval(async () => {
      await this.processVoiceTestRequests();
    }, 5000);

    // Cleanup old completed/failed queue items every hour
    setInterval(async () => {
      await this.cleanupOldQueueItems();
    }, 3600000); // 1 hour

    console.log('✅ Announcement queue processor started');
    console.log('✅ Deletion queue processor started');
    console.log('✅ Status update queue processor started');
    console.log('✅ Reminder queue processor started');
    console.log('✅ Expired match cleanup scheduler started');
  }

  private updateAllModuleSettings(settings: DiscordSettings) {
    this.voiceHandler?.updateSettings(settings);
    this.eventHandler?.updateSettings(settings);
    this.announcementHandler?.updateSettings(settings);
    this.reminderHandler?.updateSettings(settings);
    this.interactionHandler?.updateSettings(settings);
    this.queueProcessor?.updateSettings(settings);
  }

  // Process voice test requests specifically
  private async processVoiceTestRequests() {
    if (!this.db || !this.isReady || !this.voiceHandler) return;

    try {
      const requests = await this.db.all<{
        id: string;
        type: string;
        data: string;
        created_at: string;
      }>(`
        SELECT id, type, data, created_at
        FROM discord_bot_requests
        WHERE status = 'pending' AND type = 'voice_test'
        ORDER BY created_at ASC
        LIMIT 10
      `);

      for (const request of requests) {
        try {
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
      console.error('❌ Error processing Discord bot requests:', error);
    }
  }

  private async cleanupOldQueueItems() {
    if (!this.db) return;

    try {
      // Clean up old queue items (older than 24 hours)
      const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const tables = [
        'discord_announcement_queue',
        'discord_deletion_queue', 
        'discord_status_update_queue',
        'discord_reminder_queue',
        'discord_bot_requests'
      ];

      for (const table of tables) {
        try {
          await this.db.run(`
            DELETE FROM ${table} 
            WHERE (status = 'completed' OR status = 'failed') 
            AND datetime(processed_at) < datetime(?)
          `, [cutoffDate]);
        } catch (error) {
          console.error(`❌ Error cleaning up ${table}:`, error);
        }
      }

      console.log('🧹 Cleaned up old queue items');
    } catch (error) {
      console.error('❌ Error during queue cleanup:', error);
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

  async sendPlayerReminders(matchId: string) {
    if (!this.reminderHandler) {
      return false;
    }
    return await this.reminderHandler.sendPlayerReminders(matchId);
  }

  async sendSignupNotification(matchId: string, signupInfo: any) {
    if (!this.reminderHandler) {
      return false;
    }
    return await this.reminderHandler.sendSignupNotification(matchId, signupInfo);
  }

  async playVoiceAnnouncement(channelId: string, audioType: 'welcome' | 'nextround' | 'finish', lineNumber?: number) {
    if (!this.voiceHandler) {
      return false;
    }
    return await this.voiceHandler.playVoiceAnnouncement(channelId, audioType, lineNumber);
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

export const sendPlayerReminders = async (matchId: string) => {
  return await bot.sendPlayerReminders(matchId);
};

export const playVoiceAnnouncement = async (channelId: string, audioType: 'welcome' | 'nextround' | 'finish', lineNumber?: number) => {
  return await bot.playVoiceAnnouncement(channelId, audioType, lineNumber);
};