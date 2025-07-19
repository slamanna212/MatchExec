import { Events, Interaction } from 'discord.js';
import { log } from '@matchexec/shared';

export default {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      log.warn('Unknown command attempted', { command: interaction.commandName });
      return;
    }

    try {
      await command.execute(interaction);
      log.info('Command executed successfully', {
        command: interaction.commandName,
        user: interaction.user.tag,
        guild: interaction.guild?.name,
      });
    } catch (error) {
      log.error('Command execution failed', {
        command: interaction.commandName,
        user: interaction.user.tag,
        error: (error as Error).message,
      });

      const errorMessage = 'There was an error while executing this command!';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  },
}; 