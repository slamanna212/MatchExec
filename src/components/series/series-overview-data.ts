import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger/client';
import type { SeriesBatchDto, SeriesEntrantDto, SeriesStageDto, SeriesStandingsResponse } from '@/shared/series-types';
import { entrantsApi } from './series-entrants-api';
import { scheduleApi } from './series-schedule-api';
import type { SeriesEventView, SeriesSummary } from './series-shared';
import type { SeriesTab } from './series-detail-page';

/** Text channels that receive each kind of series post (registration -> announcements, schedule/standings -> series updates). */
export interface ChannelCounts {
  announcements: number;
  seriesUpdates: number;
}

/** What the overview loads on top of the page's series + events. `null` = not needed for this status, or the request failed. */
export interface OverviewData {
  entrants: SeriesEntrantDto[] | null;
  stages: SeriesStageDto[] | null;
  standings: SeriesStandingsResponse | null;
  channels: ChannelCounts | null;
}

const EMPTY: OverviewData = { entrants: null, stages: null, standings: null, channels: null };

interface ChannelRow { channel_type?: string; send_announcements?: boolean; send_series_updates?: boolean }

async function loadChannelCounts(): Promise<ChannelCounts> {
  const res = await fetch('/api/channels');
  if (!res.ok) throw new Error(`Failed to load channels (HTTP ${res.status})`);
  const rows = (await res.json()) as ChannelRow[];
  const text = rows.filter((c) => c.channel_type !== 'voice');
  return {
    announcements: text.filter((c) => c.send_announcements).length,
    seriesUpdates: text.filter((c) => c.send_series_updates).length,
  };
}

/** A failed optional section must not break the overview: log it and render without that section. */
async function optional<T>(label: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    logger.error(`Error loading series overview ${label}:`, err);
    return null;
  }
}

/** Loads the per-status extras of the overview; reloads whenever `refreshToken` changes (the page's poll / after edits). */
export function useOverviewData(series: SeriesSummary, refreshToken: number): OverviewData {
  const [data, setData] = useState<OverviewData>(EMPTY);
  const { id, status } = series;

  useEffect(() => {
    let cancelled = false;
    const wantsStandings = status === 'active' || status === 'complete';
    const wantsChannels = status === 'created';
    void Promise.all([
      optional('entrants', () => entrantsApi.list(id)),
      optional('stages', () => scheduleApi.listStages(id)),
      wantsStandings ? optional('standings', () => scheduleApi.standings(id, 'season', 'entrant')) : Promise.resolve(null),
      wantsChannels ? optional('channels', loadChannelCounts) : Promise.resolve(null),
    ]).then(([entrants, stages, standings, channels]) => {
      if (cancelled) return;
      setData({
        entrants,
        stages: stages ? [...stages].sort((a, b) => a.stage_order - b.stage_order) : null,
        standings,
        channels,
      });
    });
    return () => { cancelled = true; };
  }, [id, status, refreshToken]);

  return data;
}

// ─── draft checklist ─────────────────────────────────────────────────────────

export type ChecklistState = 'done' | 'todo' | 'optional' | 'warn';

export interface ChecklistItem {
  key: 'details' | 'events' | 'stages' | 'entrants' | 'discord';
  label: string;
  description: string;
  state: ChecklistState;
  action?: { label: string; tab?: SeriesTab; href?: string };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Players can sign up from Discord once registration opens (announcements on and registration posts not switched off). */
export function usesDiscordRegistration(series: Pick<SeriesSummary, 'announcements' | 'discord_config'>): boolean {
  return series.announcements && series.discord_config?.registration_posts !== false;
}

/**
 * What a draft series still needs before it is announced. Only `todo` items block "ready"; `warn` items are worth a look
 * (a post type with no channel), `optional` ones are suggestions.
 */
export function buildSetupChecklist(
  series: Pick<SeriesSummary, 'id' | 'announcements' | 'discord_config' | 'entrant_type'>,
  events: readonly SeriesEventView[],
  data: OverviewData,
  batches: readonly SeriesBatchDto[] = [],
): ChecklistItem[] {
  const editHref = `/series/${series.id}/edit`;
  const items: ChecklistItem[] = [
    {
      key: 'details', label: 'Details and scoring', state: 'done',
      description: 'Format, games and scoring are set. You can still change them until the season starts.',
      action: { label: 'Edit', href: editHref },
    },
  ];

  const playoffs = events.filter((e) => e.status === 'planned' && !e.match_template).length;
  const placeholders = events.filter((e) => e.status === 'planned' && e.match_template).length;
  const live = events.filter((e) => e.status === 'live').length;
  const plannedSchedules = batches.filter((b) => b.status === 'planned').length;
  const parts = [
    live > 0 && `${plural(live, 'event')} scheduled`,
    plannedSchedules > 0 && `${plural(plannedSchedules, 'schedule')} generated at registration close`,
    placeholders > 0 && plural(placeholders, 'match placeholder'),
    playoffs > 0 && plural(playoffs, 'playoff placeholder'),
  ].filter(Boolean);
  items.push(parts.length > 0
    ? {
      key: 'events', label: 'Schedule', state: 'done',
      description: `${parts.join(', ')}.`,
      action: { label: 'Open schedule', tab: 'schedule' },
    }
    : {
      key: 'events', label: 'Schedule', state: 'todo',
      description: 'Plan the season (a round robin, matches, playoffs), so players know what they are signing up for. It is generated when registration closes.',
      action: { label: 'Build schedule', tab: 'schedule' },
    });

  if (data.stages) {
    items.push(data.stages.length > 0
      ? { key: 'stages', label: 'Stages', state: 'done', description: data.stages.map((s) => s.name).join(' → '), action: { label: 'Manage', tab: 'schedule' } }
      : {
        key: 'stages', label: 'Stages', state: 'optional',
        description: 'Optional: split the season into stages, for example a regular season and playoffs.',
        action: { label: 'Add stage', tab: 'schedule' },
      });
  }

  if (data.entrants) {
    const who = series.entrant_type === 'team' ? 'team' : 'player';
    const active = data.entrants.filter((e) => e.status === 'active').length;
    if (active >= 2) {
      items.push({ key: 'entrants', label: 'Entrants', state: 'done', description: `${plural(active, who)} ready.`, action: { label: 'Manage', tab: 'entrants' } });
    } else if (usesDiscordRegistration(series)) {
      items.push({
        key: 'entrants', label: 'Entrants', state: 'optional',
        description: `${active > 0 ? `${plural(active, who)} added. ` : ''}Players sign up from the Discord post once you open registration; you can also add or copy entrants now.`,
        action: { label: 'Add entrants', tab: 'entrants' },
      });
    } else {
      items.push({
        key: 'entrants', label: 'Entrants', state: 'todo',
        description: `Registration posts are off, so add at least two ${who}s yourself (or turn the posts on in Edit Series).`,
        action: { label: 'Add entrants', tab: 'entrants' },
      });
    }
  }

  if (!series.announcements) {
    items.push({
      key: 'discord', label: 'Discord', state: 'optional',
      description: 'Announcements are off: nothing about this series will be posted to Discord.',
      action: { label: 'Edit', href: editHref },
    });
  } else if (data.channels) {
    const cfg = series.discord_config ?? {};
    const wantsUpdates = cfg.weekly_schedule !== false || cfg.standings_posts !== false;
    if (data.channels.announcements === 0) {
      items.push({
        key: 'discord', label: 'Discord', state: 'todo',
        description: 'No channel has announcements turned on, so the registration post has nowhere to go.',
        action: { label: 'Channel settings', href: '/settings/discord' },
      });
    } else if (wantsUpdates && data.channels.seriesUpdates === 0) {
      items.push({
        key: 'discord', label: 'Discord', state: 'warn',
        description: 'No "Series Updates" channel: the weekly schedule and standings posts will be skipped.',
        action: { label: 'Channel settings', href: '/settings/discord' },
      });
    } else {
      items.push({
        key: 'discord', label: 'Discord', state: 'done',
        description: `Posts go to ${plural(data.channels.announcements, 'announcement channel')}${wantsUpdates ? ` and ${plural(data.channels.seriesUpdates, 'series updates channel')}` : ''}.`,
      });
    }
  }

  return items;
}

// ─── registration summary ────────────────────────────────────────────────────

export interface RegistrationSummary {
  approved: SeriesEntrantDto[];
  pending: SeriesEntrantDto[];
  players: number;
  /** Approved teams below `roster_min`. */
  shortRosters: number;
}

export function summarizeRegistration(
  entrants: readonly SeriesEntrantDto[], rosterMin: number | null | undefined, entrantType: SeriesSummary['entrant_type'],
): RegistrationSummary {
  const approved = entrants.filter((e) => e.status === 'active');
  const pending = entrants.filter((e) => e.status === 'pending');
  const players = [...approved, ...pending].reduce((n, e) => n + (entrantType === 'team' ? e.members.length : 1), 0);
  const shortRosters = entrantType === 'team' && rosterMin
    ? approved.filter((e) => e.members.length < rosterMin).length
    : 0;
  return { approved, pending, players, shortRosters };
}
