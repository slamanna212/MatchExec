import { Client, GatewayIntentBits } from 'discord.js';
import type { Database } from '../../../lib/database/connection';
import { getDiscordAvatarUrl } from '../../discord-bot/utils/avatar-fetcher';
import { logger } from '../../../src/lib/logger/server';

export class AvatarUpdateJob {
  private discordClient: Client | null = null;
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Initialize Discord client for avatar fetching
   */
  private async initializeDiscordClient(): Promise<void> {
    if (this.discordClient?.isReady()) {
      return; // Already initialized
    }

    try {
      // Get bot token from database
      const settings = await this.db.get<{ bot_token: string }>(
        'SELECT bot_token FROM discord_settings WHERE id = 1'
      );

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

      // Get all unique Discord user IDs from participants, skipping users with 3+ failures
      const participants = await this.db.all<{ discord_user_id: string }>(`
        SELECT DISTINCT discord_user_id
        FROM match_participants
        WHERE discord_user_id IS NOT NULL
          AND (failed_avatar_checks IS NULL OR failed_avatar_checks < 3)
      `);

      // Check how many users are being skipped
      const skipped = await this.db.get<{ count: number }>(`
        SELECT COUNT(DISTINCT discord_user_id) as count
        FROM match_participants
        WHERE discord_user_id IS NOT NULL
          AND failed_avatar_checks >= 3
      `);

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
      for (const { discord_user_id } of participants) {
        try {
          const avatarUrl = await getDiscordAvatarUrl(this.discordClient, discord_user_id);

          // Update all records for this user - success resets failure count
          await this.db.run(`
            UPDATE match_participants
            SET avatar_url = ?, last_avatar_check = CURRENT_TIMESTAMP, failed_avatar_checks = 0
            WHERE discord_user_id = ?
          `, [avatarUrl, discord_user_id]);

          updated++;
        } catch (error) {
          logger.error(`Failed to update avatar for user ${discord_user_id}:`, error);
          failed++;
          failedUserIds.push(discord_user_id);

          // Update last_avatar_check but do NOT overwrite avatar_url
          await this.db.run(`
            UPDATE match_participants
            SET last_avatar_check = CURRENT_TIMESTAMP
            WHERE discord_user_id = ?
          `, [discord_user_id]);
        }
      }

      // Only increment failed_avatar_checks when at least one user succeeded
      // (proving connectivity works). If ALL failed, it's likely a connectivity issue.
      if (updated === 0 && failed > 0) {
        logger.warning(`⚠️  All ${failed} avatar fetches failed — likely a connectivity or API issue. Not incrementing failure counts.`);
      } else if (failedUserIds.length > 0) {
        // At least one succeeded, so increment failure counts for those that failed
        for (const userId of failedUserIds) {
          await this.db.run(`
            UPDATE match_participants
            SET failed_avatar_checks = COALESCE(failed_avatar_checks, 0) + 1
            WHERE discord_user_id = ?
          `, [userId]);
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
