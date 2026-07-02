import { getDbInstance } from './database-init';
import { logger } from './logger';
import { createMatchVoiceChannels, trackVoiceChannels } from './voice-channel-manager';
import { getMatchTeams, setTeamVoiceChannel } from './match-setup';

type VoiceAnnouncementType = 'welcome' | 'nextround' | 'finish';

/**
 * Service for handling voice channel operations and announcements
 */
export class VoiceChannelService {
  /**
   * Creates voice channels for a match and updates the match record
   */
  public static async setupMatchVoiceChannels(matchId: string): Promise<boolean> {
    try {
      const voiceChannelResult = await createMatchVoiceChannels(matchId);

      if (!voiceChannelResult.success || !voiceChannelResult.blueChannelId) {
        logger.debug(`ℹ️ Voice channels not created for match ${matchId}: ${voiceChannelResult.message || 'Unknown reason'}`);
        return false;
      }

      const db = await getDbInstance();
      const channelIds = voiceChannelResult.channelIds
        ?? [voiceChannelResult.blueChannelId, voiceChannelResult.redChannelId].filter((id): id is string => Boolean(id));

      // Update the match with the created voice channel IDs (legacy, first two only)
      await db.run(`
        UPDATE matches
        SET blue_team_voice_channel = ?, red_team_voice_channel = ?
        WHERE id = ?
      `, [channelIds[0] ?? null, channelIds[1] ?? null, matchId]);

      // N-team aware: assign each match_teams row (in team_order) its own real
      // channel ID directly, instead of relying on a separate post-hoc sync step.
      const teams = await getMatchTeams(matchId);
      const activeTeams = teams.filter(t => !t.is_reserve);
      for (let i = 0; i < activeTeams.length && i < channelIds.length; i++) {
        await setTeamVoiceChannel(activeTeams[i].id, channelIds[i]);
      }

      // Track the channels for cleanup later
      await trackVoiceChannels(matchId, channelIds[0], channelIds[1], channelIds.slice(2));

      logger.debug(`🎤 ${channelIds.length} voice channel(s) created for match ${matchId}: ${channelIds.join(', ')}`);
      return true;

    } catch (error) {
      logger.error('❌ Error setting up voice channels:', error);
      return false;
    }
  }

  /**
   * Queues a voice announcement for a match
   */
  public static async queueVoiceAnnouncement(
    matchId: string,
    announcementType: VoiceAnnouncementType
  ): Promise<boolean> {
    try {
      const db = await getDbInstance();

      // Get match voice channel assignments
      const match = await db.get<{
        blue_team_voice_channel?: string;
        red_team_voice_channel?: string;
      }>(`
        SELECT blue_team_voice_channel, red_team_voice_channel
        FROM matches WHERE id = ?
      `, [matchId]);

      if (!match) {
        logger.error('❌ Match not found for voice announcement:', matchId);
        return false;
      }

      // If no match-specific voice channels, try to get global voice channels
      let blueChannelId = match.blue_team_voice_channel;
      let redChannelId = match.red_team_voice_channel;

      if (!blueChannelId && !redChannelId) {
        // Try to get global voice channels from discord_channels table
        const blueChannel = await db.get<{ discord_channel_id: string }>(`
          SELECT discord_channel_id FROM discord_channels
          WHERE type = 2 AND (
            LOWER(name) LIKE '%blue%' OR
            LOWER(channel_name) LIKE '%blue%' OR
            LOWER(name) LIKE '%team%1%' OR
            LOWER(channel_name) LIKE '%team%1%'
          )
          LIMIT 1
        `);

        const redChannel = await db.get<{ discord_channel_id: string }>(`
          SELECT discord_channel_id FROM discord_channels
          WHERE type = 2 AND (
            LOWER(name) LIKE '%red%' OR
            LOWER(channel_name) LIKE '%red%' OR
            LOWER(name) LIKE '%team%2%' OR
            LOWER(channel_name) LIKE '%team%2%'
          )
          LIMIT 1
        `);

        blueChannelId = blueChannel?.discord_channel_id;
        redChannelId = redChannel?.discord_channel_id;
      }

      // Skip if still no voice channels are configured
      if (!blueChannelId && !redChannelId) {
        logger.debug(`📢 No voice channels configured for match ${matchId}`);
        return true; // Not an error, just nothing to do
      }

      // Determine which team should go first (alternating)
      const lastAlternation = await db.get<{ last_first_team: string }>(`
        SELECT last_first_team FROM match_voice_alternation WHERE match_id = ?
      `, [matchId]);

      const firstTeam = !lastAlternation || lastAlternation.last_first_team === 'red' ? 'blue' : 'red';

      // Generate unique announcement ID
      const announcementId = `voice_announcement_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      // Add to voice announcement queue
      await db.run(`
        INSERT INTO discord_voice_announcement_queue (
          id, match_id, announcement_type, blue_team_voice_channel, red_team_voice_channel,
          first_team, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `, [
        announcementId,
        matchId,
        announcementType,
        blueChannelId,
        redChannelId,
        firstTeam
      ]);

      logger.debug(`🔊 Voice announcement queued for match ${matchId}: ${announcementType}, starting with ${firstTeam} team`);
      return true;

    } catch (error) {
      logger.error('❌ Error queuing voice announcement:', error);
      return false;
    }
  }

}
