import { Client, GatewayIntentBits, Collection } from 'discord.js';
import dotenv from 'dotenv';
import { loadEnvironmentConfig, validateEnvironment, log } from '@matchexec/shared';

// Load environment variables
dotenv.config();

// Extend Client type to include commands collection
declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, any>;
  }
}

async function createBot() {
  const config = loadEnvironmentConfig();

  // Validate environment variables
  try {
    validateEnvironment();
  } catch (error) {
    log.error('Environment validation failed', { error: (error as Error).message });
    process.exit(1);
  }

  // Create Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  // Initialize commands collection
  client.commands = new Collection();

  // Load event handlers
  const { loadEvents } = await import('./handlers/eventHandler');
  const { loadCommands } = await import('./handlers/commandHandler');

  await loadEvents(client);
  await loadCommands(client);

  return client;
}

async function startBot() {
  try {
    const config = loadEnvironmentConfig();
    const client = await createBot();

    // Login to Discord
    await client.login(config.DISCORD_BOT_TOKEN);

    log.info('Discord bot started successfully', {
      process: 'discord-bot',
      environment: config.NODE_ENV,
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      log.info('SIGTERM received, shutting down Discord bot gracefully');
      client.destroy();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      log.info('SIGINT received, shutting down Discord bot gracefully');
      client.destroy();
      process.exit(0);
    });

  } catch (error) {
    log.error('Failed to start Discord bot', { error: (error as Error).message });
    process.exit(1);
  }
}

// Start bot if this file is run directly
if (require.main === module) {
  startBot();
}

export { createBot, startBot }; 