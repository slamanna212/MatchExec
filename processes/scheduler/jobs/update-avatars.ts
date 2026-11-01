import { Client, GatewayIntentBits } from 'discord.js';
import { db as pgDb, type Executor } from '../../../lib/db';
import {
  countAvatarUsersSkipped, incrementAvatarFailures, listAvatarRefreshUsers, recordAvatarCheckFailed, recordAvatarRefreshed,
} from '../../../src/lib/matches';
import { getDiscordAvatarUrl } from '../../discord-bot/utils/avatar-fetcher';
import { logger } from '../../../src/lib/logger/server';
import { getDiscordSettings } from '../../../src/lib/settings';

export class AvatarUpdateJob {
  private discordClient: Client | null = null;
  constructor(private db: Executor = pgDb) {}

  /**
   * Initialize Discord client for avatar fetching
   */
  private async initializeDiscordClient(): Promise<void> {
    if (this.discordClient?.isReady()) {
      return; // Already initialized
    }

    try {
      // Get bot token from database
      const settings = await getDiscordSettings();

      if (!settings?.bot_token) {
        throw new Error('Bot token not found in discord_settings');
      }

      // Create Discord client with minimal intents (we only need to fetch user data)
      this.discordClient = new Client({
        intents: [GatewayIntentBits.Guilds]
      });

      // Login to Discord
      await this.discordClient.login(settings.bot_token);
      logger.info('🖼️  Discord client initialized for avatar updates');
    } catch (error) {
      logger.error('❌ Failed to initialize Discord client for avatar updates:', error);
      throw error;
    }
  }

  /**
   * Update all participant avatars from Discord
   */
  async updateAvatars(): Promise<void> {
    logger.info('🖼️  Starting avatar update job');

    try {
      // Ensure Discord client is ready
      await this.initializeDiscordClient();

      if (!this.discordClient) {
        logger.error('❌ Discord client not available, skipping avatar update');
        return;
      }

      // Get all unique Discord user IDs from active match participants, skipping users with 3+ failures
      const participants = (await listAvatarRefreshUsers(this.db)).map((discord_user_id) => ({ discord_user_id }));

      // Check how many users are being skipped due to failure threshold
      const skipped = { count: await countAvatarUsersSkipped(this.db) };

      if (skipped && skipped.count > 0) {
        logger.debug(`🖼️  Skipping ${skipped.count} users with 3+ failed avatar checks`);
      }

      if (!participants || participants.length === 0) {
        logger.info('ℹ️  No participants found, skipping avatar update');
        return;
      }

      let updated = 0;
      let failed = 0;
      const failedUserIds: string[] = [];

      // Update each user's avatar
      for (const { discord_user_id: discordUserId } of participants) {
        try {
          const avatarUrl = await getDiscordAvatarUrl(this.discordClient, discordUserId);

          // Update all records for this user - success resets failure count
          await recordAvatarRefreshed(this.db, discordUserId, avatarUrl);

          updated++;
        } catch (error) {
          logger.error(`Failed to update avatar for user ${discordUserId}:`, error);
          failed++;
          failedUserIds.push(discordUserId);

          // Update last_avatar_check but do NOT overwrite avatar_url
          await recordAvatarCheckFailed(this.db, discordUserId);
        }
      }

      // Only increment failed_avatar_checks when at least one user succeeded
      // (proving connectivity works). If ALL failed, it's likely a connectivity issue.
      if (updated === 0 && failed > 0) {
        logger.warning(`⚠️  All ${failed} avatar fetches failed — likely a connectivity or API issue. Not incrementing failure counts.`);
      } else if (failedUserIds.length > 0) {
        // At least one succeeded, so increment failure counts for those that failed
        for (const userId of failedUserIds) {
          await incrementAvatarFailures(this.db, userId);
        }
      }

      logger.info(`✅ Avatar update complete: ${updated} updated, ${failed} failed`);
    } catch (error) {
      logger.error('❌ Avatar update job failed:', error);
    }
  }

  /**
   * Cleanup Discord client when shutting down
   */
  async cleanup(): Promise<void> {
    if (this.discordClient) {
      this.discordClient.destroy();
      this.discordClient = null;
      logger.info('🖼️  Discord client cleaned up');
    }
  }
}
