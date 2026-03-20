import type {
  Client,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction
} from 'discord.js';
import {
  SlashCommandBuilder,
  REST,
  Routes,
  MessageFlags,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  EmbedBuilder
} from 'discord.js';
import type { Database } from '../../../lib/database/connection';
import type { DiscordSettings } from '../../../shared/types';
import { logger } from '../../../src/lib/logger/server';

// Import SignupFormLoader
import { SignupFormLoader } from '../../../lib/signup-forms';

// Import helper functions
import { parseModalCustomId } from '../utils/id-parsers';
import {
  collectFormData,
  insertParticipant,
  getParticipantCount,
  buildConfirmationMessage
} from './interaction-helpers';

interface EventData {
  max_signups: number;
  game_id: string;
  allow_player_team_selection?: number;
}

/**
 * Checks if a user is already signed up for an event
 */
async function checkExistingParticipant(
  db: Database,
  eventId: string,
  userId: string,
  isTournament: boolean
): Promise<boolean> {
  const query = isTournament
    ? 'SELECT id FROM tournament_participants WHERE tournament_id = ? AND user_id = ?'
    : 'SELECT id FROM match_participants WHERE match_id = ? AND user_id = ?';

  const existing = await db.get(query, [eventId, userId]);
  return !!existing;
}

/**
 * Checks if an event is at capacity
 */
async function checkEventCapacity(
  db: Database,
  eventId: string,
  isTournament: boolean
): Promise<{ isFull: boolean; eventData: EventData | null }> {
  // Get participant count
  const countQuery = isTournament
    ? 'SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = ?'
    : 'SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?';

  const participantCount = await db.get<{ count: number }>(countQuery, [eventId]);

  // Get event data
  const eventQuery = isTournament
    ? `SELECT t.game_id, COALESCE(t.max_participants, 999999) as max_signups, t.allow_player_team_selection
       FROM tournaments t WHERE t.id = ?`
    : `SELECT m.game_id, g.max_signups
       FROM matches m JOIN games g ON m.game_id = g.id WHERE m.id = ?`;

  const eventData = await db.get<EventData>(eventQuery, [eventId]);

  const isFull = (participantCount?.count ?? 0) >= (eventData?.max_signups || 16);

  return { isFull, eventData: eventData ?? null };
}

/**
 * Shows team selection menu for tournaments
 */
async function showTeamSelectionMenu(
  interaction: ButtonInteraction,
  db: Database,
  eventId: string
): Promise<boolean> {
  const teams = await db.all<{ id: string; team_name: string }>(`
    SELECT id, team_name FROM tournament_teams
    WHERE tournament_id = ?
    ORDER BY team_name ASC
  `, [eventId]);

  if (!teams || teams.length === 0) {
    return false;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`team_select_${eventId}`)
    .setPlaceholder('Select a team')
    .addOptions(teams.map(team => ({
      label: team.team_name,
      value: team.id,
      description: `Join ${team.team_name}`
    })));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.reply({
    content: '👥 Please select a team to join:',
    components: [row],
    flags: MessageFlags.Ephemeral
  });

  return true;
}

/**
 * Shows signup modal with game-specific form
 */
async function showSignupModal(
  interaction: ButtonInteraction,
  eventId: string,
  gameId: string
): Promise<boolean> {
  const signupForm = await SignupFormLoader.loadSignupForm(gameId);

  if (!signupForm) {
    await interaction.reply({
      content: '❌ Could not load signup form. Please try again.',
      flags: MessageFlags.Ephemeral
    });
    return false;
  }

  const modal = new ModalBuilder()
    .setCustomId(`signup_form_${eventId}`)
    .setTitle('Event Sign Up');

  const rows: ActionRowBuilder<TextInputBuilder>[] = [];

  for (let i = 0; i < Math.min(signupForm.fields.length, 5); i++) {
    const field = signupForm.fields[i];

    const textInput = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.type === 'largetext' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required)
      .setMaxLength(field.type === 'largetext' ? 1000 : 100);

    if (field.placeholder) {
      textInput.setPlaceholder(field.placeholder);
    }

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
    rows.push(row);
  }

  modal.addComponents(...rows);
  await interaction.showModal(modal);

  return true;
}

export class InteractionHandler {
  private pendingTeamSelections = new Map<string, { eventId: string; teamId: string }>();

  constructor(
    private client: Client,
    private db: Database,
    private settings: DiscordSettings | null,
    private sendSignupNotification: (eventId: string, signupInfo: {
      username: string;
      discordUserId: string;
      signupData: {[key: string]: string};
      participantCount: number;
    }) => Promise<void>
  ) {}

  async registerSlashCommands() {
    if (!this.settings?.bot_token || !this.settings?.guild_id) {
      logger.warning('Missing bot token or guild ID, skipping command registration');
      return;
    }

    const commands = [
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check bot status and configuration'),
      new SlashCommandBuilder()
        .setName('matches')
        .setDescription('List upcoming and active matches (up to 5)'),
      new SlashCommandBuilder()
        .setName('tournaments')
        .setDescription('List upcoming and active tournaments (up to 5)')
    ];

    try {
      const rest = new REST().setToken(this.settings.bot_token);
      

      await rest.put(
        Routes.applicationGuildCommands(this.client.user!.id, this.settings.guild_id),
        { body: commands }
      );

    } catch (error) {
      logger.error('❌ Error registering slash commands:', error);
    }
  }

  async handleSlashCommand(interaction: ChatInputCommandInteraction) {
    const { commandName } = interaction;

    try {
      switch (commandName) {
        case 'status':
          await this.handleStatusCommand(interaction);
          break;
        case 'matches':
          await this.handleMatchesCommand(interaction);
          break;
        case 'tournaments':
          await this.handleTournamentsCommand(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown command.',
            flags: MessageFlags.Ephemeral
          });
      }
    } catch (error) {
      logger.error('❌ Error handling slash command:', error);
      
      const errorMessage = '❌ An error occurred while processing your command.';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      }
    }
  }

  private async handleStatusCommand(interaction: ChatInputCommandInteraction) {
    const uptime = process.uptime();
    const uptimeString = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
    
    const status = [
      `🤖 **MatchExec Bot Status**`,
      `✅ Bot Online`,
      `⏱️ Uptime: ${uptimeString}`,
      `🏠 Guild: ${interaction.guildId}`,
      `📡 Ping: ${this.client.ws.ping}ms`,
      `🗄️ Database: ${this.db ? '✅ Connected' : '❌ Disconnected'}`
    ].join('\n');

    await interaction.reply({
      content: status,
      flags: MessageFlags.Ephemeral
    });
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'created': return '🟡';
      case 'gather':  return '🟢';
      case 'assign':  return '🔵';
      case 'battle':  return '⚔️';
      default:        return '⚪';
    }
  }

  private getStatusLabel(status: string): string {
    switch (status) {
      case 'created': return 'Setup';
      case 'gather':  return 'Signups Open';
      case 'assign':  return 'Teams Assigned';
      case 'battle':  return 'In Progress';
      default:        return status;
    }
  }

  private async handleMatchesCommand(interaction: ChatInputCommandInteraction) {
    const matches = await this.db.all<{
      id: string;
      name: string;
      status: string;
      start_date: string | null;
      game_name: string;
    }>(`
      SELECT m.id, m.name, m.status, m.start_date, g.name as game_name
      FROM matches m
      JOIN games g ON m.game_id = g.id
      WHERE m.status NOT IN ('complete', 'cancelled')
        AND m.tournament_id IS NULL
      ORDER BY m.start_date ASC
      LIMIT 5
    `);

    if (!matches.length) {
      await interaction.reply({ content: 'No active matches found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Upcoming Matches')
      .setColor(0x5865F2)
      .setFooter({ text: 'Showing up to 5 active matches' });

    for (const match of matches) {
      const msg = await this.db.get<{ message_id: string; channel_id: string }>(`
        SELECT message_id, channel_id FROM discord_match_messages
        WHERE match_id = ? AND message_type = 'announcement' LIMIT 1
      `, [match.id]);

      const parts: string[] = [`🎮 ${match.game_name}`];

      if (match.start_date) {
        const ts = Math.floor(new Date(match.start_date).getTime() / 1000);
        if (!isNaN(ts)) parts.push(`🕐 <t:${ts}:R>`);
      }

      if (msg && this.settings?.guild_id) {
        parts.push(`[View Announcement](https://discord.com/channels/${this.settings.guild_id}/${msg.channel_id}/${msg.message_id})`);
      }

      const statusEmoji = this.getStatusEmoji(match.status);
      const statusLabel = this.getStatusLabel(match.status);
      embed.addFields({
        name: `${statusEmoji} ${match.name}`,
        value: `${parts.join(' · ')}\n*${statusLabel}*`,
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async handleTournamentsCommand(interaction: ChatInputCommandInteraction) {
    const tournaments = await this.db.all<{
      id: string;
      name: string;
      status: string;
      start_date: string | null;
      format: string;
      game_name: string;
    }>(`
      SELECT t.id, t.name, t.status, t.start_date, t.format, g.name as game_name
      FROM tournaments t
      JOIN games g ON t.game_id = g.id
      WHERE t.status NOT IN ('complete', 'cancelled')
      ORDER BY t.start_date ASC
      LIMIT 5
    `);

    if (!tournaments.length) {
      await interaction.reply({ content: 'No active tournaments found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🏆 Upcoming Tournaments')
      .setColor(0x5865F2)
      .setFooter({ text: 'Showing up to 5 active tournaments' });

    for (const tournament of tournaments) {
      const msg = await this.db.get<{ message_id: string; channel_id: string }>(`
        SELECT message_id, channel_id FROM discord_match_messages
        WHERE match_id = ? AND message_type = 'announcement' LIMIT 1
      `, [tournament.id]);

      const formatLabel = tournament.format === 'double-elimination' ? 'DE' : 'SE';
      const parts: string[] = [`🎮 ${tournament.game_name}`, `🏟️ ${formatLabel}`];

      if (tournament.start_date) {
        const ts = Math.floor(new Date(tournament.start_date).getTime() / 1000);
        if (!isNaN(ts)) parts.push(`🕐 <t:${ts}:R>`);
      }

      if (msg && this.settings?.guild_id) {
        parts.push(`[View Announcement](https://discord.com/channels/${this.settings.guild_id}/${msg.channel_id}/${msg.message_id})`);
      }

      const statusEmoji = this.getStatusEmoji(tournament.status);
      const statusLabel = this.getStatusLabel(tournament.status);
      embed.addFields({
        name: `${statusEmoji} ${tournament.name}`,
        value: `${parts.join(' · ')}\n*${statusLabel}*`,
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  async handleButtonInteraction(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith('signup_')) return;

    const eventId = interaction.customId.replace('signup_', '');
    const isTournament = eventId.startsWith('tournament_');

    try {
      if (!this.db) return;

      // Check if this is a tournament match (participants come from bracket, no signups allowed)
      if (!isTournament) {
        const matchData = await this.db.get<{ tournament_id: string | null }>(`
          SELECT tournament_id FROM matches WHERE id = ?
        `, [eventId]);

        if (matchData?.tournament_id) {
          await interaction.reply({
            content: '❌ This is a tournament match - participants are assigned from the tournament bracket. You cannot sign up directly.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
      }

      // NOTE: We cannot defer this interaction because it may show a modal,
      // and showModal() must be the immediate response to an interaction.
      // Instead, we rely on signup form pre-loading at bot startup to make
      // loadSignupForm() instant (cache hit), avoiding file I/O during interaction.
      // This keeps the total processing time well under Discord's 3-second limit.

      // Check if user is already signed up
      const isAlreadySignedUp = await checkExistingParticipant(this.db, eventId, interaction.user.id, isTournament);

      if (isAlreadySignedUp) {
        await interaction.reply({
          content: '✅ You are already signed up for this event!',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Check if event is at capacity
      const { isFull, eventData } = await checkEventCapacity(this.db, eventId, isTournament);

      if (isFull) {
        await interaction.reply({
          content: '❌ This event is full!',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (!eventData) {
        await interaction.reply({
          content: '❌ Event not found!',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Check if tournament has team selection enabled
      if (isTournament && eventData.allow_player_team_selection === 1) {
        const teamSelectionShown = await showTeamSelectionMenu(interaction, this.db, eventId);
        if (teamSelectionShown) return;
      }

      // Show signup modal
      await showSignupModal(interaction, eventId, eventData.game_id);

    } catch (error) {
      logger.error('❌ Error handling signup button:', error);
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith('signup_form_')) return;

    logger.debug('Processing signup modal:', interaction.customId);

    // Parse modal custom ID
    const parsedId = parseModalCustomId(interaction.customId);
    if (!parsedId) {
      logger.error('Failed to parse modal custom ID:', interaction.customId);
      return;
    }

    // Retrieve and consume pending team selection (stored when user chose a team from the dropdown)
    const pending = this.pendingTeamSelections.get(interaction.user.id);
    this.pendingTeamSelections.delete(interaction.user.id);
    if (pending && pending.eventId === parsedId.eventId && !parsedId.selectedTeamId) {
      parsedId.selectedTeamId = pending.teamId;
    }

    logger.debug('Parsed signup modal ID:', { eventId: parsedId.eventId, isTournament: parsedId.isTournament, teamId: parsedId.selectedTeamId });

    try {
      if (!this.db) {
        throw new Error('Database not available');
      }

      // Get game ID to load the signup form structure
      const tableName = parsedId.isTournament ? 'tournaments' : 'matches';
      logger.debug(`Querying ${tableName} for event ID:`, parsedId.eventId);

      const eventData = await this.db.get<{ game_id: string }>(
        `SELECT game_id FROM ${tableName} WHERE id = ?`,
        [parsedId.eventId]
      );

      if (!eventData) {
        throw new Error('Event not found');
      }

      // Load signup form to get field structure
      const signupForm = await SignupFormLoader.loadSignupForm(eventData.game_id);
      if (!signupForm) {
        throw new Error('Could not load signup form');
      }

      // Collect form data
      const { signupData, displayUsername } = collectFormData(interaction, signupForm);

      // Insert participant into database
      await insertParticipant(this.db, parsedId, interaction, displayUsername, signupData, this.client);

      // Get participant count
      const participantCount = await getParticipantCount(this.db, parsedId.eventId, parsedId.isTournament);

      // Build confirmation message
      const confirmationMessage = await buildConfirmationMessage(
        this.db,
        parsedId,
        signupForm,
        signupData,
        participantCount
      );

      await interaction.reply({
        content: confirmationMessage,
        flags: MessageFlags.Ephemeral
      });

      // Send signup notification to configured channels
      await this.sendSignupNotification(parsedId.eventId, {
        username: displayUsername,
        discordUserId: interaction.user.id,
        signupData: signupData,
        participantCount: participantCount
      });

    } catch (error) {
      logger.error('❌ Error processing signup:', error);

      if (error instanceof Error && error.message?.includes('UNIQUE constraint failed')) {
        await interaction.reply({
          content: '❌ You are already signed up for this event!',
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: `❌ Failed to sign up: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }

  async handleStringSelectMenu(interaction: StringSelectMenuInteraction) {
    if (!interaction.customId.startsWith('team_select_')) return;

    const eventId = interaction.customId.replace('team_select_', '');
    const selectedTeamId = interaction.values[0];

    try {
      if (this.db) {
        // Check if user is already signed up
        const existingParticipant = await this.db.get(`
          SELECT id FROM tournament_participants
          WHERE tournament_id = ? AND user_id = ?
        `, [eventId, interaction.user.id]);

        if (existingParticipant) {
          await interaction.reply({
            content: '✅ You are already signed up for this tournament!',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Get tournament and team info
        const tournament = await this.db.get<{game_id: string}>(`
          SELECT game_id FROM tournaments WHERE id = ?
        `, [eventId]);

        const team = await this.db.get<{team_name: string}>(`
          SELECT team_name FROM tournament_teams WHERE id = ?
        `, [selectedTeamId]);

        if (!tournament || !team) {
          await interaction.reply({
            content: '❌ Tournament or team not found.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Load signup form to show modal
        const signupForm = await SignupFormLoader.loadSignupForm(tournament.game_id);
        if (!signupForm) {
          await interaction.reply({
            content: '❌ Could not load signup form. Please try again.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Create modal - team selection stored in-memory until modal is submitted
        this.pendingTeamSelections.set(interaction.user.id, { eventId, teamId: selectedTeamId });
        const modal = new ModalBuilder()
          .setCustomId(`signup_form_${eventId}`)
          .setTitle(`Sign Up - ${team.team_name}`);

        const rows: ActionRowBuilder<TextInputBuilder>[] = [];

        for (let i = 0; i < Math.min(signupForm.fields.length, 5); i++) {
          const field = signupForm.fields[i];

          const textInput = new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label)
            .setStyle(field.type === 'largetext' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(field.required)
            .setMaxLength(field.type === 'largetext' ? 1000 : 100);

          if (field.placeholder) {
            textInput.setPlaceholder(field.placeholder);
          }

          const row = new ActionRowBuilder<TextInputBuilder>()
            .addComponents(textInput);

          rows.push(row);
        }

        modal.addComponents(...rows);
        await interaction.showModal(modal);
      }
    } catch (error) {
      logger.error('❌ Error handling team selection:', error);
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }
}