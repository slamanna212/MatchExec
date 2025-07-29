import { Client } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { log } from '@matchexec/shared';

export async function loadEvents(client: Client) {
  const eventsPath = join(__dirname, '../events');
  
  try {
    const eventFiles = readdirSync(eventsPath).filter(file => 
      file.endsWith('.ts') || file.endsWith('.js')
    );

    for (const file of eventFiles) {
      const eventPath = join(eventsPath, file);
      const event = await import(eventPath);
      
      if (event.default?.name) {
        if (event.default.once) {
          client.once(event.default.name, (...args) => event.default.execute(...args));
        } else {
          client.on(event.default.name, (...args) => event.default.execute(...args));
        }
        
        log.info('Loaded Discord event', { 
          event: event.default.name, 
          once: event.default.once || false 
        });
      }
    }

    log.info('All Discord events loaded successfully');
  } catch (error) {
    log.error('Failed to load Discord events', { error: (error as Error).message });
  }
} 