import type {
  Client,
  Message,
  GuildScheduledEventCreateOptions
} from 'discord.js';
import {
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventEntityType
} from 'discord.js';
import type { DiscordSettings } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';
import { loadImage } from '../utils/image-source';
import { db as pgDb } from '../../../lib/db';
import { getGameName } from '../../../src/lib/games';

export class EventHandler {
  constructor(
    private client: Client,
    private settings: DiscordSettings | null
  ) {}

  /**
   * Fetch game name from database
   */
  private async fetchGameName(gameId: string): Promise<string> {

    try {
      return (await getGameName(pgDb, gameId)) ?? gameId;
    } catch (error) {
      logger.error('Error fetching game name for Discord event:', error);
      return gameId;
    }
  }

  /**
   * Calculate event times
   */
  private calculateEventTimes(startDate: string, rounds: number): { startTime: Date; endTime: Date } {
    const durationMinutes = (this.settings?.event_duration_minutes || 45) * rounds;
    const startTime = new Date(startDate);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
    return { startTime, endTime };
  }

  /**
   * Build event description
   */
  private buildEventDescription(
    eventData: { description: string; type: 'competitive' | 'casual'; livestream_link?: string },
    gameName: string,
    message: Message
  ): string {
    const guildId = message.guild?.id || '';

    let description = eventData.description || 'Join us for this exciting match!';
    description += `\n\n🎯 Game: ${gameName}`;
    description += `\n🏆 Type: ${eventData.type === 'competitive' ? 'Competitive' : 'Casual'}`;

    if (eventData.livestream_link) {
      description += `\n📺 Livestream: ${eventData.livestream_link}`;
    }

    description += `\n\n📢 View full details: https://discord.com/channels/${guildId}/${message.channelId}/${message.id}`;

    return description.substring(0, 1000);
  }

  /**
   * Load event cover image
   */
  private async loadEventImage(imageUrl: string): Promise<Buffer | undefined> {
    try {
      const image = await loadImage(imageUrl);
      if (!image) {
        logger.warning(`⚠️ Event image not found for Discord event: ${imageUrl}`);
        return undefined;
      }
      if (image.buffer.length > 10 * 1024 * 1024) {
        logger.error(`❌ Event image too large (${image.buffer.length} bytes): ${imageUrl}`);
        return undefined;
      }
      return image.buffer;
    } catch (error) {
      logger.error(`❌ Error adding cover image to Discord event:`, error);
    }

    return undefined;
  }

  async createDiscordEvent(eventData: {
    id: string;
    name: string;
    description: string;
    game_id: string;
    type: 'competitive' | 'casual';
    start_date: string;
    livestream_link?: string;
    event_image_url?: string;
  }, message: Message, rounds = 1): Promise<string | null> {
    try {
      const guild = this.client.guilds.cache.get(this.settings?.guild_id || '');
      if (!guild) {
        logger.warning('⚠️ Guild not found for Discord event creation');
        return null;
      }

      const gameName = await this.fetchGameName(eventData.game_id);
      const { startTime, endTime } = this.calculateEventTimes(eventData.start_date, rounds);
      const eventDescription = this.buildEventDescription(eventData, gameName, message);

      const eventOptions: GuildScheduledEventCreateOptions = {
        name: eventData.name,
        description: eventDescription,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: {
          location: eventData.livestream_link || 'Discord Server'
        }
      };

      if (eventData.event_image_url) {
        const imageBuffer = await this.loadEventImage(eventData.event_image_url);
        if (imageBuffer) {
          eventOptions.image = imageBuffer;
        }
      }

      const discordEvent = await guild.scheduledEvents.create(eventOptions);

      return discordEvent.id;

    } catch (error) {
      logger.error('❌ Error creating Discord event:', error);
      return null;
    }
  }

  async deleteDiscordEvent(eventId: string): Promise<boolean> {
    try {
      const guild = this.client.guilds.cache.get(this.settings?.guild_id || '');
      if (!guild) {
        logger.warning('⚠️ Guild not found for Discord event deletion');
        return false;
      }

      const event = await guild.scheduledEvents.fetch(eventId);
      if (event) {
        await event.delete();
        return true;
      } 
        logger.warning(`⚠️ Discord event not found: ${eventId}`);
        return false;
      
    } catch (error) {
      logger.warning(`⚠️ Could not delete Discord event ${eventId}:`, (error as Error)?.message);
      return false;
    }
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}