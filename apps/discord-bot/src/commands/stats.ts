import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPrismaClient } from '@matchexec/shared';

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Get game statistics')
    .addStringOption(option =>
      option.setName('game')
        .setDescription('The game to get stats for')
        .setRequired(true)
        .addChoices(
          { name: 'Overwatch 2', value: 'overwatch' },
          { name: 'Marvel Rivals', value: 'marvel-rivals' }
        )
    ),
  
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    
    const gameId = interaction.options.getString('game', true);
    const prisma = getPrismaClient();
    
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          _count: {
            select: {
              players: true,
              matches: true,
              characters: true,
              maps: true,
            },
          },
        },
      });
      
      if (!game) {
        await interaction.editReply('Game not found!');
        return;
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${game.displayName} Statistics`)
        .setColor(0x3b82f6)
        .addFields(
          { name: '👥 Players', value: game._count.players.toString(), inline: true },
          { name: '🎮 Matches', value: game._count.matches.toString(), inline: true },
          { name: '🦸 Characters', value: game._count.characters.toString(), inline: true },
          { name: '🗺️ Maps', value: game._count.maps.toString(), inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'MatchExec Statistics' });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply('Failed to fetch game statistics.');
    }
  },
}; 