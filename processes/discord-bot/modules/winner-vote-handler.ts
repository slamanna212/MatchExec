import type { Client, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import crypto from 'crypto';
import type { Database } from '../../../lib/database/connection';
import { logger } from '../../../src/lib/logger/server';

interface CommanderRecord {
  id: string;
  discord_user_id: string;
  team_assignment: string;
}

interface VoteRecord {
  id: string;
  match_id: string;
  match_game_id: string;
  discord_user_id: string;
  discord_message_id: string;
  participant_id: string | null;
  team_side: 'blue' | 'red' | null;
  voted_for: 'blue' | 'red' | null;
}

export class WinnerVoteHandler {
  constructor(
    private client: Client,
    private db: Database
  ) {}

  async sendWinnerVotePrompts(matchId: string, matchGameId: string, mapName: string): Promise<boolean> {
    try {
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

          await this.db.run(
            `INSERT INTO discord_winner_vote_messages
               (id, match_id, match_game_id, discord_user_id, discord_message_id, participant_id, team_side)
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
      const record = await this.db.get<VoteRecord>(
        `SELECT * FROM discord_winner_vote_messages
         WHERE discord_message_id = ? AND discord_user_id = ?`,
        [messageId, discordUserId]
      );

      if (!record) return;
      // Ignore if already voted
      if (record.voted_for !== null) return;

      const votedFor: 'blue' | 'red' = emoji === '🔵' ? 'blue' : 'red';

      await this.db.run(
        `UPDATE discord_winner_vote_messages SET voted_for = ? WHERE id = ?`,
        [votedFor, record.id]
      );

      logger.debug(`🗳️ Commander ${discordUserId} voted ${votedFor} for game ${record.match_game_id}`);

      await this.evaluateVotes(record.match_id, record.match_game_id);
    } catch (error) {
      logger.error('Error handling winner vote reaction:', error);
    }
  }

  private async evaluateVotes(matchId: string, matchGameId: string): Promise<void> {
    const allVotes = await this.db.all<VoteRecord>(
      `SELECT * FROM discord_winner_vote_messages WHERE match_game_id = ?`,
      [matchGameId]
    );

    if (!allVotes || allVotes.length === 0) return;

    const voted = allVotes.filter(v => v.voted_for !== null);
    const totalCommanders = allVotes.length;

    if (voted.length === 0) return;

    const uniqueVotes = new Set(voted.map(v => v.voted_for));

    if (voted.length === totalCommanders) {
      // All commanders have voted
      if (uniqueVotes.size === 1) {
        // Consensus — submit the winner via full scoring flow
        const winner = voted[0].voted_for as 'blue' | 'red';
        await this.submitWinner(matchId, matchGameId, winner);
      } else {
        // Conflict — clear any provisional winner and notify commanders
        await this.db.run(
          `UPDATE match_games SET winner_id = NULL WHERE id = ? AND status != 'completed'`,
          [matchGameId]
        );
        logger.warning(`⚠️ Winner vote conflict for game ${matchGameId} — commanders disagree`);
        await this.notifyConflict(allVotes);
      }
    } else {
      // Partial votes — set provisional winner (direct update, no scoring flow)
      if (uniqueVotes.size === 1) {
        const provisionalWinner = voted[0].voted_for === 'blue' ? 'team1' : 'team2';
        await this.db.run(
          `UPDATE match_games SET winner_id = ? WHERE id = ? AND status != 'completed'`,
          [provisionalWinner, matchGameId]
        );
        logger.debug(`🗳️ Provisional winner set to ${provisionalWinner} for game ${matchGameId}`);
      }
      // If partial votes already conflict with each other, leave winner_id as-is until all vote
    }
  }

  private async submitWinner(matchId: string, matchGameId: string, winner: 'blue' | 'red'): Promise<void> {
    try {
      const { saveMatchResult } = await import('../../../src/lib/scoring-functions');
      await saveMatchResult(matchGameId, {
        matchId,
        gameId: matchGameId,
        winner: winner === 'blue' ? 'team1' : 'team2',
        completedAt: new Date(),
      });
      logger.info(`✅ Winner vote consensus: ${winner} wins game ${matchGameId}`);
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
