import type { Client, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { logger } from '../../../src/lib/logger/server';
import { db } from '../../../lib/db';
import {
  castVote, findVoteByMessage, isScorecardRequiredButMissing, listVoteCommanders, listVotesForGame, recordVotePrompt,
  submitVoteWinner, type VoteRow,
} from '../../../src/lib/matches';

type VoteRecord = VoteRow;

export class WinnerVoteHandler {
  constructor(private client: Client) {}

  async sendWinnerVotePrompts(matchId: string, matchGameId: string, mapName: string): Promise<boolean> {
    try {
      const commanders = await listVoteCommanders(db, matchId);

      if (!commanders || commanders.length === 0) return false;

      let dmsSent = 0;

      for (const commander of commanders) {
        try {
          const teamSide = commander.team_side;

          const teamLabel = teamSide === 'blue' ? '🔵 Blue Team'
            : teamSide === 'red' ? '🔴 Red Team'
            : 'Unassigned';

          const embed = new EmbedBuilder()
            .setTitle('🏆 Who Won?')
            .setDescription(
              `**Map:** ${mapName || 'Current Map'}\n\n` +
              `React below to report the winning team.\n\n` +
              `🔵 = Blue Team wins\n` +
              `🔴 = Red Team wins\n\n` +
              `You are on: **${teamLabel}**`
            )
            .setColor(teamSide === 'blue' ? 0x5b9bd5 : teamSide === 'red' ? 0xe06c75 : 0x7289da)
            .setFooter({ text: 'MatchExec Scoring' });

          const user = await this.client.users.fetch(commander.discord_user_id);
          const sentMessage = await user.send({ embeds: [embed] });

          // Add both reaction options so commander can just click
          await sentMessage.react('🔵');
          await sentMessage.react('🔴');

          await recordVotePrompt(db, {
            matchId, matchGameId, discordUserId: commander.discord_user_id, discordMessageId: sentMessage.id,
            participantId: commander.id, teamSide,
          });

          dmsSent++;
          logger.debug(`🗳️ Winner vote prompt sent to ${commander.discord_user_id} for match ${matchId}`);
        } catch (err) {
          logger.error(`Failed to send winner vote DM to commander ${commander.discord_user_id}:`, err);
        }
      }

      return dmsSent > 0;
    } catch (error) {
      logger.error('Error sending winner vote prompts:', error);
      return false;
    }
  }

  async handleReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ): Promise<void> {
    const emoji = reaction.emoji.name;
    if (emoji !== '🔵' && emoji !== '🔴') return;

    const messageId = reaction.message.id;
    const discordUserId = user.id;

    try {
      const record = await findVoteByMessage(db, messageId, discordUserId);
      if (!record) return;
      // Ignore if already voted
      if (record.voted_for !== null) return;

      const votedFor: 'blue' | 'red' = emoji === '🔵' ? 'blue' : 'red';
      // Atomic: only the first vote counts even if the reaction event is delivered twice.
      if (!(await castVote(db, record.id, votedFor))) return;

      logger.debug(`🗳️ Commander ${discordUserId} voted ${votedFor} for game ${record.match_game_id}`);

      await this.evaluateVotes(record.match_id, record.match_game_id);
    } catch (error) {
      logger.error('Error handling winner vote reaction:', error);
    }
  }

  private async evaluateVotes(matchId: string, matchGameId: string): Promise<void> {
    const allVotes = await listVotesForGame(db, matchGameId);

    if (!allVotes || allVotes.length === 0) return;

    const voted = allVotes.filter(v => v.voted_for !== null);
    const totalCommanders = allVotes.length;

    if (voted.length === 0) return;

    const uniqueVotes = new Set(voted.map(v => v.voted_for));

    if (voted.length === totalCommanders) {
      // All commanders have voted
      if (uniqueVotes.size === 1) {
        // Consensus — check stats gate before submitting
        const winner = voted[0].voted_for as 'blue' | 'red';
        const blocked = await this.checkStatsGate(matchId, matchGameId);
        if (blocked) {
          // Notify commanders scorecard required; leave voted_for set for Path B
          await this.notifyScorecardRequired(allVotes);
          return;
        }
        await this.submitWinner(matchId, matchGameId, winner);
      } else {
        // Conflict — notify commanders
        logger.warning(`⚠️ Winner vote conflict for game ${matchGameId} — commanders disagree`);
        await this.notifyConflict(allVotes);
      }
    }
    // Partial votes: nothing to do until everyone has voted. (The old provisional `match_games.winner_id` write went
    // away with the legacy scoring columns.)
  }

  /** Returns true if a scorecard is required but not yet submitted. */
  private async checkStatsGate(matchId: string, matchGameId: string): Promise<boolean> {
    return isScorecardRequiredButMissing(db, matchId, matchGameId);
  }

  private async notifyScorecardRequired(votes: VoteRecord[]): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('📸 Scorecard Required')
      .setDescription(
        'Vote recorded ✅ — a scorecard is also required for this match.\n\n' +
        'Submit your screenshot via DM and the result will confirm automatically.'
      )
      .setColor(0xffa500);

    for (const vote of votes) {
      try {
        const user = await this.client.users.fetch(vote.discord_user_id);
        await user.send({ embeds: [embed] });
      } catch (err) {
        logger.error(`Failed to send scorecard-required DM to ${vote.discord_user_id}:`, err);
      }
    }
  }

  async submitWinner(matchId: string, matchGameId: string, winner: 'blue' | 'red'): Promise<void> {
    try {
      if (await submitVoteWinner(matchId, matchGameId, winner)) {
        logger.info(`Winner vote consensus: ${winner} wins game ${matchGameId}`);
      }
    } catch (error) {
      logger.error(`Error submitting winner vote result for game ${matchGameId}:`, error);
    }
  }

  private async notifyConflict(votes: VoteRecord[]): Promise<void> {
    const conflictEmbed = new EmbedBuilder()
      .setTitle('⚠️ Winner Vote Conflict')
      .setDescription(
        'The commanders have submitted conflicting results.\n\n' +
        'Please report the correct winner using the web interface.'
      )
      .setColor(0xffa500);

    for (const vote of votes) {
      try {
        const user = await this.client.users.fetch(vote.discord_user_id);
        await user.send({ embeds: [conflictEmbed] });
      } catch (err) {
        logger.error(`Failed to send conflict DM to ${vote.discord_user_id}:`, err);
      }
    }
  }
}
