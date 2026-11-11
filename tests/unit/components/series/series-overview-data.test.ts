import { describe, it, expect } from 'vitest';
import { buildSetupChecklist, summarizeRegistration, usesDiscordRegistration } from '@/components/series/series-overview-data';
import type { OverviewData } from '@/components/series/series-overview-data';
import type { SeriesEntrantDto } from '@/shared/series-types';
import type { SeriesEventView } from '@/components/series/series-shared';

const entrant = (id: string, status: SeriesEntrantDto['status'], members = 0): SeriesEntrantDto => ({
  id, series_id: 's1', name: id, tag: null, color: null, logo_url: null, division: null, seed: null, status,
  source_entrant_id: null, created_at: '', updated_at: '',
  members: Array.from({ length: members }, (_, i) => ({ id: `${id}-${i}`, username: `u${i}`, role: i === 0 ? 'captain' : 'player' })) as SeriesEntrantDto['members'],
});
const event = (id: string, status: 'live' | 'planned' = 'live') => ({ id, status }) as SeriesEventView;

const series = { id: 's1', announcements: true, discord_config: null, entrant_type: 'team' as const };
const data = (over: Partial<OverviewData> = {}): OverviewData => ({
  entrants: [], stages: [], standings: null, channels: { announcements: 1, seriesUpdates: 1 }, ...over,
});
const stateOf = (items: ReturnType<typeof buildSetupChecklist>, key: string) => items.find((i) => i.key === key)?.state;

describe('buildSetupChecklist', () => {
  it('flags a series without events as not ready, and counts events and playoff placeholders once there are some', () => {
    expect(stateOf(buildSetupChecklist(series, [], data()), 'events')).toBe('todo');
    const items = buildSetupChecklist(series, [event('a'), event('b'), event('p', 'planned')], data());
    const ev = items.find((i) => i.key === 'events')!;
    expect(ev.state).toBe('done');
    expect(ev.description).toBe('2 events scheduled, 1 playoff placeholder.');
  });

  it('treats stages as optional', () => {
    expect(stateOf(buildSetupChecklist(series, [], data()), 'stages')).toBe('optional');
  });

  it('only requires entrants when players cannot register from Discord', () => {
    expect(stateOf(buildSetupChecklist(series, [], data()), 'entrants')).toBe('optional');
    const noPosts = { ...series, discord_config: { registration_posts: false } };
    expect(stateOf(buildSetupChecklist(noPosts, [], data()), 'entrants')).toBe('todo');
    const two = data({ entrants: [entrant('a', 'active'), entrant('b', 'active'), entrant('c', 'pending')] });
    expect(buildSetupChecklist(noPosts, [], two).find((i) => i.key === 'entrants')).toMatchObject({ state: 'done', description: '2 teams ready.' });
  });

  it('needs an announcement channel, and warns when schedule/standings posts have no series updates channel', () => {
    expect(stateOf(buildSetupChecklist(series, [], data({ channels: { announcements: 0, seriesUpdates: 1 } })), 'discord')).toBe('todo');
    expect(stateOf(buildSetupChecklist(series, [], data({ channels: { announcements: 1, seriesUpdates: 0 } })), 'discord')).toBe('warn');
    const postsOff = { ...series, discord_config: { weekly_schedule: false, standings_posts: false } };
    expect(stateOf(buildSetupChecklist(postsOff, [], data({ channels: { announcements: 1, seriesUpdates: 0 } })), 'discord')).toBe('done');
  });

  it('marks Discord optional when announcements are off, and skips sections that failed to load', () => {
    const quiet = { ...series, announcements: false };
    const items = buildSetupChecklist(quiet, [], data({ entrants: null, stages: null, channels: null }));
    expect(items.map((i) => i.key)).toEqual(['details', 'events', 'discord']);
    expect(stateOf(items, 'discord')).toBe('optional');
  });
});

describe('usesDiscordRegistration', () => {
  it('needs announcements on and registration posts not switched off', () => {
    expect(usesDiscordRegistration({ announcements: true, discord_config: null })).toBe(true);
    expect(usesDiscordRegistration({ announcements: false, discord_config: null })).toBe(false);
    expect(usesDiscordRegistration({ announcements: true, discord_config: { registration_posts: false } })).toBe(false);
  });
});

describe('summarizeRegistration', () => {
  it('splits approved and pending, counts players and short rosters', () => {
    const s = summarizeRegistration([entrant('a', 'active', 5), entrant('b', 'active', 3), entrant('c', 'pending', 2), entrant('d', 'withdrawn', 4)], 5, 'team');
    expect(s.approved.map((e) => e.id)).toEqual(['a', 'b']);
    expect(s.pending.map((e) => e.id)).toEqual(['c']);
    expect(s.players).toBe(10);
    expect(s.shortRosters).toBe(1);
  });

  it('counts one player per solo entrant', () => {
    expect(summarizeRegistration([entrant('a', 'active'), entrant('b', 'pending')], null, 'solo').players).toBe(2);
  });
});
