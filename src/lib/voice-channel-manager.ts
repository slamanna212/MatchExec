import { getDbInstance } from './database-init';
import { logger } from './logger';
import type { Database } from '../../lib/database/connection';

interface VoiceChannelCreationResult {
  success: boolean;
  blueChannelId?: string;
  redChannelId?: string;
  message?: string;
}

interface ChannelNames {
  blueChannelName: string;
  redChannelName?: string;
}

interface MatchData {
  id: string;
  name: string;
  tournament_id?: string;
  game_id: string;
  mode_id: string;
}

/**
 * Determines channel names based on match type and team structure
 */
async function determineChannelNames(
  db: Database,
  match: MatchData,
  isSingleTeam: boolean
): Promise<ChannelNames> {
  if (isSingleTeam) {
    return determineSingleTeamChannelName(db, match);
  }
  return determineDualTeamChannelNames(db, match);
}

/**
 * Determines channel name for single-team matches
 */
async function determineSingleTeamChannelName(
  db: Database,
  match: MatchData
): Promise<ChannelNames> {
  if (!match.tournament_id) {
    return { blueChannelName: match.name };
  }

  // Try to get team name from tournament data
  const tournamentMatch = await db.get<{ team1_id: string }>(`
    SELECT team1_id FROM tournament_matches WHERE match_id = ?
  `, [match.id]);

  if (!tournamentMatch) {
    return { blueChannelName: match.name };
  }

  const team = await db.get<{ team_name: string }>(`
    SELECT team_name FROM tournament_teams WHERE id = ?
  `, [tournamentMatch.team1_id]);

  return { blueChannelName: team?.team_name || match.name };
}

/**
 * Determines channel names for dual-team matches
 */
async function determineDualTeamChannelNames(
  db: Database,
  match: MatchData
): Promise<ChannelNames> {
  if (!match.tournament_id) {
    return {
      blueChannelName: `${match.name} - Blue Team`,
      redChannelName: `${match.name} - Red Team`
    };
  }

  // Get team names from tournament data
  const tournamentMatch = await db.get<{
    team1_id: string;
    team2_id: string;
  }>(`SELECT team1_id, team2_id FROM tournament_matches WHERE match_id = ?`, [match.id]);

  if (!tournamentMatch) {
    return {
      blueChannelName: `${match.name} - Blue Team`,
      redChannelName: `${match.name} - Red Team`
    };
  }

  const [team1, team2] = await Promise.all([
    db.get<{ team_name: string }>(`SELECT team_name FROM tournament_teams WHERE id = ?`, [tournamentMatch.team1_id]),
    db.get<{ team_name: string }>(`SELECT team_name FROM tournament_teams WHERE id = ?`, [tournamentMatch.team2_id])
  ]);

  const vsName = `${team1?.team_name || 'Team 1'} vs ${team2?.team_name || 'Team 2'}`;
  return {
    blueChannelName: `${vsName} - Blue Team`,
    redChannelName: `${vsName} - Red Team`
  };
}

/**
 * Waits for voice channel creation request to complete
 */
async function waitForVoiceChannelCreation(
  db: Database,
  requestId: string,
  matchId: string
): Promise<VoiceChannelCreationResult> {
  const maxWaitTime = 30000; // 30 seconds
  const pollInterval = 500; // 500ms
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const request = await db.get<{ status: string; result?: string }>(
      'SELECT status, result FROM discord_bot_requests WHERE id = ?',
      [requestId]
    );

    if (request?.status === 'completed') {
      if (request.result) {
        const result = JSON.parse(request.result);
        logger.debug(`Voice channels created successfully for match ${matchId}`);
        return result;
      }
    }

    if (request?.status === 'failed') {
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
    const match = await db.get<MatchData>(
      'SELECT id, name, tournament_id, game_id, mode_id FROM matches WHERE id = ?',
      [matchId]
    );

    if (!match) {
      logger.error('Match not found for voice channel creation:', matchId);
      return { success: false, message: 'Match not found' };
    }

    // Get game mode to determine team structure
    const gameMode = await db.get<{ max_teams: number }>(
      'SELECT max_teams FROM game_modes WHERE id = ? AND game_id = ?',
      [match.mode_id, match.game_id]
    );

    const isSingleTeam = gameMode?.max_teams === 1;
    logger.debug(`Match ${matchId} is ${isSingleTeam ? 'single-team' : 'dual-team'} mode (max_teams=${gameMode?.max_teams})`);

    // Determine channel names using helper function
    const { blueChannelName, redChannelName } = await determineChannelNames(db, match, isSingleTeam);

    // Queue a Discord bot request to create the channels
    const requestId = `voice_create_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    await db.run(`
      INSERT INTO discord_bot_requests (id, type, data, status)
      VALUES (?, 'voice_channel_create', ?, 'pending')
    `, [
      requestId,
      JSON.stringify({
        matchId,
        categoryId: settings.voice_channel_category_id,
        blueChannelName,
        redChannelName,
        isSingleTeam
      })
    ]);

    logger.debug(`Voice channel creation request queued: ${requestId} (${isSingleTeam ? 'single' : 'dual'} team)`);

    // Wait for the bot to process the request
    return await waitForVoiceChannelCreation(db, requestId, matchId);

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
      const requestId = `voice_delete_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

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
      const blueId = `auto_voice_${Date.now()}_blue_${Math.random().toString(36).substring(2, 11)}`;
      const redId = `auto_voice_${Date.now()}_red_${Math.random().toString(36).substring(2, 11)}`;

      await db.run(`
        INSERT INTO auto_voice_channels (id, match_id, channel_id, team_name)
        VALUES (?, ?, ?, 'blue'), (?, ?, ?, 'red')
      `, [blueId, matchId, blueChannelId, redId, matchId, redChannelId]);

      logger.debug(`Voice channels tracked for match ${matchId} (dual-team)`);
    } else {
      // Single-team match: Track only one channel
      const channelId = `auto_voice_${Date.now()}_all_${Math.random().toString(36).substring(2, 11)}`;

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
