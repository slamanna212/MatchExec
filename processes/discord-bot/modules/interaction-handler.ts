import {
  Client,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  REST,
  Routes,
  MessageFlags,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction
} from 'discord.js';
import { Database } from '../../../lib/database/connection';
import { DiscordSettings } from '../../../shared/types';

// Import SignupFormLoader
import { SignupFormLoader } from '../../../lib/signup-forms';

export class InteractionHandler {
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
      console.warn('⚠️ Missing bot token or guild ID, skipping command registration');
      return;
    }

    const commands = [
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check bot status and configuration')
    ];

    try {
      const rest = new REST().setToken(this.settings.bot_token);
      

      await rest.put(
        Routes.applicationGuildCommands(this.client.user!.id, this.settings.guild_id),
        { body: commands }
      );

    } catch (error) {
      console.error('❌ Error registering slash commands:', error);
    }
  }

  async handleSlashCommand(interaction: ChatInputCommandInteraction) {
    const { commandName } = interaction;

    try {
      switch (commandName) {
        case 'status':
          await this.handleStatusCommand(interaction);
          break;
        default:
          await interaction.reply({
            content: '❌ Unknown command.',
            flags: MessageFlags.Ephemeral
          });
      }
    } catch (error) {
      console.error('❌ Error handling slash command:', error);
      
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

  async handleButtonInteraction(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith('signup_')) return;

    const eventId = interaction.customId.replace('signup_', '');
    const isTournament = eventId.startsWith('tournament_');

    try {
      // Check if user is already signed up
      if (this.db) {

        let existingParticipant = null;
        if (isTournament) {
          existingParticipant = await this.db.get(`
            SELECT id FROM tournament_participants
            WHERE tournament_id = ? AND user_id = ?
          `, [eventId, interaction.user.id]);
        } else {
          existingParticipant = await this.db.get(`
            SELECT id FROM match_participants
            WHERE match_id = ? AND user_id = ?
          `, [eventId, interaction.user.id]);
        }

        if (existingParticipant) {
          await interaction.reply({
            content: '✅ You are already signed up for this event!',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Check if event is full
        let participantCount = null;
        if (isTournament) {
          participantCount = await this.db.get<{count: number}>(`
            SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = ?
          `, [eventId]);
        } else {
          participantCount = await this.db.get<{count: number}>(`
            SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?
          `, [eventId]);
        }

        let eventData: {max_signups: number, game_id: string, allow_player_team_selection?: number} | null = null;

        if (isTournament) {
          eventData = await this.db.get<{max_signups: number, game_id: string, allow_player_team_selection?: number}>(`
            SELECT t.game_id, COALESCE(t.max_participants, 999999) as max_signups, t.allow_player_team_selection
            FROM tournaments t
            WHERE t.id = ?
          `, [eventId]) || null;
        } else {
          eventData = await this.db.get<{max_signups: number, game_id: string}>(`
            SELECT m.game_id, g.max_signups
            FROM matches m
            JOIN games g ON m.game_id = g.id
            WHERE m.id = ?
          `, [eventId]) || null;
        }

        if ((participantCount?.count ?? 0) >= (eventData?.max_signups || 16)) {
          await interaction.reply({
            content: '❌ This event is full!',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Check if tournament has team selection enabled
        if (isTournament && eventData?.allow_player_team_selection === 1) {
          // Fetch available teams
          const teams = await this.db.all<{id: string, team_name: string}>(`
            SELECT id, team_name FROM tournament_teams
            WHERE tournament_id = ?
            ORDER BY team_name ASC
          `, [eventId]);

          if (teams && teams.length > 0) {
            // Show team selection dropdown
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId(`team_select_${eventId}`)
              .setPlaceholder('Select a team')
              .addOptions(teams.map(team => ({
                label: team.team_name,
                value: team.id,
                description: `Join ${team.team_name}`
              })));

            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
              .addComponents(selectMenu);

            await interaction.reply({
              content: '👥 Please select a team to join:',
              components: [row],
              flags: MessageFlags.Ephemeral
            });
            return;
          }
        }

        // Load the game-specific signup form
        const signupForm = await SignupFormLoader.loadSignupForm(eventData?.game_id || '');
        if (!signupForm) {
          await interaction.reply({
            content: '❌ Could not load signup form. Please try again.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Create dynamic modal based on signup form
        const modal = new ModalBuilder()
          .setCustomId(`signup_form_${eventId}`)
          .setTitle('Event Sign Up');

        const rows: ActionRowBuilder<TextInputBuilder>[] = [];

        for (let i = 0; i < Math.min(signupForm.fields.length, 5); i++) { // Discord modal limit is 5 components
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
      console.error('❌ Error handling signup button:', error);
      await interaction.reply({
        content: '❌ An error occurred. Please try again.',
        flags: MessageFlags.Ephemeral
      });
    }
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith('signup_form_')) return;

    // Check if this is a team-based signup (format: signup_form_team_{tournamentId}_{teamId})
    let selectedTeamId: string | null = null;
    let eventId: string;

    if (interaction.customId.startsWith('signup_form_team_')) {
      // Remove the prefix to get: tournament_{timestamp}_{random}_team_{timestamp}_{random}
      const withoutPrefix = interaction.customId.replace('signup_form_team_', '');

      // Find the position of the second occurrence of "team_" which starts the team ID
      const teamIdMarker = withoutPrefix.indexOf('team_', 'tournament_'.length);

      if (teamIdMarker > 0) {
        eventId = withoutPrefix.substring(0, teamIdMarker - 1); // -1 to remove trailing underscore
        selectedTeamId = withoutPrefix.substring(teamIdMarker);
      } else {
        // Fallback if parsing fails
        eventId = interaction.customId.replace('signup_form_', '');
      }
    } else {
      eventId = interaction.customId.replace('signup_form_', '');
    }

    const isTournament = eventId.startsWith('tournament_');

    try {
      if (this.db) {
        // Get game ID to load the signup form structure

        let eventData: {game_id: string} | null = null;

        if (isTournament) {
          eventData = await this.db.get<{game_id: string}>(`
            SELECT game_id FROM tournaments WHERE id = ?
          `, [eventId]) || null;
        } else {
          eventData = await this.db.get<{game_id: string}>(`
            SELECT game_id FROM matches WHERE id = ?
          `, [eventId]) || null;
        }

        if (!eventData) {
          throw new Error('Event not found');
        }

        // Load signup form to get field structure
        const signupForm = await SignupFormLoader.loadSignupForm(eventData.game_id);
        if (!signupForm) {
          throw new Error('Could not load signup form');
        }

        // Collect all form data
        const signupData: {[key: string]: string} = {};
        let displayUsername = interaction.user.username; // fallback

        for (const field of signupForm.fields) {
          try {
            const value = interaction.fields.getTextInputValue(field.id);
            signupData[field.id] = value;

            // Use the first field as the display username (usually username/battlenet_name)
            if (field.id === 'username' || field.id === 'battlenet_name') {
              displayUsername = value;
            }
          } catch {
            // Field might not exist in modal if we hit the 5-field limit
            if (field.required) {
              throw new Error(`Required field ${field.id} is missing`);
            }
          }
        }

        // Generate participant ID
        const participantId = `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Add participant to database with signup data and Discord user ID
        if (isTournament) {
          // Insert participant with team assignment if team was selected
          await this.db.run(`
            INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username, signup_data, team_assignment)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [participantId, eventId, interaction.user.id, interaction.user.id, displayUsername, JSON.stringify(signupData), selectedTeamId]);

          // If team was selected, also add to tournament_team_members
          if (selectedTeamId) {
            const memberId = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await this.db.run(`
              INSERT INTO tournament_team_members (id, team_id, user_id, discord_user_id, username)
              VALUES (?, ?, ?, ?, ?)
            `, [memberId, selectedTeamId, interaction.user.id, interaction.user.id, displayUsername]);
          }
        } else {
          await this.db.run(`
            INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, signup_data)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [participantId, eventId, interaction.user.id, interaction.user.id, displayUsername, JSON.stringify(signupData)]);
        }

        // Get current participant count
        let participantCount = null;
        if (isTournament) {
          participantCount = await this.db.get<{count: number}>(`
            SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = ?
          `, [eventId]);
        } else {
          participantCount = await this.db.get<{count: number}>(`
            SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?
          `, [eventId]);
        }

        // Create confirmation message with submitted data
        let confirmationMessage = `✅ Successfully signed up for the event!\n`;

        // Show team name if selected
        if (selectedTeamId) {
          const team = await this.db.get<{team_name: string}>(`
            SELECT team_name FROM tournament_teams WHERE id = ?
          `, [selectedTeamId]);
          if (team) {
            confirmationMessage += `**Team:** ${team.team_name}\n`;
          }
        }

        // Show key information from the signup form
        for (const field of signupForm.fields.slice(0, 3)) { // Show first 3 fields
          if (signupData[field.id]) {
            const label = field.label.replace(/\s*\(Optional\)\s*$/i, ''); // Remove "(Optional)" from display
            confirmationMessage += `**${label}:** ${signupData[field.id]}\n`;
          }
        }

        confirmationMessage += `**Participants:** ${participantCount?.count || 1}`;

        await interaction.reply({
          content: confirmationMessage,
          flags: MessageFlags.Ephemeral
        });

        // Send signup notification to configured channels
        await this.sendSignupNotification(eventId, {
          username: displayUsername,
          discordUserId: interaction.user.id,
          signupData: signupData,
          participantCount: participantCount?.count || 1
        });

      } else {
        throw new Error('Database not available');
      }

    } catch (error) {
      console.error('❌ Error processing signup:', error);
      
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

        // Create modal with team ID embedded in custom ID
        const modal = new ModalBuilder()
          .setCustomId(`signup_form_team_${eventId}_${selectedTeamId}`)
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
      console.error('❌ Error handling team selection:', error);
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