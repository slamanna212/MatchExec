import { getDbInstance } from './database-init';
import { logger } from './logger';

interface VoiceChannelCreationResult {
  success: boolean;
  blueChannelId?: string;
  redChannelId?: string;
  message?: string;
}

/**
 * Create voice channels for a match
 * This queues a request to the Discord bot to create the channels
 * and waits for the result with a timeout
 */
export async function createMatchVoiceChannels(matchId: string): Promise<VoiceChannelCreationResult> {
  try {
    const db = await getDbInstance();

    // Check if voice channel category is configured
    const settings = await db.get<{
      voice_channel_category_id?: string;
    }>('SELECT voice_channel_category_id FROM discord_settings LIMIT 1');

    if (!settings?.voice_channel_category_id) {
      logger.debug('Voice channel category not configured, skipping auto-creation');
      return { success: true, message: 'Voice channel category not configured' };
    }

    // Get match data including game mode
    const match = await db.get<{
      id: string;
      name: string;
      tournament_id?: string;
      game_mode_id: string;
    }>('SELECT id, name, tournament_id, game_mode_id FROM matches WHERE id = ?', [matchId]);

    if (!match) {
      logger.error('Match not found for voice channel creation:', matchId);
      return { success: false, message: 'Match not found' };
    }

    // Get game mode to determine team structure
    const gameMode = await db.get<{
      max_teams: number;
    }>('SELECT max_teams FROM game_modes WHERE id = ?', [match.game_mode_id]);

    const isSingleTeam = gameMode?.max_teams === 1;
    logger.debug(`Match ${matchId} is ${isSingleTeam ? 'single-team' : 'dual-team'} mode (max_teams=${gameMode?.max_teams})`);


    // Determine channel naming based on match type and team structure
    let blueChannelName: string;
    let redChannelName: string | undefined;

    if (isSingleTeam) {
      // Single-team match: Create one channel for all participants
      if (match.tournament_id) {
        // Tournament match: Try to get team name
        const tournamentMatch = await db.get<{
          participant1_id: string;
        }>(`
          SELECT participant1_id
          FROM tournament_matches
          WHERE match_id = ?
        `, [matchId]);

        if (tournamentMatch) {
          const team = await db.get<{ team_name: string }>(`
            SELECT team_name FROM tournament_participants WHERE id = ?
          `, [tournamentMatch.participant1_id]);

          blueChannelName = team?.team_name || match.name;
        } else {
          blueChannelName = match.name;
        }
      } else {
        // Standalone match: Just use match name
        blueChannelName = match.name;
      }
      // No second channel for single-team matches
      redChannelName = undefined;
    } else {
      // Dual-team match: Create two channels (blue and red)
      if (match.tournament_id) {
        // Tournament match: Get team names from tournament_matches
        const tournamentMatch = await db.get<{
          participant1_id: string;
          participant2_id: string;
        }>(`
          SELECT participant1_id, participant2_id
          FROM tournament_matches
          WHERE match_id = ?
        `, [matchId]);

        if (tournamentMatch) {
          const team1 = await db.get<{ team_name: string }>(`
            SELECT team_name FROM tournament_participants WHERE id = ?
          `, [tournamentMatch.participant1_id]);

          const team2 = await db.get<{ team_name: string }>(`
            SELECT team_name FROM tournament_participants WHERE id = ?
          `, [tournamentMatch.participant2_id]);

          const team1Name = team1?.team_name || 'Team 1';
          const team2Name = team2?.team_name || 'Team 2';
          const vsName = `${team1Name} vs ${team2Name}`;
          blueChannelName = vsName;
          redChannelName = vsName;
        } else {
          // Fallback if tournament match data not available
          blueChannelName = `${match.name} - Blue Team`;
          redChannelName = `${match.name} - Red Team`;
        }
      } else {
        // Standalone match: Use match title + team colors
        blueChannelName = `${match.name} - Blue Team`;
        redChannelName = `${match.name} - Red Team`;
      }
    }

    // Queue a Discord bot request to create the channels
    const requestId = `voice_create_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await db.run(`
      INSERT INTO discord_bot_requests (id, type, data, status)
      VALUES (?, 'voice_channel_create', ?, 'pending')
    `, [
      requestId,
      JSON.stringify({
        matchId,
        categoryId: settings.voice_channel_category_id,
        blueChannelName,
        redChannelName, // May be undefined for single-team matches
        isSingleTeam
      })
    ]);

    logger.debug(`Voice channel creation request queued: ${requestId} (${isSingleTeam ? 'single' : 'dual'} team)`);

    // Wait for the bot to process the request (poll with timeout)
    const maxWaitTime = 30000; // 30 seconds
    const pollInterval = 500; // 500ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const request = await db.get<{
        status: string;
        result?: string;
      }>('SELECT status, result FROM discord_bot_requests WHERE id = ?', [requestId]);

      if (request?.status === 'completed') {
        if (request.result) {
          const result = JSON.parse(request.result);
          logger.debug(`Voice channels created successfully for match ${matchId}`);
          return result;
        }
      } else if (request?.status === 'failed') {
        const result = request.result ? JSON.parse(request.result) : {};
        logger.error(`Voice channel creation failed: ${result.message || 'Unknown error'}`);
        return { success: false, message: result.message || 'Failed to create voice channels' };
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout
    logger.error(`Voice channel creation request timed out for match ${matchId}`);
    return { success: false, message: 'Voice channel creation timed out' };

  } catch (error) {
    logger.error('Error creating voice channels:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Delete auto-created voice channels for a match
 * This is called by the scheduler after the cleanup delay has elapsed
 */
export async function deleteMatchVoiceChannels(matchId: string): Promise<boolean> {
  try {
    const db = await getDbInstance();

    // Get auto-created voice channels for this match
    const channels = await db.all<{
      id: string;
      channel_id: string;
      team_name: string;
    }>('SELECT id, channel_id, team_name FROM auto_voice_channels WHERE match_id = ?', [matchId]);

    if (channels.length === 0) {
      logger.debug(`No auto-created voice channels to delete for match ${matchId}`);
      return true;
    }

    logger.debug(`Deleting ${channels.length} auto-created voice channels for match ${matchId}`);

    // Queue deletion requests for each channel
    for (const channel of channels) {
      const requestId = `voice_delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await db.run(`
        INSERT INTO discord_bot_requests (id, type, data, status)
        VALUES (?, 'voice_channel_delete', ?, 'pending')
      `, [
        requestId,
        JSON.stringify({
          channelId: channel.channel_id,
          matchId
        })
      ]);

      logger.debug(`Voice channel deletion request queued: ${channel.channel_id}`);
    }

    // Remove from tracking table
    await db.run('DELETE FROM auto_voice_channels WHERE match_id = ?', [matchId]);

    logger.debug(`Auto-created voice channels deleted for match ${matchId}`);
    return true;

  } catch (error) {
    logger.error('Error deleting voice channels:', error);
    return false;
  }
}

/**
 * Track auto-created voice channels
 * Called after successful creation to enable cleanup later
 */
export async function trackVoiceChannels(
  matchId: string,
  blueChannelId: string,
  redChannelId?: string
): Promise<void> {
  try {
    const db = await getDbInstance();

    if (redChannelId) {
      // Dual-team match: Track both channels
      const blueId = `auto_voice_${Date.now()}_blue_${Math.random().toString(36).substr(2, 9)}`;
      const redId = `auto_voice_${Date.now()}_red_${Math.random().toString(36).substr(2, 9)}`;

      await db.run(`
        INSERT INTO auto_voice_channels (id, match_id, channel_id, team_name)
        VALUES (?, ?, ?, 'blue'), (?, ?, ?, 'red')
      `, [blueId, matchId, blueChannelId, redId, matchId, redChannelId]);

      logger.debug(`Voice channels tracked for match ${matchId} (dual-team)`);
    } else {
      // Single-team match: Track only one channel
      const channelId = `auto_voice_${Date.now()}_all_${Math.random().toString(36).substr(2, 9)}`;

      await db.run(`
        INSERT INTO auto_voice_channels (id, match_id, channel_id, team_name)
        VALUES (?, ?, ?, 'all')
      `, [channelId, matchId, blueChannelId]);

      logger.debug(`Voice channel tracked for match ${matchId} (single-team)`);
    }
  } catch (error) {
    logger.error('Error tracking voice channels:', error);
  }
}
