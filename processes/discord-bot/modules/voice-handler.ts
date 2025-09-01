import path from 'path';
import fs from 'fs';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  entersState
} from '@discordjs/voice';
import { ChannelType, Client, VoiceBasedChannel } from 'discord.js';
import { Database } from '../../../lib/database/connection';
import { DiscordSettings } from '../../../shared/types';

export class VoiceHandler {
  private voiceConnections = new Map<string, unknown>(); // channelId -> connection
  private activeAudioPlayers = new Map<string, unknown>(); // channelId -> player
  private playbackStatus = new Map<string, boolean>(); // channelId -> isPlaying

  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null
  ) {}

  async testVoiceLineForUser(userId: string, _voiceId?: string): Promise<{ success: boolean; message: string; channelId?: string }> {
    try {
      if (!this.client.isReady()) {
        return { success: false, message: 'Discord bot is not ready' };
      }

      if (!this.settings?.guild_id) {
        return { success: false, message: 'Guild ID not configured' };
      }

      // Find the user and their voice channel
      const guild = await this.client.guilds.fetch(this.settings.guild_id);
      const member = await guild.members.fetch(userId);
      
      if (!member.voice.channel) {
        return { success: false, message: `User ${userId} is not in any voice channel` };
      }

      const channelId = member.voice.channel.id;

      // Play a random voice line in their channel
      const success = await this.playVoiceAnnouncement(channelId, 'welcome'); // Use welcome type for test
      
      if (success) {
        return { 
          success: true, 
          message: `Successfully played voice line in user's channel`,
          channelId: channelId
        };
      } else {
        return { success: false, message: 'Failed to play voice line' };
      }

    } catch (error) {
      console.error('Error testing voice line for user:', error);
      return { success: false, message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  async playVoiceAnnouncement(channelId: string, audioType: 'welcome' | 'nextround' | 'finish', lineNumber?: number): Promise<boolean> {
    try {
      if (!this.client.isReady() || !this.settings) {
        console.warn('⚠️ Bot not ready or settings not loaded');
        return false;
      }

      if (!this.settings.voice_announcements_enabled) {
        return false;
      }

      if (!this.settings.announcer_voice) {
        console.error('❌ No announcer voice selected');
        return false;
      }

      // Check if audio is already playing in this channel
      if (this.playbackStatus.get(channelId)) {
        return false;
      }

      // Get audio file path
      const audioFilePath = await this.getAudioFilePath(this.settings.announcer_voice, audioType, lineNumber);
      if (!audioFilePath) {
        console.error(`❌ Audio file not found for ${this.settings.announcer_voice} ${audioType} ${lineNumber || 'random'}`);
        return false;
      }

      // Connect to voice channel and play audio
      return await this.connectToVoiceChannelAndPlayAudio(channelId, audioFilePath);
      
    } catch (error) {
      console.error('❌ Error playing voice announcement:', error);
      return false;
    }
  }

  private async getAudioFilePath(voiceId: string, audioType: string, lineNumber?: number): Promise<string | null> {
    try {
      if (!this.db) return null;

      // Get voice path from database
      const voice = await this.db.get<{ path: string }>(`
        SELECT path FROM voices WHERE id = ?
      `, [voiceId]);

      if (!voice) {
        console.error(`❌ Voice not found: ${voiceId}`);
        return null;
      }

      // Remove leading slash from voice path if present (e.g., "/public/..." -> "public/...")
      const cleanVoicePath = voice.path.startsWith('/') ? voice.path.substring(1) : voice.path;
      const voiceDir = path.join(process.cwd(), cleanVoicePath);

      // Construct filename
      let filename: string;
      if (lineNumber) {
        filename = `${audioType}${lineNumber}.mp3`;
      } else {
        // Dynamically find available files and pick a random one
        const availableFiles = await this.getAvailableAudioFiles(voiceDir, audioType);
        if (availableFiles.length === 0) {
          console.warn(`⚠️ No ${audioType} audio files found in ${voiceDir}`);
          return null;
        }
        
        const randomIndex = Math.floor(Math.random() * availableFiles.length);
        filename = availableFiles[randomIndex];
      }

      const fullPath = path.join(voiceDir, filename);
      
      // Check if file exists using fs
      if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ Audio file not found: ${fullPath}`);
        return null;
      }

      return fullPath;
    } catch (error) {
      console.error('❌ Error getting audio file path:', error);
      return null;
    }
  }

  /**
   * Get all available audio files of a specific type in a directory
   */
  private async getAvailableAudioFiles(voiceDir: string, audioType: string): Promise<string[]> {
    try {
      
      if (!fs.existsSync(voiceDir)) {
        return [];
      }

      const files = fs.readdirSync(voiceDir);
      const audioFiles = files.filter((file: string) => 
        file.startsWith(audioType) && file.endsWith('.mp3')
      );

      return audioFiles;
    } catch (error) {
      console.error('❌ Error getting available audio files:', error);
      return [];
    }
  }

  private async connectToVoiceChannelAndPlayAudio(channelId: string, audioFilePath: string): Promise<boolean> {
    try {
      // Mark channel as playing
      this.playbackStatus.set(channelId, true);

      // Get the voice channel
      const channel = await this.client.channels.fetch(channelId) as VoiceBasedChannel;
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        console.error(`❌ Channel ${channelId} is not a voice channel`);
        this.playbackStatus.set(channelId, false);
        return false;
      }

      // Stop any existing audio player for this channel
      const existingPlayer = this.activeAudioPlayers.get(channelId);
      if (existingPlayer) {
        (existingPlayer as unknown as { stop: () => void }).stop();
        this.activeAudioPlayers.delete(channelId);
      }

      // Disconnect any existing connection for this guild to avoid conflicts
      const existingConnection = getVoiceConnection(channel.guild.id);
      if (existingConnection) {
        try {
          existingConnection.destroy();
        } catch (error) {
          console.warn(`⚠️ Error cleaning up existing connection:`, error);
        }
      }

      // Create new connection
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });

      this.voiceConnections.set(channelId, connection);

      // Wait for connection to be ready
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

      // Create audio player and resource
      const player = createAudioPlayer();
      const resource = createAudioResource(audioFilePath);

      // Store the player reference
      this.activeAudioPlayers.set(channelId, player);

      // Subscribe the connection to the audio player
      connection.subscribe(player);

      // Play the audio
      player.play(resource);

      // Wait for audio to finish
      return new Promise((resolve) => {
        let isResolved = false;
        
        const cleanup = () => {
          if (!isResolved) {
            this.playbackStatus.set(channelId, false);
            this.activeAudioPlayers.delete(channelId);
            
            // Disconnect from voice channel after a short delay to allow cleanup
            setTimeout(() => {
              try {
                if (connection.state.status !== 'destroyed') {
                  (connection as unknown as { destroy: () => void }).destroy();
                }
                this.voiceConnections.delete(channelId);
              } catch (error) {
                console.warn(`⚠️ Error disconnecting from voice channel ${channelId}:`, error);
              }
            }, 1000);
            
            isResolved = true;
          }
        };

        // Set a timeout to ensure we don't hang indefinitely
        const timeout = setTimeout(() => {
          if (!isResolved) {
            (player as unknown as { stop: () => void }).stop();
            cleanup();
            resolve(false);
          }
        }, 30000); // 30 second timeout

        player.once(AudioPlayerStatus.Idle, () => {
          if (!isResolved) {
            clearTimeout(timeout);
            cleanup();
            resolve(true);
          }
        });

        player.once('error', (error) => {
          if (!isResolved) {
            clearTimeout(timeout);
            console.error(`❌ Error playing voice announcement:`, error);
            cleanup();
            resolve(false);
          }
        });
      });
      
    } catch (error) {
      console.error('❌ Error connecting to voice channel and playing audio:', error);
      this.playbackStatus.set(channelId, false);
      this.activeAudioPlayers.delete(channelId);
      return false;
    }
  }

  async disconnectFromVoiceChannel(channelId: string): Promise<boolean> {
    try {
      // Stop any active audio player
      const player = this.activeAudioPlayers.get(channelId);
      if (player) {
        (player as unknown as { stop: () => void }).stop();
        this.activeAudioPlayers.delete(channelId);
      }

      // Clear playback status
      this.playbackStatus.set(channelId, false);

      // Disconnect from voice channel
      const connection = this.voiceConnections.get(channelId);
      if (connection) {
        (connection as unknown as { destroy: () => void }).destroy();
        this.voiceConnections.delete(channelId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error disconnecting from voice channel:', error);
      return false;
    }
  }

  async disconnectFromAllVoiceChannels(): Promise<void> {
    // Stop all active audio players
    for (const [channelId, player] of this.activeAudioPlayers) {
      try {
        (player as unknown as { stop: () => void }).stop();
      } catch (error) {
        console.error(`❌ Error stopping audio player in channel ${channelId}:`, error);
      }
    }
    this.activeAudioPlayers.clear();

    // Clear all playback status
    this.playbackStatus.clear();

    // Disconnect from all voice channels
    for (const [channelId, connection] of this.voiceConnections) {
      try {
        (connection as unknown as { destroy: () => void }).destroy();
      } catch (error) {
        console.error(`❌ Error disconnecting from voice channel ${channelId}:`, error);
      }
    }
    this.voiceConnections.clear();
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }

  /**
   * Play announcements to both team voice channels sequentially
   */
  async playTeamAnnouncements(
    blueTeamChannelId: string | null,
    redTeamChannelId: string | null,
    audioType: 'welcome' | 'nextround' | 'finish',
    firstTeam: 'blue' | 'red' = 'blue'
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.client.isReady()) {
        return { success: false, message: 'Discord bot is not ready' };
      }

      if (!this.settings?.voice_announcements_enabled) {
        return { success: false, message: 'Voice announcements are disabled' };
      }

      const channels = [];
      
      // Add channels in the order specified by firstTeam
      if (firstTeam === 'blue') {
        if (blueTeamChannelId) channels.push({ id: blueTeamChannelId, team: 'blue' });
        if (redTeamChannelId) channels.push({ id: redTeamChannelId, team: 'red' });
      } else {
        if (redTeamChannelId) channels.push({ id: redTeamChannelId, team: 'red' });
        if (blueTeamChannelId) channels.push({ id: blueTeamChannelId, team: 'blue' });
      }

      if (channels.length === 0) {
        return { success: false, message: 'No voice channels configured' };
      }

      console.log(`🔊 Playing ${audioType} announcements to ${channels.length} channels, starting with ${firstTeam} team`);

      // Play announcements sequentially
      for (const channel of channels) {
        console.log(`🔊 Playing ${audioType} announcement to ${channel.team} team channel: ${channel.id}`);
        
        const success = await this.playVoiceAnnouncement(channel.id, audioType);
        
        if (!success) {
          console.warn(`⚠️ Failed to play ${audioType} announcement to ${channel.team} team channel: ${channel.id}`);
        } else {
          console.log(`✅ Successfully played ${audioType} announcement to ${channel.team} team channel`);
        }
        
        // Longer delay between channels to ensure full cleanup and avoid conflicts
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      return { success: true, message: `Played ${audioType} announcements to ${channels.length} channels` };

    } catch (error) {
      console.error('❌ Error playing team announcements:', error);
      return { success: false, message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  /**
   * Get the next team that should go first (alternating)
   */
  async getNextFirstTeam(matchId: string): Promise<'blue' | 'red'> {
    try {
      if (!this.db) return 'blue'; // Default to blue if no database

      const result = await this.db.get<{ last_first_team: string }>(`
        SELECT last_first_team FROM match_voice_alternation WHERE match_id = ?
      `, [matchId]);

      // If no record exists or last was red, return blue. If last was blue, return red.
      return !result || result.last_first_team === 'red' ? 'blue' : 'red';
    } catch (error) {
      console.error('❌ Error getting next first team:', error);
      return 'blue'; // Default to blue on error
    }
  }

  /**
   * Update which team went first for this match
   */
  async updateFirstTeam(matchId: string, firstTeam: 'blue' | 'red'): Promise<void> {
    try {
      if (!this.db) return;

      await this.db.run(`
        INSERT OR REPLACE INTO match_voice_alternation (match_id, last_first_team, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `, [matchId, firstTeam]);

      console.log(`📝 Updated first team for match ${matchId}: ${firstTeam}`);
    } catch (error) {
      console.error('❌ Error updating first team:', error);
    }
  }
}