import { Client, Events } from 'discord.js';
import { log } from '@matchexec/shared';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client: Client) {
    log.info('Discord bot is ready!', {
      tag: client.user?.tag,
      guilds: client.guilds.cache.size,
      users: client.users.cache.size,
    });

    // Set bot presence
    client.user?.setPresence({
      activities: [{
        name: 'MatchExec Statistics',
        type: 3, // Watching
      }],
      status: 'online',
    });
  },
}; 