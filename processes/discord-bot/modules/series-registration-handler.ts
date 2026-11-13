import type { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';
import {
  ActionRowBuilder, MessageFlags, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { db as pgDb, type Executor } from '../../../lib/db';
import { logger } from '../../../src/lib/logger/server';
import {
  MAX_TEAM_NAME_LENGTH, MAX_TEAM_TAG_LENGTH, SeriesError, getSeriesById, joinSeriesEntrant, leaveSeries, listJoinableEntrants,
  TEAM_CREATION_DISABLED, registerForSeries, teamCreationAllowed, type RegistrationPlayer,
} from '../../../src/lib/series';
import { capTitle } from './utils';
import { SERIES_JOIN_PREFIX, SERIES_LEAVE_PREFIX, SERIES_REGISTER_PREFIX } from './series-update-handler';

/** Modal (team name / tag) and select menu ids of the registration flow; the buttons live in `series-update-handler`. */
export const SERIES_TEAM_MODAL_PREFIX = 'series_regteam:';
export const SERIES_JOIN_SELECT_PREFIX = 'series_joinsel:';

const SELECT_MAX_OPTIONS = 25;
const GENERIC_ERROR = '❌ Something went wrong. Please try again.';

type AnyInteraction = ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction;

/** Name shown on the roster: server nickname, else global display name, else username. */
function playerOf(interaction: AnyInteraction): RegistrationPlayer {
  const member = interaction.member as { displayName?: unknown } | null;
  const nickname = typeof member?.displayName === 'string' && member.displayName ? member.displayName : null;
  return {
    user_id: interaction.user.id,
    discord_user_id: interaction.user.id,
    username: nickname ?? interaction.user.globalName ?? interaction.user.username,
  };
}

/**
 * Discord side of series registration (the buttons of the `registration_open` post): register (solo, or a team via a
 * modal), join a team (ephemeral select) and leave. The rules live in `src/lib/series/registration.ts`; rejections
 * (series not in registration, already on a roster, roster full, ...) come back as `SeriesError`s and are shown to the
 * player as ephemeral replies. The handlers return true when the interaction was theirs.
 */
export class SeriesRegistrationHandler {
  constructor(private ex: Executor = pgDb) {}

  async handleButton(interaction: ButtonInteraction): Promise<boolean> {
    const id = interaction.customId;
    if (id.startsWith(SERIES_REGISTER_PREFIX)) await this.guarded(interaction, () => this.onRegister(interaction, id.slice(SERIES_REGISTER_PREFIX.length)));
    else if (id.startsWith(SERIES_JOIN_PREFIX)) await this.guarded(interaction, () => this.onJoin(interaction, id.slice(SERIES_JOIN_PREFIX.length)));
    else if (id.startsWith(SERIES_LEAVE_PREFIX)) await this.guarded(interaction, () => this.onLeave(interaction, id.slice(SERIES_LEAVE_PREFIX.length)));
    else return false;
    return true;
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean> {
    const id = interaction.customId;
    if (!id.startsWith(SERIES_TEAM_MODAL_PREFIX)) return false;
    await this.guarded(interaction, () => this.onTeamModal(interaction, id.slice(SERIES_TEAM_MODAL_PREFIX.length)));
    return true;
  }

  async handleStringSelectMenu(interaction: StringSelectMenuInteraction): Promise<boolean> {
    const id = interaction.customId;
    if (!id.startsWith(SERIES_JOIN_SELECT_PREFIX)) return false;
    await this.guarded(interaction, () => this.onJoinSelect(interaction, id.slice(SERIES_JOIN_SELECT_PREFIX.length)));
    return true;
  }

  // ─── flows ─────────────────────────────────────────────────────────────────

  private async onRegister(interaction: ButtonInteraction, seriesId: string): Promise<void> {
    const series = await getSeriesById(this.ex, seriesId);
    if (!series) {
      await this.reply(interaction, '❌ This series no longer exists.');
      return;
    }
    if (series.status !== 'registration') {
      await this.reply(interaction, '❌ Registration for this series is not open.');
      return;
    }

    if (series.entrant_type === 'team') {
      // Older posts may still show the Register button after the organizer turned team creation off.
      if (!teamCreationAllowed(series)) {
        await this.reply(interaction, `❌ ${TEAM_CREATION_DISABLED}`);
        return;
      }
      // A modal must be the first response to the interaction, so the status check above is the only pre-check.
      const modal = new ModalBuilder().setCustomId(`${SERIES_TEAM_MODAL_PREFIX}${seriesId}`).setTitle(capTitle(`Register a team - ${series.name}`, 45));
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('team_name').setLabel('Team name').setStyle(TextInputStyle.Short)
            .setRequired(true).setMaxLength(MAX_TEAM_NAME_LENGTH),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('team_tag').setLabel('Team tag (optional)').setStyle(TextInputStyle.Short)
            .setRequired(false).setMaxLength(MAX_TEAM_TAG_LENGTH),
        ),
      );
      await interaction.showModal(modal);
      return;
    }

    const result = await registerForSeries(this.ex, seriesId, playerOf(interaction));
    await this.reply(interaction, `✅ You are registered for **${series.name}** as **${result.entrant_name}**. An organizer will confirm your entry.`);
  }

  private async onTeamModal(interaction: ModalSubmitInteraction, seriesId: string): Promise<void> {
    const name = interaction.fields.getTextInputValue('team_name');
    let tag = '';
    try {
      tag = interaction.fields.getTextInputValue('team_tag');
    } catch {
      // optional field not present in the submission
    }
    const result = await registerForSeries(this.ex, seriesId, playerOf(interaction), { team: { name, tag } });
    await this.reply(interaction, `✅ Team **${result.entrant_name}** is registered and you are its captain. Teammates can use **Join team** to hop on. An organizer will confirm the entry.`);
  }

  private async onJoin(interaction: ButtonInteraction, seriesId: string): Promise<void> {
    const series = await getSeriesById(this.ex, seriesId);
    if (!series) {
      await this.reply(interaction, '❌ This series no longer exists.');
      return;
    }
    if (series.status !== 'registration') {
      await this.reply(interaction, '❌ Registration for this series is not open.');
      return;
    }
    if (series.entrant_type !== 'team') {
      await this.reply(interaction, '❌ This series has solo entrants; use **Register** instead.');
      return;
    }

    const joinable = await listJoinableEntrants(this.ex, seriesId);
    if (joinable.length === 0) {
      await this.reply(interaction, teamCreationAllowed(series)
        ? '❌ There is no team with a free spot. Register a new team instead.'
        : '❌ There is no team with a free spot. Ask an organizer to add a team.');
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${SERIES_JOIN_SELECT_PREFIX}${seriesId}`)
      .setPlaceholder('Select a team to join')
      .addOptions(joinable.slice(0, SELECT_MAX_OPTIONS).map((t) => ({
        label: capTitle(t.tag ? `[${t.tag}] ${t.name}` : t.name, 100),
        value: t.id,
        description: t.roster_max === null ? `${t.member_count} player(s)` : `${t.member_count}/${t.roster_max} players`,
      })));
    await interaction.reply({
      content: '👥 Select the team you want to join:',
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
  }

  private async onJoinSelect(interaction: StringSelectMenuInteraction, seriesId: string): Promise<void> {
    const result = await joinSeriesEntrant(this.ex, seriesId, interaction.values[0], playerOf(interaction));
    await interaction.update({ content: `✅ You joined **${result.entrant_name}**.`, components: [] });
  }

  private async onLeave(interaction: ButtonInteraction, seriesId: string): Promise<void> {
    const result = await leaveSeries(this.ex, seriesId, playerOf(interaction));
    await this.reply(interaction, result.entrant_deleted
      ? `✅ You left **${result.entrant_name}**. The team had no other players, so it was removed.`
      : `✅ You left **${result.entrant_name}**.`);
  }

  // ─── plumbing ──────────────────────────────────────────────────────────────

  private async reply(interaction: AnyInteraction, content: string): Promise<void> {
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }

  /** Runs a flow; domain rejections become an ephemeral "❌ reason", anything else a generic ephemeral error. */
  private async guarded(interaction: AnyInteraction, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      if (error instanceof SeriesError) {
        await this.reply(interaction, `❌ ${error.message}`).catch((e) => logger.error('Failed to send series registration rejection:', e));
        return;
      }
      logger.error('Error handling series registration interaction:', error);
      await this.reply(interaction, GENERIC_ERROR).catch(() => undefined);
    }
  }
}
