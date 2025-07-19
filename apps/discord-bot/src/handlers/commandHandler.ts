import { Client } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { log } from '@matchexec/shared';

export async function loadCommands(client: Client) {
  const commandsPath = join(__dirname, '../commands');
  
  try {
    const commandFiles = readdirSync(commandsPath).filter(file => 
      file.endsWith('.ts') || file.endsWith('.js')
    );

    for (const file of commandFiles) {
      const commandPath = join(commandsPath, file);
      const command = await import(commandPath);
      
      if (command.default?.data && command.default?.execute) {
        client.commands.set(command.default.data.name, command.default);
        log.info('Loaded Discord command', { command: command.default.data.name });
      }
    }

    log.info('All Discord commands loaded successfully', { 
      count: client.commands.size 
    });
  } catch (error) {
    log.error('Failed to load Discord commands', { error: (error as Error).message });
  }
} 