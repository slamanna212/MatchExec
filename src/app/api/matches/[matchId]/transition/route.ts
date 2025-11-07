import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import type { MatchDbRow } from '@/shared/types';
import { MATCH_FLOW_STEPS } from '@/shared/types';
import { logger } from '@/lib/logger';

// Queue a Discord announcement request that the Discord bot will process
async function queueDiscordAnnouncement(matchId: string): Promise<boolean> {
  try {
    const db = await getDbInstance();
    
    // Check if already exists first to prevent duplicates
    const existing = await db.get(`
      SELECT id FROM discord_announcement_queue 
      WHERE match_id = ? AND announcement_type = 'standard' AND status IN ('pending', 'posted')
    `, [matchId]);
    
    if (existing) {
      logger.debug('📢 Discord announcement already exists for match:', matchId);
      return true;
    }
    
    // Generate unique ID for the announcement queue entry
    const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add to announcement queue with explicit 'standard' type
    await db.run(`
      INSERT INTO discord_announcement_queue (id, match_id, announcement_type, status)
      VALUES (?, ?, 'standard', 'pending')
    `, [announcementId, matchId]);
    
    logger.debug('📢 Discord announcement queued for match:', matchId);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord announcement:', error);
    return false;
  }
}

// Queue a Discord status update request that the Discord bot will process
async function queueDiscordStatusUpdate(matchId: string, newStatus: string): Promise<boolean> {
  try {
    const db = await getDbInstance();
    
    // Generate unique ID for the queue entry
    const updateId = `discord_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add to status update queue
    await db.run(`
      INSERT INTO discord_status_update_queue (id, match_id, new_status, status)
      VALUES (?, ?, ?, 'pending')
    `, [updateId, matchId, newStatus]);
    
    logger.debug('🔄 Discord status update queued for match:', matchId, '-> status:', newStatus);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord status update:', error);
    return false;
  }
}

// Queue a Discord match start announcement request that the Discord bot will process
async function queueDiscordMatchStart(matchId: string): Promise<boolean> {
  try {
    const db = await getDbInstance();
    
    // Generate unique ID for the announcement queue entry
    const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add to main announcement queue with match_start type
    await db.run(`
      INSERT OR IGNORE INTO discord_announcement_queue (id, match_id, announcement_type, status)
      VALUES (?, ?, 'match_start', 'pending')
    `, [announcementId, matchId]);
    
    logger.debug('🚀 Discord match start announcement queued for match:', matchId);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord match start announcement:', error);
    return false;
  }
}

// Queue a Discord map code PM request that the Discord bot will process
async function queueMapCodePMs(matchId: string, mapName: string, mapCode: string): Promise<boolean> {
  try {
    const db = await getDbInstance();
    
    // Generate unique ID for the queue entry
    const queueId = `map_codes_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add to map code PM queue
    await db.run(`
      INSERT INTO discord_map_code_queue (id, match_id, map_name, map_code, status)
      VALUES (?, ?, ?, ?, 'pending')
    `, [queueId, matchId, mapName, mapCode]);
    
    logger.debug('📱 Map code PMs queued for match:', matchId, '-> map:', mapName);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing map code PMs:', error);
    return false;
  }
}

// Queue a Discord voice announcement request that the Discord bot will process
async function queueVoiceAnnouncement(
  matchId: string, 
  announcementType: 'welcome' | 'nextround' | 'finish'
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
      logger.debug('📢 No voice channels configured for match:', matchId);
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
      match.blue_team_voice_channel,
      match.red_team_voice_channel,
      firstTeam
    ]);
    
    logger.debug(`🔊 Voice announcement queued for match ${matchId}: ${announcementType}, starting with ${firstTeam} team`);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing voice announcement:', error);
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const { newStatus } = await request.json();

    if (!newStatus || !MATCH_FLOW_STEPS[newStatus as keyof typeof MATCH_FLOW_STEPS]) {
      return NextResponse.json(
        { error: 'Invalid status provided' },
        { status: 400 }
      );
    }

    const db = await getDbInstance();
    
    // Get current match data
    const currentMatch = await db.get<MatchDbRow>(` 
      SELECT * FROM matches WHERE id = ?
    `, [matchId]);

    if (!currentMatch) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }

    // Validate status transition (basic flow validation)
    const currentStep = MATCH_FLOW_STEPS[currentMatch.status as keyof typeof MATCH_FLOW_STEPS];
    const newStep = MATCH_FLOW_STEPS[newStatus as keyof typeof MATCH_FLOW_STEPS];

    if (newStep.progress < currentStep.progress && newStatus !== 'cancelled') {
      return NextResponse.json(
        { error: 'Cannot move backwards in match flow' },
        { status: 400 }
      );
    }

    // Update match status
    await db.run(`
      UPDATE matches 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newStatus, matchId]);

    logger.debug(`🔄 Match ${matchId} transitioned from ${currentMatch.status} to ${newStatus}`);

    // Trigger Discord announcement when entering "gather" stage
    if (newStatus === 'gather') {
      try {
        // Check if an announcement is already queued to prevent duplicates
        const existingAnnouncement = await db.get(`
          SELECT id FROM discord_announcement_queue 
          WHERE match_id = ? AND (announcement_type IS NULL OR announcement_type = 'standard') AND status IN ('pending', 'posted')
        `, [matchId]);
        
        if (!existingAnnouncement) {
          const discordSuccess = await queueDiscordAnnouncement(matchId);
          
          if (discordSuccess) {
            logger.debug(`📢 Discord announcement queued for match entering gather stage: ${matchId}`);
          } else {
            logger.warning(`⚠️ Failed to queue Discord announcement for match: ${matchId}`);
          }
        } else {
          logger.debug(`📢 Discord announcement already queued for match: ${matchId}, skipping duplicate`);
        }
      } catch (discordError) {
        logger.error('❌ Error queuing Discord announcement:', discordError);
        // Don't fail the API request if Discord queueing fails
      }
    }

    // Trigger Discord status update when entering "assign" stage (close signups)
    if (newStatus === 'assign') {
      try {
        const discordUpdateSuccess = await queueDiscordStatusUpdate(matchId, newStatus);
        
        if (discordUpdateSuccess) {
          logger.debug(`🔄 Discord status update queued for match entering assign stage: ${matchId}`);
        } else {
          logger.warning(`⚠️ Failed to queue Discord status update for match: ${matchId}`);
        }
      } catch (discordError) {
        logger.error('❌ Error queuing Discord status update:', discordError);
        // Don't fail the API request if Discord queueing fails
      }
    }

    // Trigger Discord match start notification when entering "battle" stage
    if (newStatus === 'battle') {
      // First, create voice channels for the match
      try {
        const { createMatchVoiceChannels, trackVoiceChannels } = await import('../../../../../lib/voice-channel-manager');
        const voiceChannelResult = await createMatchVoiceChannels(matchId);

        if (voiceChannelResult.success && voiceChannelResult.blueChannelId && voiceChannelResult.redChannelId) {
          // Update the match with the created voice channel IDs
          await db.run(`
            UPDATE matches
            SET blue_team_voice_channel = ?, red_team_voice_channel = ?
            WHERE id = ?
          `, [voiceChannelResult.blueChannelId, voiceChannelResult.redChannelId, matchId]);

          // Track the channels for cleanup later
          await trackVoiceChannels(matchId, voiceChannelResult.blueChannelId, voiceChannelResult.redChannelId);

          logger.debug(`🎤 Voice channels created for match ${matchId}: Blue=${voiceChannelResult.blueChannelId}, Red=${voiceChannelResult.redChannelId}`);
        } else {
          logger.debug(`ℹ️ Voice channels not created for match ${matchId}: ${voiceChannelResult.message || 'Unknown reason'}`);
        }
      } catch (voiceError) {
        logger.error('❌ Error creating voice channels for match:', voiceError);
        // Don't fail the API request if voice channel creation fails
      }

      // Queue the Discord match start announcement
      try {
        const discordMatchStartSuccess = await queueDiscordMatchStart(matchId);

        if (discordMatchStartSuccess) {
          logger.debug(`🚀 Discord match start notification queued for match entering battle stage: ${matchId}`);
        } else {
          logger.warning(`⚠️ Failed to queue Discord match start notification for match: ${matchId}`);
        }
      } catch (discordError) {
        logger.error('❌ Error queuing Discord match start notification:', discordError);
        // Don't fail the API request if Discord queueing fails
      }

      // Queue welcome voice announcements when match starts
      try {
        const voiceAnnouncementSuccess = await queueVoiceAnnouncement(matchId, 'welcome');
        
        if (voiceAnnouncementSuccess) {
          logger.debug(`🔊 Welcome voice announcement queued for match entering battle stage: ${matchId}`);
        } else {
          logger.warning(`⚠️ Failed to queue welcome voice announcement for match: ${matchId}`);
        }
      } catch (voiceError) {
        logger.error('❌ Error queuing welcome voice announcement:', voiceError);
        // Don't fail the API request if voice queueing fails
      }

      // Initialize match games for all maps
      try {
        const { initializeMatchGames } = await import('../../../../../lib/scoring-functions');
        await initializeMatchGames(matchId);
        logger.debug(`🎮 Match games initialized for all maps in match: ${matchId}`);
      } catch (initError) {
        logger.error('❌ Error initializing match games:', initError);
        // Don't fail the API request if match games initialization fails
      }

      // Send map codes for the first map
      try {
        // Get match data to check if map codes are supported
        const matchWithGame = await db.get<{
          game_id: string;
          maps?: string;
          map_codes?: string;
          map_codes_supported?: number;
        }>(`
          SELECT m.maps, m.map_codes, g.map_codes_supported
          FROM matches m
          LEFT JOIN games g ON m.game_id = g.id
          WHERE m.id = ?
        `, [matchId]);

        if (matchWithGame?.map_codes_supported) {
          const maps = matchWithGame.maps ? JSON.parse(matchWithGame.maps) : [];
          const mapCodes = matchWithGame.map_codes ? JSON.parse(matchWithGame.map_codes) : {};
          
          if (maps.length > 0) {
            const firstMapId = maps[0];
            const cleanMapId = firstMapId.replace(/-\d+$/, '');
            
            // Get the actual map name from database instead of using map ID
            let firstMapName = firstMapId; // Fallback to ID
            try {
              const mapNameData = await db.get<{ name: string }>(`
                SELECT name FROM game_maps 
                WHERE game_id = ? AND (id = ? OR LOWER(name) LIKE LOWER(?))
                LIMIT 1
              `, [matchWithGame.game_id, cleanMapId, `%${cleanMapId}%`]);
              
              if (mapNameData) {
                firstMapName = mapNameData.name;
              }
            } catch (error) {
              logger.error('Error fetching map name for first map PM queue:', error);
              // Keep original firstMapId as fallback
            }
            
            // Try exact match first
            let firstMapCode = mapCodes[cleanMapId];
            
            // If exact match fails, try case-insensitive and normalized lookup
            if (!firstMapCode) {
              const normalizedCleanId = cleanMapId.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const mapCodeKey = Object.keys(mapCodes).find(key => 
                key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalizedCleanId
              );
              if (mapCodeKey) {
                firstMapCode = mapCodes[mapCodeKey];
              }
            }
            
            if (firstMapCode) {
              const mapCodeSuccess = await queueMapCodePMs(matchId, firstMapName, firstMapCode);
              
              if (mapCodeSuccess) {
                logger.debug(`📱 Map code PMs queued for first map "${firstMapName}" in match: ${matchId}`);
              } else {
                logger.warning(`⚠️ Failed to queue map code PMs for first map in match: ${matchId}`);
              }
            }
          }
        }
      } catch (mapCodeError) {
        logger.error('❌ Error queuing map code PMs for first map:', mapCodeError);
        // Don't fail the API request if map code queueing fails
      }
    }

    // Get updated match data
    const updatedMatch = await db.get<MatchDbRow>(` 
      SELECT m.*, g.name as game_name, g.icon_url as game_icon, g.color as game_color
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      WHERE m.id = ?
    `, [matchId]);

    // Parse maps for the returned match
    const parsedMatch = {
      ...(updatedMatch || {}),
      maps: updatedMatch?.maps ? (typeof updatedMatch.maps === 'string' ? JSON.parse(updatedMatch.maps) : updatedMatch.maps) : []
    };

    return NextResponse.json(parsedMatch);

  } catch (error) {
    logger.error('Error transitioning match status:', error);
    return NextResponse.json(
      { error: 'Failed to transition match status' },
      { status: 500 }
    );
  }
}