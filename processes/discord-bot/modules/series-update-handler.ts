import type { Client } from 'discord.js';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { eq } from 'drizzle-orm';
import type { DiscordChannel, DiscordSettings } from '../../../shared/types';
import type { SeriesStandingsMode, SeriesUpdateKind, SeriesUpdatePayload } from '../../../shared/series-types';
import { db as pgDb, type Executor } from '../../../lib/db';
import { seriesEvents } from '../../../lib/db/schema';
import { logger } from '../../../src/lib/logger/server';
import { getGameDisplay } from '../../../src/lib/games';
import { getTournament, listTeamsByName } from '../../../src/lib/tournaments';
import {
  describeSeasonLayout, eventWeek, getSeriesById, getSeriesChampion, getSeriesStandingsResponse, listBatches, listEntrants, listSeriesEventDtos,
  listStages, sameWeek, weekLabel, type SeriesRow, type WeekRef,
} from '../../../src/lib/series';
import { capTitle, Utils } from './utils';
import { imageExtension, loadImage } from '../utils/image-source';

/** Which channel flag each kind of series post goes to (see docs/series-plan.md section 5). */
export const SERIES_UPDATE_CHANNEL_TYPE = {
  registration_open: 'announcements',
  playoff_seeded: 'match_start',
  champion: 'match_start',
  weekly_schedule: 'series_updates',
  standings: 'series_updates',
} as const satisfies Record<SeriesUpdateKind, 'announcements' | 'match_start' | 'series_updates'>;

export const SERIES_REGISTER_PREFIX = 'series_reg:';
export const SERIES_JOIN_PREFIX = 'series_join:';
export const SERIES_LEAVE_PREFIX = 'series_leave:';

const STANDINGS_TOP = 10;
const NAME_WIDTH = 18;
const DESCRIPTION_LIMIT = 4000;

/** The week a schedule / standings payload is about (season week, or calendar week when `calendar_year` is set). */
function payloadWeek(payload: SeriesUpdatePayload): WeekRef | null {
  if (payload.week === undefined) return null;
  return payload.calendar_year === undefined ? { week: payload.week } : { week: payload.week, calendarYear: payload.calendar_year };
}

/** The queue row fields the handler needs. */
export interface SeriesUpdateJob {
  id: string;
  series_id: string;
  kind: string;
  payload: SeriesUpdatePayload | null;
}

export interface SeriesPostResult {
  /** Channels the post was sent to. */
  posted: number;
  /** Channels that were configured for this kind of post. */
  channels: number;
  /** Id of the first message sent (stored on the job so a retry never double-posts). */
  messageId?: string;
}

interface SeriesMessage {
  content?: string;
  embeds: EmbedBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
  files?: AttachmentBuilder[];
}

/** One line of a standings table, independent of the standings engine's exact row shape. */
export interface StandingsTableRow {
  rank: number;
  name: string;
  total_points: number;
  match_wins?: number;
  match_losses?: number;
  match_ties?: number;
  map_diff?: number;
}

export interface StandingsTable {
  mode: SeriesStandingsMode;
  rows: StandingsTableRow[];
}

const isKind = (kind: string): kind is SeriesUpdateKind => kind in SERIES_UPDATE_CHANNEL_TYPE;

const unix = (d: Date): number => Math.floor(d.getTime() / 1000);

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function rosterText(series: Pick<SeriesRow, 'entrant_type' | 'roster_min' | 'roster_max'>): string {
  if (series.entrant_type === 'solo') return 'Solo players';
  const { roster_min: min, roster_max: max } = series;
  if (min && max) return `Teams of ${min === max ? min : `${min}-${max}`} players`;
  if (max) return `Teams of up to ${max} players`;
  if (min) return `Teams of at least ${min} players`;
  return 'Teams';
}

/**
 * Standings for the table post: the season table of the standings engine, reduced to what the post shows. Isolated here
 * so the engine can change independently.
 */
export async function loadStandingsTable(ex: Executor, seriesId: string): Promise<StandingsTable> {
  const response = await getSeriesStandingsResponse(ex, seriesId);
  return {
    mode: response?.mode ?? 'points',
    rows: (response?.rows ?? []).map((r) => ({
      rank: r.rank, name: r.name, total_points: r.total_points,
      match_wins: r.match_wins, match_losses: r.match_losses, match_ties: r.match_ties, map_diff: r.map_diff,
    })),
  };
}

/** Code-block table of the top rows (head to head: W-L(-T) and map diff, otherwise points). */
export function formatStandingsTable(table: StandingsTable, top = STANDINGS_TOP): string {
  const rows = table.rows.slice(0, top);
  if (rows.length === 0) return 'No results yet.';
  const h2h = table.mode === 'head_to_head';
  const rec = (r: StandingsTableRow): string => {
    const base = `${r.match_wins ?? 0}-${r.match_losses ?? 0}`;
    return r.match_ties ? `${base}-${r.match_ties}` : base;
  };
  const diff = (r: StandingsTableRow): string => `${(r.map_diff ?? 0) > 0 ? '+' : ''}${r.map_diff ?? 0}`;
  const header = h2h ? `${'#'.padStart(2)}  ${'Team'.padEnd(NAME_WIDTH)}  ${'W-L'.padStart(7)}  ${'Diff'.padStart(4)}` : `${'#'.padStart(2)}  ${'Name'.padEnd(NAME_WIDTH)}  ${'Pts'.padStart(6)}`;
  const lines = rows.map((r) => {
    const name = truncate(r.name, NAME_WIDTH).padEnd(NAME_WIDTH);
    const rank = String(r.rank).padStart(2);
    return h2h ? `${rank}  ${name}  ${rec(r).padStart(7)}  ${diff(r).padStart(4)}` : `${rank}  ${name}  ${String(Math.round(r.total_points * 100) / 100).padStart(6)}`;
  });
  return `\`\`\`\n${[header, ...lines].join('\n')}\n\`\`\``;
}

function webLink(seriesId: string): string | null {
  const base = process.env.PUBLIC_URL?.trim().replace(/\/+$/, '');
  return base ? `${base}/series/${seriesId}` : null;
}

export class SeriesUpdateHandler {
  constructor(
    private client: Client,
    private settings: DiscordSettings | null,
    private utils: Utils = new Utils(),
    private ex: Executor = pgDb,
  ) {}

  updateSettings(settings: DiscordSettings | null) {
    this.settings = settings;
  }

  /**
   * Posts one queued series update to its channels. No channel configured -> nothing is sent (logged at info) and the
   * result says so; the caller completes the job. Throws when channels exist but every send failed (the caller fails
   * the job, which retries with backoff).
   */
  async post(job: SeriesUpdateJob): Promise<SeriesPostResult> {
    if (!isKind(job.kind)) throw new Error(`Unknown series update kind: ${job.kind}`);
    const kind = job.kind;

    const series = await getSeriesById(this.ex, job.series_id);
    if (!series) {
      logger.info(`Series ${job.series_id} no longer exists, dropping ${kind} post`);
      return { posted: 0, channels: 0 };
    }

    const channels = await this.utils.getChannelsForNotificationType(SERIES_UPDATE_CHANNEL_TYPE[kind]);
    if (channels.length === 0) {
      logger.info(`No ${SERIES_UPDATE_CHANNEL_TYPE[kind]} channels configured, skipping ${kind} post for series ${series.name}`);
      return { posted: 0, channels: 0 };
    }

    const message = await this.buildMessage(kind, series, job.payload ?? {});
    return this.send(channels, message, kind);
  }

  private async send(channels: DiscordChannel[], message: SeriesMessage, kind: SeriesUpdateKind): Promise<SeriesPostResult> {
    let posted = 0;
    let messageId: string | undefined;
    let lastError: unknown;
    for (const channel of channels) {
      try {
        const target = await this.client.channels.fetch(channel.discord_channel_id);
        if (target?.isTextBased() && 'send' in target) {
          const sent = await target.send(message);
          messageId ??= sent?.id;
          posted++;
        }
      } catch (error) {
        lastError = error;
        logger.error(`Failed to send ${kind} series post to channel ${channel.discord_channel_id}:`, error);
      }
    }
    if (posted === 0) {
      throw lastError instanceof Error ? lastError : new Error(`Could not send the ${kind} series post to any channel`);
    }
    return { posted, channels: channels.length, messageId };
  }

  // ─── message building ──────────────────────────────────────────────────────

  private async buildMessage(kind: SeriesUpdateKind, series: SeriesRow, payload: SeriesUpdatePayload): Promise<SeriesMessage> {
    const embed = new EmbedBuilder().setTimestamp().setFooter({ text: 'MatchExec • Series' });
    embed.setColor(await this.seriesColor(series));
    const message: SeriesMessage = { embeds: [embed] };

    switch (kind) {
      case 'registration_open': await this.fillRegistration(message, embed, series); break;
      case 'weekly_schedule': await this.fillWeeklySchedule(embed, series, payload); break;
      case 'standings': await this.fillStandings(embed, series, payload); break;
      case 'playoff_seeded': await this.fillPlayoffSeeded(embed, series, payload); break;
      case 'champion': await this.fillChampion(embed, series); break;
    }

    // Registration and the champion get the big series banner, schedule / standings a thumbnail
    const attachment = await this.seriesImage(embed, series, kind === 'registration_open' || kind === 'champion' ? 'image' : 'thumbnail');
    if (attachment) message.files = [attachment];
    return message;
  }

  private async seriesColor(series: SeriesRow): Promise<number> {
    if (!series.game_id) return 0x5865f2;
    try {
      const game = await getGameDisplay(this.ex, series.game_id);
      if (game?.color) return this.utils.parseGameColor(game.color);
    } catch (error) {
      logger.error('Error fetching game color for series post:', error);
    }
    return 0x5865f2;
  }

  private async seriesImage(embed: EmbedBuilder, series: SeriesRow, as: 'image' | 'thumbnail'): Promise<AttachmentBuilder | undefined> {
    if (!series.event_image_url?.trim()) return undefined;
    try {
      const image = await loadImage(series.event_image_url);
      if (!image) {
        logger.warning(`Series image not found: ${series.event_image_url}`);
        return undefined;
      }
      const name = `series_image.${imageExtension(image)}`;
      if (as === 'image') embed.setImage(`attachment://${name}`);
      else embed.setThumbnail(`attachment://${name}`);
      return new AttachmentBuilder(image.buffer, { name });
    } catch (error) {
      logger.error(`Error handling series image ${series.event_image_url}:`, error);
      return undefined;
    }
  }

  private mentionText(): string {
    if (this.settings?.mention_everyone) return '@everyone';
    if (this.settings?.announcement_role_id) return `<@&${this.settings.announcement_role_id}>`;
    return '';
  }

  private async gameNames(series: SeriesRow): Promise<string> {
    const fallback = series.game_id ? [series.game_id] : [];
    const ids = series.game_ids.length > 0 ? series.game_ids : fallback;
    const names: string[] = [];
    for (const id of ids) {
      names.push((await getGameDisplay(this.ex, id).catch(() => undefined))?.name ?? id);
    }
    return names.join(', ');
  }

  /** The planned season (round robins, matches, playoffs) in Discord form; empty when nothing is planned. */
  private async layoutLines(series: SeriesRow): Promise<string[]> {
    try {
      const [batches, events, stages] = await Promise.all([listBatches(this.ex, series.id), listSeriesEventDtos(this.ex, series.id), listStages(this.ex, series.id)]);
      const stageDtos = stages.map((s) => ({ id: s.id, name: s.name }));
      return describeSeasonLayout({ batches, events, stages: stageDtos }, {
        // config dates are YYYY-MM-DD (a calendar day at noon UTC never shifts a day); instants are shown as given
        date: (value) => `<t:${unix(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value))}:D>`,
      });
    } catch (error) {
      logger.error(`Series ${series.id}: failed to describe the season layout:`, error);
      return [];
    }
  }

  private async fillRegistration(message: SeriesMessage, embed: EmbedBuilder, series: SeriesRow): Promise<void> {
    embed
      .setTitle(capTitle(`📝 Registration open: ${series.name}`))
      .setDescription(series.description?.trim() || 'Registration is now open. Use the buttons below to sign up.');

    const games = await this.gameNames(series);
    if (games) embed.addFields({ name: '🎯 Game', value: games, inline: true });
    embed.addFields({ name: '👥 Format', value: rosterText(series), inline: true });
    if (series.start_date) {
      const when = series.end_date ? `<t:${unix(series.start_date)}:D> - <t:${unix(series.end_date)}:D>` : `Starts <t:${unix(series.start_date)}:D>`;
      embed.addFields({ name: '📅 Season', value: when, inline: true });
    }
    const entrants = await listEntrants(this.ex, series.id, { statuses: ['pending', 'active'] });
    embed.addFields({ name: '📋 Registered so far', value: String(entrants.length), inline: true });
    const layout = await this.layoutLines(series);
    if (layout.length > 0) embed.addFields({ name: '🗓️ Season layout', value: truncate(layout.map((l) => `• ${l}`).join('\n'), 1024), inline: false });
    if (series.livestream_link) embed.addFields({ name: '📺 Livestream', value: `[Watch Live](${series.livestream_link})`, inline: false });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${SERIES_REGISTER_PREFIX}${series.id}`)
        .setLabel(series.entrant_type === 'team' ? '📝 Register a team' : '📝 Register').setStyle(ButtonStyle.Primary),
    );
    if (series.entrant_type === 'team') {
      row.addComponents(
        new ButtonBuilder().setCustomId(`${SERIES_JOIN_PREFIX}${series.id}`).setLabel('👥 Join team').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${SERIES_LEAVE_PREFIX}${series.id}`).setLabel('Leave').setStyle(ButtonStyle.Danger),
      );
    }
    message.components = [row];
    const mention = this.mentionText();
    if (mention) message.content = mention;
  }

  private async fillWeeklySchedule(embed: EmbedBuilder, series: SeriesRow, payload: SeriesUpdatePayload): Promise<void> {
    const week = payloadWeek(payload);
    if (!week) throw new Error('A weekly_schedule post needs a week');
    const [events, stages] = await Promise.all([listSeriesEventDtos(this.ex, series.id), listStages(this.ex, series.id)]);
    const stageName = new Map(stages.map((s) => [s.id, s.name]));

    const inWeek = events
      .filter((e) => e.status === 'live' && e.target_status !== 'cancelled')
      .map((e) => ({ e, start: e.start_date ? new Date(e.start_date) : null }))
      .filter(({ e, start }) => sameWeek(eventWeek({ week: e.week, start }), week))
      .sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity) || a.e.event_order - b.e.event_order);

    const lines = inWeek.map(({ e, start }) => {
      const when = start ? `<t:${unix(start)}:F>` : 'Time TBD';
      const title = e.entrants?.length === 2 ? `${e.entrants[0].name} vs ${e.entrants[1].name}` : (e.name ?? 'Event');
      const stage = e.stage_id ? stageName.get(e.stage_id) : undefined;
      return `${when} - **${title}**${stage ? ` (${stage})` : ''}`;
    });

    embed.setTitle(capTitle(`📅 ${series.name} - ${weekLabel(week)}`));
    embed.setDescription(this.capDescription(lines, 'No events scheduled for this week.'));
  }

  private capDescription(lines: string[], empty: string): string {
    if (lines.length === 0) return empty;
    const kept: string[] = [];
    let size = 0;
    for (const line of lines) {
      if (size + line.length + 1 > DESCRIPTION_LIMIT - 40) break;
      kept.push(line);
      size += line.length + 1;
    }
    if (kept.length < lines.length) kept.push(`...and ${lines.length - kept.length} more`);
    return kept.join('\n');
  }

  private async fillStandings(embed: EmbedBuilder, series: SeriesRow, payload: SeriesUpdatePayload): Promise<void> {
    const table = await loadStandingsTable(this.ex, series.id);
    const suffix = table.rows.length > STANDINGS_TOP ? `\n...and ${table.rows.length - STANDINGS_TOP} more` : '';
    const link = webLink(series.id);
    const week = payloadWeek(payload);
    embed.setTitle(capTitle(`📊 ${series.name} - Standings${week ? ` after ${weekLabel(week).toLowerCase()}` : ''}`));
    embed.setDescription(`${formatStandingsTable(table)}${suffix}${link ? `\n[View full standings](${link})` : ''}`);
    if (payload.pending_weeks && payload.pending_weeks.length > 0) {
      embed.addFields({
        name: '⏳ Still to be played',
        value: truncate(`${payload.pending_weeks.join(', ')} still ${payload.pending_weeks.length === 1 ? 'has' : 'have'} unplayed matches, so these standings may change.`, 1024),
        inline: false,
      });
    }
  }

  private async playoffTournamentId(payload: SeriesUpdatePayload): Promise<string | undefined> {
    if (payload.tournament_id) return payload.tournament_id;
    if (!payload.event_id) return undefined;
    const [row] = await this.ex.select({ tournament_id: seriesEvents.tournament_id }).from(seriesEvents).where(eq(seriesEvents.id, payload.event_id));
    return row?.tournament_id ?? undefined;
  }

  private async fillPlayoffSeeded(embed: EmbedBuilder, series: SeriesRow, payload: SeriesUpdatePayload): Promise<void> {
    const tournamentId = await this.playoffTournamentId(payload);
    const tournament = tournamentId ? await getTournament(this.ex, tournamentId) : undefined;
    embed.setTitle(capTitle(`🏅 ${tournament?.name ?? 'Playoffs'} - seeding is set`));
    embed.setDescription(`The playoffs of **${series.name}** are seeded.`);

    let qualifiers = (payload.qualifiers ?? []).slice().sort((a, b) => a.seed - b.seed).map((q) => `**#${q.seed}** ${q.name}`);
    if (qualifiers.length === 0 && tournamentId) {
      qualifiers = (await listTeamsByName(this.ex, tournamentId)).map((t) => `- ${t.team_name}`);
    }
    if (qualifiers.length > 0) embed.addFields({ name: '🎟️ Qualifiers', value: truncate(qualifiers.join('\n'), 1024), inline: false });
    if (tournament?.start_date) embed.addFields({ name: '🕐 Starts', value: `<t:${unix(tournament.start_date)}:F>`, inline: false });
    const link = webLink(series.id);
    if (link) embed.addFields({ name: '🔗 Bracket', value: `[View on the web](${link})`, inline: false });
  }

  /** The champion: the series' champion lookup (season playoff winner, else the table leader), else rank 1 of the table. */
  private async championName(series: SeriesRow): Promise<string | null> {
    const champion = await getSeriesChampion(this.ex, series.id);
    if (champion?.name) return champion.name;
    return (await loadStandingsTable(this.ex, series.id)).rows[0]?.name ?? null;
  }

  private async fillChampion(embed: EmbedBuilder, series: SeriesRow): Promise<void> {
    const champion = await this.championName(series);
    embed.setTitle(capTitle(`🏆 ${series.name} - Champion`));
    embed.setDescription(champion ? `Congratulations to **${champion}**, champion of **${series.name}**!` : `**${series.name}** has concluded.`);
    const link = webLink(series.id);
    if (link) embed.addFields({ name: '📊 Final standings', value: `[View on the web](${link})`, inline: false });
  }
}
