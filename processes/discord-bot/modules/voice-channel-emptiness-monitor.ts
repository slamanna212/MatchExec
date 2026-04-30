import type { Client } from 'discord.js';
import type { Database } from '../../../lib/database/connection';
import { logger } from '../../../src/lib/logger/server';

interface TrackedVoiceChannel {
  match_id: string;
  channel_id: string;
}

export class VoiceChannelEmptinessMonitor {
  private emptyCheckCounts = new Map<string, number>();

  constructor(
    private client: Client,
    private db: Database,
    private requiredEmptyChecks = 2
  ) {}

  async runCheck(): Promise<void> {
    if (!this.client.isReady()) return;

    try {
      const trackedChannels = await this.db.all<TrackedVoiceChannel>(`
        SELECT avc.match_id, avc.channel_id
        FROM auto_voice_channels avc
        INNER JOIN matches m ON m.id = avc.match_id
        WHERE m.status IN ('complete', 'cancelled')
      `);

      if (trackedChannels.length === 0) {
        this.emptyCheckCounts.clear();
        return;
      }

      const channelsByMatch = new Map<string, TrackedVoiceChannel[]>();
      for (const channel of trackedChannels) {
        if (!channelsByMatch.has(channel.match_id)) {
          channelsByMatch.set(channel.match_id, []);
        }
        channelsByMatch.get(channel.match_id)!.push(channel);
      }

      const activeMatches = new Set(channelsByMatch.keys());
      for (const trackedMatchId of this.emptyCheckCounts.keys()) {
        if (!activeMatches.has(trackedMatchId)) {
          this.emptyCheckCounts.delete(trackedMatchId);
        }
      }

      for (const [matchId, matchChannels] of channelsByMatch.entries()) {
        const allChannelsEmpty = await this.areAllChannelsEmpty(matchChannels);

        if (!allChannelsEmpty) {
          this.emptyCheckCounts.set(matchId, 0);
          continue;
        }

        const nextCount = (this.emptyCheckCounts.get(matchId) ?? 0) + 1;

        if (nextCount < this.requiredEmptyChecks) {
          this.emptyCheckCounts.set(matchId, nextCount);
          continue;
        }

        await this.deleteMatchChannels(matchId, matchChannels);
        this.emptyCheckCounts.delete(matchId);
      }
    } catch (error) {
      logger.error('❌ Error running voice channel emptiness monitor:', error);
    }
  }

  private async areAllChannelsEmpty(channels: TrackedVoiceChannel[]): Promise<boolean> {
    for (const channel of channels) {
      const isOccupied = await this.isChannelOccupied(channel.channel_id);
      if (isOccupied) {
        return false;
      }
    }

    return true;
  }

  private async isChannelOccupied(channelId: string): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel) {
        return false;
      }

      const channelWithMembers = channel as { members?: { size: number } };
      return (channelWithMembers.members?.size ?? 0) > 0;
    } catch (error) {
      logger.warning(`⚠️ Failed to fetch channel ${channelId} during emptiness check:`, error);
      return false;
    }
  }

  private async deleteMatchChannels(matchId: string, channels: TrackedVoiceChannel[]): Promise<void> {
    for (const channelInfo of channels) {
      try {
        const channel = await this.client.channels.fetch(channelInfo.channel_id);
        if (channel) {
          await channel.delete();
        }
      } catch (error) {
        logger.warning(`⚠️ Failed to delete channel ${channelInfo.channel_id}:`, error);
      }
    }

    await this.db.run('DELETE FROM auto_voice_channels WHERE match_id = ?', [matchId]);
    logger.info(`✅ Deleted auto-created voice channels for match ${matchId} after ${this.requiredEmptyChecks} empty checks`);
  }
}
