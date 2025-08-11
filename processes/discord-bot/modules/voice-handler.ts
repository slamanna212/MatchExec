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
        filename = `${audioType}_${lineNumber}.wav`;
      } else {
        // Random line selection
        const randomNum = Math.floor(Math.random() * 10) + 1;
        filename = `${audioType}_${randomNum}.wav`;
      }

      const fullPath = path.join(process.cwd(), voice.path, filename);
      
      // Check if file exists using fs
      const fs = require('fs');
      if (!fs.existsSync(fullPath)) {
        return null;
      }

      return fullPath;
    } catch (error) {
      console.error('❌ Error getting audio file path:', error);
      return null;
    }
  }

  private async connectToVoiceChannelAndPlayAudio(channelId: string, audioFilePath: string): Promise<boolean> {
    try {
      // Get the voice channel
      const channel = await this.client.channels.fetch(channelId) as VoiceBasedChannel;
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        console.error(`❌ Channel ${channelId} is not a voice channel`);
        return false;
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
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

      // Create audio player and resource
      const player = createAudioPlayer();
      const resource = createAudioResource(audioFilePath);

      // Subscribe the connection to the audio player
      connection.subscribe(player);

      console.log(`🔊 Playing voice announcement in channel ${channelId}: ${path.basename(audioFilePath)}`);

      // Play the audio
      player.play(resource);

      // Wait for audio to finish
      return new Promise((resolve) => {
        player.on(AudioPlayerStatus.Idle, () => {
          console.log(`✅ Voice announcement finished playing in channel ${channelId}`);
          resolve(true);
        });

        player.on('error', (error) => {
          console.error(`❌ Error playing voice announcement:`, error);
          resolve(false);
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          console.warn(`⏰ Voice announcement timed out in channel ${channelId}`);
          resolve(false);
        }, 30000);
      });
      
    } catch (error) {
      console.error('❌ Error connecting to voice channel and playing audio:', error);
      return false;
    }
  }

  async disconnectFromVoiceChannel(channelId: string): Promise<boolean> {
    try {
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