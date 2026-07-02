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
import { capTitle } from './utils';

// Import SignupFormLoader
import { SignupFormLoader } from '../../../lib/signup-forms';
import { version } from '../../../package.json';

// Import helper functions
import { parseModalCustomId } from '../utils/id-parsers';
import {
  collectFormData,
  insertParticipant,
  getParticipantCount,
  buildConfirmationMessage
} from './interaction-helpers';
import { sendDM, buildSignupWelcomeEmbed } from './dm-builder';

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
        .setDescription('List upcoming and active tournaments (up to 5)'),
      new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get links to MatchExec documentation'),
      new SlashCommandBuilder()
        .setName('mine')
        .setDescription('View your active match and tournament signups')
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
        case 'help':
          await this.handleHelpCommand(interaction);
          break;
        case 'mine':
          await this.handleMineCommand(interaction);
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

    const queueRow = await this.db.get<{ count: number }>(`
      SELECT SUM(cnt) as count FROM (
        SELECT COUNT(*) as cnt FROM discord_announcement_queue WHERE status='failed'
        UNION ALL SELECT COUNT(*) FROM discord_reminder_queue WHERE status='failed'
        UNION ALL SELECT COUNT(*) FROM discord_match_start_queue WHERE status='failed'
        UNION ALL SELECT COUNT(*) FROM discord_player_reminder_queue WHERE status='failed'
      )
    `);
    const queueDepth = queueRow?.count ?? 0;

    const status = [
      `🤖 **MatchExec Bot Status**`,
      `✅ Bot Online`,
      `🔖 Version: v${version}`,
      `⏱️ Uptime: ${uptimeString}`,
      `📡 Ping: ${this.client.ws.ping}ms`,
      `🗄️ Database: ${this.db ? '✅ Connected' : '❌ Disconnected'}`,
      `📬 Queue: ${queueDepth === 0 ? '✅ No failures' : `⚠️ ${queueDepth} failed`}`
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

  private buildEventField(
    item: { id: string; name: string; status: string; start_date: string | null; game_name: string },
    msg: { message_id: string; channel_id: string } | undefined,
    guildId: string | undefined
  ) {
    const parts: string[] = [`🎮 ${item.game_name}`];
    if (item.start_date) {
      const ts = Math.floor(new Date(item.start_date).getTime() / 1000);
      if (!isNaN(ts)) parts.push(`🕐 <t:${ts}:R>`);
    }
    if (msg && guildId) {
      parts.push(`[View Announcement](https://discord.com/channels/${guildId}/${msg.channel_id}/${msg.message_id})`);
    }
    return { name: `${this.getStatusEmoji(item.status)} ${item.name}`, value: parts.join(' · '), inline: false as const };
  }

  private async handleMatchesCommand(interaction: ChatInputCommandInteraction) {
    const matches = await this.db.all<{
      id: string; name: string; status: string; start_date: string | null; game_name: string;
    }>(`
      SELECT m.id, m.name, m.status, m.start_date, g.name as game_name
      FROM matches m
      JOIN games g ON m.game_id = g.id
      WHERE m.status IN ('gather', 'assign', 'battle')
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
      .setDescription('🟢 Signups Open · 🔵 Teams Assigned · ⚔️ In Progress')
      .setFooter({ text: 'Showing up to 5 active matches' });

    for (const match of matches) {
      const msg = await this.db.get<{ message_id: string; channel_id: string }>(
        `SELECT message_id, channel_id FROM discord_match_messages WHERE match_id = ? AND message_type = 'announcement' LIMIT 1`,
        [match.id]
      );
      embed.addFields(this.buildEventField(match, msg, this.settings?.guild_id));
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async handleHelpCommand(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setTitle('📚 MatchExec Documentation')
      .setColor(0x5865F2)
      .setURL('https://docs.matchexec.com')
      .setDescription('Find guides and references for MatchExec at [docs.matchexec.com](https://docs.matchexec.com).')
      .addFields(
        { name: '📋 Matches', value: '[Match Lifecycle](https://docs.matchexec.com/docs/matches/match-lifecycle/)', inline: false },
        { name: '🏆 Tournaments', value: '[Tournament Lifecycle](https://docs.matchexec.com/docs/tournaments/tournament-lifecycle/)', inline: false },
        { name: '🤖 Slash Commands', value: '[Discord Slash Commands](https://docs.matchexec.com/docs/discord/slash-commands/)', inline: false }
      );

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
      WHERE t.status IN ('gather', 'assign', 'battle')
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
      .setDescription('🟢 Signups Open · 🔵 Teams Assigned · ⚔️ In Progress')
      .setFooter({ text: 'Showing up to 5 active tournaments' });

    for (const tournament of tournaments) {
      const msg = await this.db.get<{ message_id: string; channel_id: string }>(
        `SELECT message_id, channel_id FROM discord_match_messages WHERE match_id = ? AND message_type = 'announcement' LIMIT 1`,
        [tournament.id]
      );
      const field = this.buildEventField(tournament, msg, this.settings?.guild_id);
      const formatLabel = tournament.format === 'double-elimination' ? 'DE' : 'SE';
      // Insert format badge after game name
      const extraParts = field.value.split(' · ').slice(1);
      field.value = [`🎮 ${tournament.game_name}`, `🏟️ ${formatLabel}`, ...extraParts].join(' · ');
      embed.addFields(field);
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async handleMineCommand(interaction: ChatInputCommandInteraction) {
    const discordUserId = interaction.user.id;

    const matches = await this.db.all<{
      id: string; name: string; status: string; start_date: string | null; game_name: string;
    }>(`
      SELECT m.id, m.name, m.status, m.start_date, g.name as game_name
      FROM match_participants mp
      JOIN matches m ON mp.match_id = m.id
      JOIN games g ON m.game_id = g.id
      WHERE mp.discord_user_id = ?
        AND m.status IN ('gather', 'assign', 'battle')
      ORDER BY m.start_date ASC
    `, [discordUserId]);

    const tournaments = await this.db.all<{
      id: string; name: string; status: string; start_date: string | null; game_name: string;
    }>(`
      SELECT t.id, t.name, t.status, t.start_date, g.name as game_name
      FROM tournament_participants tp
      JOIN tournaments t ON tp.tournament_id = t.id
      JOIN games g ON t.game_id = g.id
      WHERE tp.discord_user_id = ?
        AND t.status IN ('gather', 'assign', 'battle')
      ORDER BY t.start_date ASC
    `, [discordUserId]);

    if (!matches.length && !tournaments.length) {
      await interaction.reply({ content: 'You have no active match or tournament signups.', flags: MessageFlags.Ephemeral });
      return;
    }

    const showLabels = matches.length > 0 && tournaments.length > 0;

    const embed = new EmbedBuilder()
      .setTitle('📋 Your Signups')
      .setColor(0x5865F2);

    if (matches.length) {
      if (showLabels) embed.addFields({ name: 'Matches', value: '​', inline: false });
      for (const match of matches) {
        const msg = await this.db.get<{ message_id: string; channel_id: string }>(
          `SELECT message_id, channel_id FROM discord_match_messages WHERE match_id = ? AND message_type = 'announcement' LIMIT 1`,
          [match.id]
        );
        embed.addFields(this.buildEventField(match, msg, this.settings?.guild_id));
      }
    }

    if (tournaments.length) {
      if (showLabels) embed.addFields({ name: 'Tournaments', value: '​', inline: false });
      for (const tournament of tournaments) {
        const msg = await this.db.get<{ message_id: string; channel_id: string }>(
          `SELECT message_id, channel_id FROM discord_match_messages WHERE match_id = ? AND message_type = 'announcement' LIMIT 1`,
          [tournament.id]
        );
        embed.addFields(this.buildEventField(tournament, msg, this.settings?.guild_id));
      }
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  private async getPreSignupDenial(eventId: string, userId: string, isTournament: boolean): Promise<string | null> {
    if (!isTournament) {
      const matchData = await this.db.get<{ tournament_id: string | null }>('SELECT tournament_id FROM matches WHERE id = ?', [eventId]);
      if (matchData?.tournament_id) return '❌ This is a tournament match - participants are assigned from the tournament bracket. You cannot sign up directly.';
    }
    if (await checkExistingParticipant(this.db, eventId, userId, isTournament)) return '✅ You are already signed up for this event!';
    return null;
  }

  async handleButtonInteraction(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith('signup_')) return;

    const eventId = interaction.customId.replace('signup_', '');
    const isTournament = eventId.startsWith('tournament_');

    try {
      if (!this.db) return;

      const denial = await this.getPreSignupDenial(eventId, interaction.user.id, isTournament);
      if (denial) { await interaction.reply({ content: denial, flags: MessageFlags.Ephemeral }); return; }

      // NOTE: We cannot defer this interaction because it may show a modal, and showModal() must
      // be the immediate response. We rely on signup form pre-loading at bot startup so
      // loadSignupForm() is instant (cache hit), keeping total time under Discord's 3-second limit.

      const { isFull, eventData } = await checkEventCapacity(this.db, eventId, isTournament);
      if (isFull) { await interaction.reply({ content: '❌ This event is full!', flags: MessageFlags.Ephemeral }); return; }
      if (!eventData) { await interaction.reply({ content: '❌ Event not found!', flags: MessageFlags.Ephemeral }); return; }

      if (isTournament && eventData.allow_player_team_selection === 1) {
        const teamSelectionShown = await showTeamSelectionMenu(interaction, this.db, eventId);
        if (teamSelectionShown) return;
      }

      await showSignupModal(interaction, eventId, eventData.game_id);

    } catch (error) {
      logger.error('❌ Error handling signup button:', error);
      await interaction.reply({ content: '❌ An error occurred. Please try again.', flags: MessageFlags.Ephemeral });
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

      // Send welcome DM to the player if enabled
      if (this.settings?.signup_dm_enabled) {
        const eventRow = await this.db.get<{
          name: string;
          game_name: string;
          game_color?: string;
          start_date?: string;
        }>(
          parsedId.isTournament
            ? `SELECT t.name, g.name as game_name, g.color as game_color, t.start_date
               FROM tournaments t LEFT JOIN games g ON t.game_id = g.id WHERE t.id = ?`
            : `SELECT m.name, g.name as game_name, g.color as game_color, m.start_date
               FROM matches m LEFT JOIN games g ON m.game_id = g.id WHERE m.id = ?`,
          [parsedId.eventId]
        );
        if (eventRow) {
          let announcementUrl: string | null = null;
          if (interaction.guildId) {
            const msgRow = await this.db.get<{ message_id: string; channel_id: string }>(
              `SELECT message_id, channel_id FROM discord_match_messages WHERE match_id = ? AND message_type = 'announcement' LIMIT 1`,
              [parsedId.eventId]
            );
            if (msgRow) {
              announcementUrl = `https://discord.com/channels/${interaction.guildId}/${msgRow.channel_id}/${msgRow.message_id}`;
            }
          }
          const embed = buildSignupWelcomeEmbed(
            eventRow.name,
            eventRow.game_name,
            eventRow.game_color,
            eventRow.start_date,
            parsedId.isTournament,
            this.settings.player_reminder_minutes,
            announcementUrl
          );
          await sendDM(this.client, interaction.user.id, embed);
        }
      }

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
          .setTitle(capTitle(`Sign Up - ${team.team_name}`, 45));

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