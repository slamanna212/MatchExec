import type { Client, Message } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import crypto from 'crypto';
import type { DiscordSettings } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';
import type { WinnerVoteHandler } from './winner-vote-handler';
import { db as pgDb } from '../../../lib/db';
import { putBlob } from '../../../lib/storage';
import { countStatDefinitions } from '../../../src/lib/games';
import { enqueueStatsProcessing } from '../../../src/lib/discord-queues';
import { getMatch, hasOngoingGame, listDmRecipients, listVotesForGame } from '../../../src/lib/matches';
import {
  createSubmission, findScorecardDm, findSubmissionByDiscordMessage, isStatsEnabled, listScorecardDmGameIds, recordScorecardDm,
} from '../../../src/lib/stats';
import { extensionForMime } from '../../../src/lib/uploads';

interface CommanderRecord {
  id: string;
  discord_user_id: string;
  team_assignment: string;
}

export class ScorecardHandler {
  private winnerVoteHandler: WinnerVoteHandler | null = null;

  constructor(
    private client: Client,
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

      await recordScorecardDm(pgDb, {
        matchId, matchGameId, discordUserId: commander.discord_user_id, discordMessageId: sentMessage.id,
        participantId: commander.id, teamSide,
      });

      logger.debug(`📩 Scorecard prompt sent to ${commander.discord_user_id} for match ${matchId}`);
      return true;
    } catch (err) {
      logger.error(`Failed to DM commander ${commander.discord_user_id}:`, err);
      return false;
    }
  }

  /** Download the Discord attachment; returns the bytes and the (normalised) content type. */
  private async downloadScreenshot(
    attachment: { url: string; contentType: string | null; name: string | null },
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error('download_failed');

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = (attachment.contentType?.split(';')[0] ?? 'image/jpeg').trim();
    return { buffer, contentType };
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
      if (!(await isStatsEnabled(pgDb))) return false;

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
      const dmRecord = await findScorecardDm(pgDb, message.reference.messageId, message.author.id);

      if (!dmRecord) return;

      if (!dmRecord.match_id) {
        logger.error('Invalid match_id in scorecard DM record');
        return;
      }

      // A reply event can be delivered twice: one submission per Discord message
      if (await findSubmissionByDiscordMessage(pgDb, message.id)) return;

      const imageAttachments = message.attachments.filter(
        (a) => a.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(a.name || '')
      );

      if (imageAttachments.size === 0) {
        await message.reply('Please attach a screenshot image to submit your scorecard.');
        return;
      }

      const attachment = imageAttachments.first()!;
      let download: { buffer: Buffer; contentType: string };
      try {
        download = await this.downloadScreenshot(attachment);
      } catch {
        await message.reply('Failed to download your screenshot. Please try again.');
        return;
      }

      const submissionId = crypto.randomUUID();
      const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${extensionForMime(download.contentType)}`;
      const screenshotUrl = `/uploads/scorecards/${dmRecord.match_id}/${filename}`;

      // The screenshot, the submission and the extraction job commit together
      await pgDb.transaction(async (tx) => {
        await putBlob(tx, {
          path: screenshotUrl, kind: 'scorecard', contentType: download.contentType, data: download.buffer, filename,
          owner: { type: 'match', id: dmRecord.match_id },
        });
        await createSubmission(tx, {
          id: submissionId, matchId: dmRecord.match_id, matchGameId: dmRecord.match_game_id, teamSide: dmRecord.team_side || 'blue',
          screenshotUrl, submittedByParticipantId: dmRecord.participant_id, submittedByDiscordUserId: message.author.id,
          discordMessageId: message.id,
        });
        await enqueueStatsProcessing(tx, { submissionId, matchId: dmRecord.match_id, matchGameId: dmRecord.match_game_id });
      });

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
      const gameIds = await listScorecardDmGameIds(pgDb, message.author.id);
      const pendingRecord = await hasOngoingGame(pgDb, gameIds);

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
