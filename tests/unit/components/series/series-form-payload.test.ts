import { describe, it, expect } from 'vitest';
import { EMPTY_SERIES_FORM, buildDiscordConfig, buildMatchDefaults, buildSeriesPayload, formFromSeries } from '@/components/series/series-form';
import type { SeriesSummary } from '@/components/series/series-shared';

const baseSummary = (over: Partial<SeriesSummary> = {}): SeriesSummary => ({
  id: 's1', name: 'Legacy', status: 'created', announcements: true, player_notifications: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', event_count: 0, completed_event_count: 0,
  participant_count: 0, entrant_count: 0, next_event: null, last_event_game: null, series_game: null, champion: null, ...over,
});

describe('buildSeriesPayload', () => {
  it('sends the whole setup on create', () => {
    const body = buildSeriesPayload({
      ...EMPTY_SERIES_FORM, name: ' Season ', entrant_type: 'team', roster_min: 5, roster_max: 6, scoring_type: 'Normal',
      game_ids: ['overwatch2'], game_id: 'overwatch2', game_mode_id: 'control',
    });
    expect(body).toMatchObject({
      name: 'Season', entrant_type: 'team', roster_min: 5, roster_max: 6, scoring_type: 'Normal', game_ids: ['overwatch2'],
      game_id: 'overwatch2', game_mode_id: 'control', previous_series_id: null, scoring_config: { mode: 'head_to_head' },
    });
  });

  it('drops roster bounds for solo series', () => {
    const body = buildSeriesPayload({ ...EMPTY_SERIES_FORM, name: 'x', entrant_type: 'solo', roster_min: 2, roster_max: 3 });
    expect(body.roster_min).toBeNull();
    expect(body.roster_max).toBeNull();
  });

  it('leaves unchanged setup fields out of an edit so legacy series are not re-validated', () => {
    const initial = formFromSeries(baseSummary({ game_id: 'overwatch2' }));
    const body = buildSeriesPayload({ ...initial, name: 'Renamed' }, initial);
    expect(body.name).toBe('Renamed');
    for (const key of ['entrant_type', 'roster_min', 'roster_max', 'scoring_type', 'game_id', 'game_ids', 'game_mode_id', 'previous_series_id']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('sends only the setup fields that changed on an edit', () => {
    const initial = formFromSeries(baseSummary({ scoring_type: 'Normal', entrant_type: 'team', game_id: 'overwatch2', game_ids: ['overwatch2'] }));
    const body = buildSeriesPayload({ ...initial, roster_max: 8 }, initial);
    expect(body.roster_max).toBe(8);
    expect(body).not.toHaveProperty('entrant_type');
    expect(body).not.toHaveProperty('game_ids');
  });
});

describe('formFromSeries', () => {
  it('keeps a legacy series legacy: no scoring type, no mode', () => {
    const form = formFromSeries(baseSummary({ scoring_config: { match_win_points: 3 } }));
    expect(form.scoring_type).toBeNull();
    expect(form.scoring_config).toEqual({ match_win_points: 3 });
    expect(form.entrant_type).toBe('solo');
    expect(form.discord_schedule_lead_hours).toBe(48);
    expect(form.discord_team_creation).toBe(true);
  });

  it('reads the new setup fields', () => {
    const form = formFromSeries(baseSummary({
      entrant_type: 'team', roster_min: 5, roster_max: 7, scoring_type: 'Position', game_ids: ['a', 'b'], game_id: 'a', game_mode_id: 'm',
      match_defaults: { rounds_per_match: 3, rules: 'competitive', stats_enabled: true, player_notifications: false, maps: ['x'] },
      discord_config: { weekly_schedule: false, schedule_lead_hours: 12, team_creation: false },
    }));
    expect(form).toMatchObject({
      entrant_type: 'team', roster_min: 5, roster_max: 7, scoring_type: 'Position', game_ids: ['a', 'b'], game_id: 'a', game_mode_id: 'm',
      match_rounds: 3, match_rules: 'competitive', match_stats_enabled: true, match_player_notifications: false, match_maps: ['x'],
      discord_weekly_schedule: false, discord_standings_posts: true, discord_schedule_lead_hours: 12,
      discord_team_creation: false,
    });
  });
});

describe('match defaults / discord config', () => {
  it('only includes rounds per tournament match, rules and maps when set (matches play one game per map: no rounds)', () => {
    expect(buildMatchDefaults(EMPTY_SERIES_FORM)).toEqual({ stats_enabled: false, player_notifications: true });
    expect(buildMatchDefaults({ ...EMPTY_SERIES_FORM, match_rounds: 5, match_rules: 'casual', match_maps: ['m1'] })).toEqual({
      rounds_per_match: 5, rules: 'casual', stats_enabled: false, player_notifications: true, maps: ['m1'],
    });
  });

  it('serialises the Discord toggles', () => {
    expect(buildDiscordConfig({ ...EMPTY_SERIES_FORM, discord_weekly_schedule: false })).toEqual({
      registration_posts: true, weekly_schedule: false, standings_posts: true, schedule_lead_hours: 48, team_creation: true,
    });
    expect(buildDiscordConfig({ ...EMPTY_SERIES_FORM, discord_team_creation: false }).team_creation).toBe(false);
  });
});
