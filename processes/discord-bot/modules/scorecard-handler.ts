import type { Client, Message } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Database } from '../../../lib/database/connection';
import type { DiscordSettings } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';
import type { WinnerVoteHandler } from './winner-vote-handler';
import { db as pgDb } from '../../../lib/db';
import { countStatDefinitions } from '../../../src/lib/games';
import { enqueueStatsProcessing } from '../../../src/lib/discord-queues';
import { getMatch, listDmRecipients, listVotesForGame } from '../../../src/lib/matches';
import { matchGames } from '../../../lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

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
  private winnerVoteHandler: WinnerVoteHandler | null = null;

  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null
  ) {}

  setWinnerVoteHandler(handler: WinnerVoteHandler) {
    this.winnerVoteHandler = handler;
  }

  private getTeamSide(teamAssignment: string): 'blue' | 'red' | null {
    if (teamAssignment === 'blue') return 'blue';
    if (teamAssignment === 'red') return 'red';
    return null;
  }

  private getTeamColor(teamSide: 'blue' | 'red' | null): number {
    if (teamSide === 'blue') return 0x5b9bd5;
    if (teamSide === 'red') return 0xe06c75;
    return 0x7289da;
  }

  private async sendCommanderScorecardDM(
    commander: CommanderRecord,
    matchId: string,
    matchGameId: string,
    mapName: string
  ): Promise<boolean> {
    try {
      const teamSide = this.getTeamSide(commander.team_assignment);
      const embed = new EmbedBuilder()
        .setTitle('📸 Scorecard Needed')
        .setDescription(
          `**Map:** ${mapName || 'Current Map'}\n\n` +
          `Please take a screenshot of the end-of-match scorecard and **reply to this message** with your screenshot.\n\n` +
          `Make sure the full scorecard is visible in your screenshot.`
        )
        .setColor(this.getTeamColor(teamSide))
        .setFooter({ text: 'MatchExec Stats System' });

      const user = await this.client.users.fetch(commander.discord_user_id);
      const sentMessage = await user.send({ embeds: [embed] });

      await this.db.run(
        `INSERT INTO scorecard_dm_messages (id, match_id, match_game_id, discord_user_id, discord_message_id, participant_id, team_side)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), matchId, matchGameId, commander.discord_user_id, sentMessage.id, commander.id, teamSide]
      );

      logger.debug(`📩 Scorecard prompt sent to ${commander.discord_user_id} for match ${matchId}`);
      return true;
    } catch (err) {
      logger.error(`Failed to DM commander ${commander.discord_user_id}:`, err);
      return false;
    }
  }

  private async downloadAndSaveScreenshot(
    attachment: { url: string; contentType: string | null; name: string | null },
    matchId: string
  ): Promise<string> {
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error('download_failed');

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = (attachment.contentType?.split(';')[0] ?? 'image/jpeg').trim();
    const MIME_TO_EXT: Record<string, string> = {
      'image/jpeg': '.jpg', 'image/png': '.png',
      'image/webp': '.webp', 'image/gif': '.gif',
    };
    const ext = MIME_TO_EXT[contentType] ?? '.jpg';

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'scorecards', matchId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), buffer);

    return `/uploads/scorecards/${matchId}/${filename}`;
  }

  private async checkHeldWinnerVote(matchId: string, matchGameId: string): Promise<void> {
    try {
      const votes = await listVotesForGame(pgDb, matchGameId);
      if (!votes || votes.length === 0) return;
      const allVoted = votes.every(v => v.voted_for !== null);
      const uniqueVotes = new Set(votes.map(v => v.voted_for));
      if (allVoted && uniqueVotes.size === 1) {
        const winner = votes[0].voted_for as 'blue' | 'red';
        logger.info(`🗳️ Scorecard received — triggering held winner vote for game ${matchGameId}`);
        await this.winnerVoteHandler!.submitWinner(matchId, matchGameId, winner);
      }
    } catch (err) {
      logger.error('Error checking held winner vote after scorecard submission:', err);
    }
  }

  async sendScorecardPrompts(matchId: string, matchGameId: string, mapName: string): Promise<boolean> {
    try {
      const statsSettings = await this.db.get<{ enabled: number }>(
        'SELECT enabled FROM stats_settings WHERE id = 1'
      );
      if (!statsSettings?.enabled) return false;

      const match = await getMatch(pgDb, matchId);
      if (!match) return false;

      if ((await countStatDefinitions(pgDb, match.game_id)) === 0) return false;

      const commanders: CommanderRecord[] = (await listDmRecipients(pgDb, matchId, { commandersOnly: true }))
        .map(r => ({ id: r.id, discord_user_id: r.discord_user_id, team_assignment: r.team_assignment ?? '' }));
      if (!commanders || commanders.length === 0) return false;

      const results = await Promise.all(
        commanders.map(c => this.sendCommanderScorecardDM(c, matchId, matchGameId, mapName))
      );
      return results.some(Boolean);
    } catch (error) {
      logger.error('Error sending scorecard prompts:', error);
      return false;
    }
  }

  async handleDMReply(message: Message): Promise<void> {
    if (!message.reference?.messageId) return;

    try {
      const dmRecord = await this.db.get<ScorecardDmRecord>(
        `SELECT * FROM scorecard_dm_messages
         WHERE discord_message_id = ? AND discord_user_id = ?`,
        [message.reference.messageId, message.author.id]
      );

      if (!dmRecord) return;

      if (!dmRecord.match_id) {
        logger.error('Invalid match_id in scorecard DM record');
        return;
      }

      const imageAttachments = message.attachments.filter(
        (a) => a.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(a.name || '')
      );

      if (imageAttachments.size === 0) {
        await message.reply('Please attach a screenshot image to submit your scorecard.');
        return;
      }

      const attachment = imageAttachments.first()!;
      let screenshotUrl: string;
      try {
        screenshotUrl = await this.downloadAndSaveScreenshot(attachment, dmRecord.match_id);
      } catch {
        await message.reply('Failed to download your screenshot. Please try again.');
        return;
      }

      const submissionId = crypto.randomUUID();

      await this.db.run(
        `INSERT INTO scorecard_submissions (id, match_id, match_game_id, submitted_by_participant_id, submitted_by_discord_user_id, team_side, screenshot_url, discord_message_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [submissionId, dmRecord.match_id, dmRecord.match_game_id, dmRecord.participant_id,
         message.author.id, dmRecord.team_side || 'blue', screenshotUrl, message.id]
      );

      // Queue row lives in Postgres, the submission in SQLite until the stats domain is ported (not one transaction yet)
      await enqueueStatsProcessing(pgDb, { submissionId, matchId: dmRecord.match_id, matchGameId: dmRecord.match_game_id });

      await message.reply('✅ Screenshot received! Processing stats...');
      logger.debug(`📸 Scorecard screenshot received from ${message.author.id} for match ${dmRecord.match_id}`);

      if (this.winnerVoteHandler) {
        await this.checkHeldWinnerVote(dmRecord.match_id, dmRecord.match_game_id);
      }
    } catch (error) {
      logger.error('Error handling DM reply:', error);
    }
  }

  async handleNonReplyDM(message: Message): Promise<void> {
    try {
      // Check if user has any pending scorecard DM records
      // TODO(stats): scorecard_dm_messages is still SQLite; the game status lives in Postgres, so this is two reads.
      const dmRows = await this.db.all<{ match_game_id: string }>(
        'SELECT match_game_id FROM scorecard_dm_messages WHERE discord_user_id = ?',
        [message.author.id]
      );
      const gameIds = [...new Set(dmRows.map(r => r.match_game_id))];
      const pendingRecord = gameIds.length === 0 ? undefined : (await pgDb.select({ id: matchGames.id }).from(matchGames)
        .where(and(inArray(matchGames.id, gameIds), eq(matchGames.status, 'ongoing'))).limit(1))[0];

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
