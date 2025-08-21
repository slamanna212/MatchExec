import path from 'path';
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
  private voiceConnections = new Map<string, any>(); // channelId -> connection
  private activeAudioPlayers = new Map<string, any>(); // channelId -> player
  private playbackStatus = new Map<string, boolean>(); // channelId -> isPlaying

  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null
  ) {}

  async testVoiceLineForUser(userId: string, voiceId?: string): Promise<{ success: boolean; message: string; channelId?: string }> {
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
        console.log('ℹ️ Voice announcements are disabled');
        return false;
      }

      if (!this.settings.announcer_voice) {
        console.error('❌ No announcer voice selected');
        return false;
      }

      // Check if audio is already playing in this channel
      if (this.playbackStatus.get(channelId)) {
        console.log(`⏭️ Audio already playing in channel ${channelId}, skipping new request`);
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

      // Construct filename
      let filename: string;
      if (lineNumber) {
        filename = `${audioType}${lineNumber}.mp3`;
      } else {
        // Random line selection (1-5 for most voices)
        const randomNum = Math.floor(Math.random() * 5) + 1;
        filename = `${audioType}${randomNum}.mp3`;
      }

      // Remove leading slash from voice path if present (e.g., "/public/..." -> "public/...")
      const cleanVoicePath = voice.path.startsWith('/') ? voice.path.substring(1) : voice.path;
      const fullPath = path.join(process.cwd(), cleanVoicePath, filename);
      
      // Check if file exists using fs
      const fs = require('fs');
      if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ Audio file not found: ${fullPath}`);
        return null;
      }

      console.log(`🎵 Found audio file: ${fullPath}`);
      return fullPath;
    } catch (error) {
      console.error('❌ Error getting audio file path:', error);
      return null;
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
        console.log(`🛑 Stopping existing audio player in channel ${channelId}`);
        existingPlayer.stop();
        this.activeAudioPlayers.delete(channelId);
      }

      // Get existing connection or create new one
      let connection = getVoiceConnection(channel.guild.id);
      
      if (!connection) {
        // Join the voice channel
        connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator,
        });

        this.voiceConnections.set(channelId, connection);
      }

      // Wait for connection to be ready
      await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

      // Create audio player and resource
      const player = createAudioPlayer();
      const resource = createAudioResource(audioFilePath);

      // Store the player reference
      this.activeAudioPlayers.set(channelId, player);

      // Subscribe the connection to the audio player
      connection.subscribe(player);

      console.log(`🔊 Playing voice announcement in channel ${channelId}: ${path.basename(audioFilePath)}`);

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
                connection.destroy();
                this.voiceConnections.delete(channelId);
                console.log(`🔇 Disconnected from voice channel ${channelId} after playing announcement`);
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
            console.warn(`⏰ Audio playback timeout in channel ${channelId}`);
            player.stop();
            cleanup();
            resolve(false);
          }
        }, 30000); // 30 second timeout

        player.once(AudioPlayerStatus.Idle, () => {
          if (!isResolved) {
            clearTimeout(timeout);
            console.log(`✅ Voice announcement finished playing in channel ${channelId}`);
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
        player.stop();
        this.activeAudioPlayers.delete(channelId);
      }

      // Clear playback status
      this.playbackStatus.set(channelId, false);

      // Disconnect from voice channel
      const connection = this.voiceConnections.get(channelId);
      if (connection) {
        connection.destroy();
        this.voiceConnections.delete(channelId);
        console.log(`🔇 Disconnected from voice channel ${channelId}`);
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
        player.stop();
        console.log(`🛑 Stopped audio player in channel ${channelId}`);
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
        connection.destroy();
        console.log(`🔇 Disconnected from voice channel ${channelId}`);
      } catch (error) {
        console.error(`❌ Error disconnecting from voice channel ${channelId}:`, error);
      }
    }
    this.voiceConnections.clear();
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}