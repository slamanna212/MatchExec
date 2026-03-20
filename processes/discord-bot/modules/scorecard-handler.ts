import type { Client, Message } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Database } from '../../../lib/database/connection';
import type { DiscordSettings } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';

interface ScorecardDmRecord {
  id: string;
  match_id: string;
  match_game_id: string;
  discord_user_id: string;
  discord_message_id: string;
  participant_id: string | null;
  team_side: 'blue' | 'red' | null;
}

interface CommanderRecord {
  id: string;
  discord_user_id: string;
  team_assignment: string;
}

export class ScorecardHandler {
  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null
  ) {}

  async sendScorecardPrompts(matchId: string, matchGameId: string, mapName: string): Promise<boolean> {
    try {
      // Check stats feature enabled
      const statsSettings = await this.db.get<{ enabled: number }>(
        'SELECT enabled FROM stats_settings WHERE id = 1'
      );
      if (!statsSettings?.enabled) return false;

      // Check game has stat definitions
      const match = await this.db.get<{ game_id: string }>(
        'SELECT game_id FROM matches WHERE id = ?',
        [matchId]
      );
      if (!match) return false;

      const statCount = await this.db.get<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM game_stat_definitions WHERE game_id = ?',
        [match.game_id]
      );
      if (!statCount || statCount.cnt === 0) return false;

      // Get commanders (participants with receives_map_codes=1)
      const commanders = await this.db.all<CommanderRecord>(
        `SELECT id, discord_user_id, team_assignment FROM match_participants
         WHERE match_id = ? AND receives_map_codes = 1 AND discord_user_id IS NOT NULL`,
        [matchId]
      );

      if (!commanders || commanders.length === 0) return false;

      let dmsSent = 0;

      for (const commander of commanders) {
        try {
          const teamSide = commander.team_assignment === 'blue' ? 'blue'
            : commander.team_assignment === 'red' ? 'red'
            : null;

          const embed = new EmbedBuilder()
            .setTitle('📸 Scorecard Needed')
            .setDescription(
              `**Map:** ${mapName || 'Current Map'}\n\n` +
              `Please take a screenshot of the end-of-match scorecard and **reply to this message** with your screenshot.\n\n` +
              `Make sure the full scorecard is visible in your screenshot.`
            )
            .setColor(teamSide === 'blue' ? 0x5b9bd5 : teamSide === 'red' ? 0xe06c75 : 0x7289da)
            .setFooter({ text: 'MatchExec Stats System' });

          const user = await this.client.users.fetch(commander.discord_user_id);
          const sentMessage = await user.send({ embeds: [embed] });

          // Save DM message record
          await this.db.run(
            `INSERT INTO scorecard_dm_messages (id, match_id, match_game_id, discord_user_id, discord_message_id, participant_id, team_side)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              crypto.randomUUID(),
              matchId,
              matchGameId,
              commander.discord_user_id,
              sentMessage.id,
              commander.id,
              teamSide,
            ]
          );

          dmsSent++;
          logger.debug(`📩 Scorecard prompt sent to ${commander.discord_user_id} for match ${matchId}`);
        } catch (err) {
          logger.error(`Failed to DM commander ${commander.discord_user_id}:`, err);
        }
      }

      return dmsSent > 0;
    } catch (error) {
      logger.error('Error sending scorecard prompts:', error);
      return false;
    }
  }

  async handleDMReply(message: Message): Promise<void> {
    if (!message.reference?.messageId) return;

    try {
      // Look up the replied-to message in our DM records
      const dmRecord = await this.db.get<ScorecardDmRecord>(
        `SELECT * FROM scorecard_dm_messages
         WHERE discord_message_id = ? AND discord_user_id = ?`,
        [message.reference.messageId, message.author.id]
      );

      if (!dmRecord) return; // Not a scorecard reply

      // Check for image attachments
      const imageAttachments = message.attachments.filter(
        (a) => a.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(a.name || '')
      );

      if (imageAttachments.size === 0) {
        await message.reply('Please attach a screenshot image to submit your scorecard.');
        return;
      }

      const attachment = imageAttachments.first()!;

      // Download the image
      const response = await fetch(attachment.url);
      if (!response.ok) {
        await message.reply('Failed to download your screenshot. Please try again.');
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = path.extname(attachment.name || '.jpg').toLowerCase() || '.jpg';

      // Save to disk
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'scorecards', dmRecord.match_id);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, buffer);

      const screenshotUrl = `/uploads/scorecards/${dmRecord.match_id}/${filename}`;
      const submissionId = crypto.randomUUID();
      const queueId = crypto.randomUUID();

      // Create submission record
      await this.db.run(
        `INSERT INTO scorecard_submissions (id, match_id, match_game_id, submitted_by_participant_id, submitted_by_discord_user_id, team_side, screenshot_url, discord_message_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          submissionId,
          dmRecord.match_id,
          dmRecord.match_game_id,
          dmRecord.participant_id,
          message.author.id,
          dmRecord.team_side || 'blue',
          screenshotUrl,
          message.id,
        ]
      );

      // Queue for AI processing
      await this.db.run(
        `INSERT INTO stats_processing_queue (id, submission_id, match_id, match_game_id) VALUES (?, ?, ?, ?)`,
        [queueId, submissionId, dmRecord.match_id, dmRecord.match_game_id]
      );

      await message.reply('✅ Screenshot received! Processing stats...');
      logger.debug(`📸 Scorecard screenshot received from ${message.author.id} for match ${dmRecord.match_id}`);
    } catch (error) {
      logger.error('Error handling DM reply:', error);
    }
  }

  async handleNonReplyDM(message: Message): Promise<void> {
    try {
      // Check if user has any pending scorecard DM records
      const pendingRecord = await this.db.get<{ id: string }>(
        `SELECT sdm.id FROM scorecard_dm_messages sdm
         JOIN match_games mg ON mg.id = sdm.match_game_id
         WHERE sdm.discord_user_id = ? AND mg.status = 'ongoing'
         LIMIT 1`,
        [message.author.id]
      );

      if (pendingRecord) {
        await message.reply(
          'Please **reply directly** to the specific map message I sent you to submit your scorecard screenshot.'
        );
      }
    } catch (error) {
      logger.error('Error handling non-reply DM:', error);
    }
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}
