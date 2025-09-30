import fs from 'fs';
import path from 'path';
import {
  Client,
  Message,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventEntityType,
  GuildScheduledEventCreateOptions
} from 'discord.js';
import { Database } from '../../../lib/database/connection';
import { DiscordSettings } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';

export class EventHandler {
  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null
  ) {}

  async createDiscordEvent(eventData: {
    id: string;
    name: string;
    description: string;
    game_id: string;
    type: 'competitive' | 'casual';
    start_date: string;
    livestream_link?: string;
    event_image_url?: string;
  }, message: Message, rounds: number = 1): Promise<string | null> {
    try {
      const guild = this.client.guilds.cache.get(this.settings?.guild_id || '');
      if (!guild) {
        logger.warning('⚠️ Guild not found for Discord event creation');
        return null;
      }

      // Get game name for better event description
      let gameName = eventData.game_id;
      if (this.db) {
        try {
          const gameData = await this.db.get<{name: string}>(`
            SELECT name FROM games WHERE id = ?
          `, [eventData.game_id]);
          if (gameData) {
            gameName = gameData.name;
          }
        } catch (error) {
          logger.error('Error fetching game name for Discord event:', error);
        }
      }

      // Calculate event duration based on settings and rounds
      const durationMinutes = (this.settings?.event_duration_minutes || 45) * rounds;
      const startTime = new Date(eventData.start_date);
      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

      // Create event description with match details and link to announcement
      let eventDescription = eventData.description || 'Join us for this exciting match!';
      eventDescription += `\n\n🎯 Game: ${gameName}`;
      eventDescription += `\n🏆 Type: ${eventData.type === 'competitive' ? 'Competitive' : 'Casual'}`;
      
      if (eventData.livestream_link) {
        eventDescription += `\n📺 Livestream: ${eventData.livestream_link}`;
      }

      // Add link to the announcement message
      eventDescription += `\n\n📢 View full details: https://discord.com/channels/${guild.id}/${message.channelId}/${message.id}`;

      const eventOptions: GuildScheduledEventCreateOptions = {
        name: eventData.name,
        description: eventDescription.substring(0, 1000), // Discord limit
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: {
          location: eventData.livestream_link || 'Discord Server'
        }
      };

      // Add cover image if event image is provided
      if (eventData.event_image_url) {
        try {
          // Convert URL path to file system path for local files
          const imagePath = path.join(process.cwd(), 'public', eventData.event_image_url.replace(/^\//, ''));
          
          if (fs.existsSync(imagePath)) {
            // Read the image file as a buffer
            const imageBuffer = fs.readFileSync(imagePath);
            eventOptions.image = imageBuffer;
          } else {
            logger.warning(`⚠️ Event image not found for Discord event: ${imagePath}`);
          }
        } catch (error) {
          logger.error(`❌ Error adding cover image to Discord event:`, error);
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
      } else {
        logger.warning(`⚠️ Discord event not found: ${eventId}`);
        return false;
      }
    } catch (error) {
      logger.warning(`⚠️ Could not delete Discord event ${eventId}:`, (error as Error)?.message);
      return false;
    }
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}