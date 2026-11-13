import { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
import { Stack, TextInput, Textarea, Group, Switch, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
// Date picker styles load with the components that use them (not in the entry bundle)
import '@mantine/dates/styles.css';
import { EventImageUpload } from '@/components/create-match/EventImageUpload';
import { showError } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';
import type {
  SeriesDiscordConfig, SeriesEntrantType, SeriesMatchDefaults, SeriesScoringConfig, SeriesScoringType,
} from '@/shared/series-types';
import { ScoringConfigEditor } from './scoring-config-editor';
import { defaultScoringConfig, isLegacyScoringConfig } from './scoring-config';
import { SeriesFormCard } from './series-form-card';
import { SeriesDiscordFields } from './series-setup-fields';
import { rosterPayload } from './series-setup';
import { parseScoringConfig } from './series-shared';
import type { SeriesSummary } from './series-shared';
import { EMPTY_LAYOUT } from './series-layout';
import type { DraftLayout } from './series-layout';

export { SeriesFormCard };

/** Form state shared by the create stepper and the edit page. Dates are 'YYYY-MM-DD' (Mantine 9 DateStringValue). */
export interface SeriesFormData {
  name: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  livestream_link: string;
  event_image_url: string | null;
  announcements: boolean;
  player_notifications: boolean;
  scoring_config: SeriesScoringConfig;
  // setup (series rework)
  entrant_type: SeriesEntrantType;
  roster_min: number | null;
  roster_max: number | null;
  /** null = legacy series without a scoring-type restriction. */
  scoring_type: SeriesScoringType | null;
  game_ids: string[];
  game_id: string | null;
  game_mode_id: string | null;
  // match defaults
  match_rounds: number | null;
  match_rules: 'casual' | 'competitive' | null;
  match_stats_enabled: boolean;
  match_player_notifications: boolean;
  match_maps: string[];
  // Discord posts
  discord_registration_posts: boolean;
  discord_weekly_schedule: boolean;
  discord_standings_posts: boolean;
  discord_schedule_lead_hours: number;
  /** Team series: players can register new teams from the Discord registration post. */
  discord_team_creation: boolean;
  // create flow: seed entrants from a previous season
  previous_series_id: string | null;
  copy_include_members: boolean;
  /** Create flow: the season layout (stages and placeholders) created with the series. */
  layout: DraftLayout;
}

export const EMPTY_SERIES_FORM: SeriesFormData = {
  name: '',
  description: '',
  start_date: null,
  end_date: null,
  livestream_link: '',
  event_image_url: null,
  announcements: true,
  player_notifications: true,
  scoring_config: defaultScoringConfig('Normal'),
  entrant_type: 'solo',
  roster_min: null,
  roster_max: null,
  scoring_type: 'Normal',
  game_ids: [],
  game_id: null,
  game_mode_id: null,
  match_rounds: null,
  match_rules: null,
  match_stats_enabled: false,
  match_player_notifications: true,
  match_maps: [],
  discord_registration_posts: true,
  discord_weekly_schedule: true,
  discord_standings_posts: true,
  discord_schedule_lead_hours: 48,
  discord_team_creation: true,
  previous_series_id: null,
  copy_include_members: true,
  layout: EMPTY_LAYOUT,
};

export type UpdateSeriesForm = <K extends keyof SeriesFormData>(key: K, value: SeriesFormData[K]) => void;

/** 'YYYY-MM-DD' → ISO timestamp at local midnight, matching what the old Date-based form sent. */
export function dateInputToIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Stored timestamp → local 'YYYY-MM-DD' for DatePickerInput. */
export function isoToDateInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Setup keys the server validates as a whole and 409s on; an edit only sends the ones that changed. */
const SETUP_KEYS = [
  'entrant_type', 'roster_min', 'roster_max', 'scoring_type', 'game_id', 'game_ids', 'game_mode_id', 'previous_series_id',
] as const;

function setupPayload(form: SeriesFormData): Record<(typeof SETUP_KEYS)[number], unknown> {
  return {
    entrant_type: form.entrant_type,
    ...rosterPayload(form.entrant_type, form.roster_min, form.roster_max),
    scoring_type: form.scoring_type,
    game_id: form.game_id,
    game_ids: form.game_ids,
    game_mode_id: form.game_mode_id,
    previous_series_id: form.previous_series_id,
  };
}

/**
 * The series being created, shaped like a loaded one (no id yet), for the components the create flow shares with the
 * series page (the Schedule step's placeholder modals read the game / scoring / match defaults from it).
 */
export function draftSeriesFromForm(form: SeriesFormData): SeriesSummary {
  const now = new Date().toISOString();
  return {
    id: 'draft', name: form.name, description: form.description, status: 'created', scoring_config: form.scoring_config,
    entrant_type: form.entrant_type, roster_min: form.roster_min, roster_max: form.roster_max, scoring_type: form.scoring_type,
    game_ids: form.game_ids, game_mode_id: form.game_mode_id, match_defaults: buildMatchDefaults(form), discord_config: buildDiscordConfig(form),
    previous_series_id: form.previous_series_id, start_date: form.start_date, end_date: form.end_date, event_image_url: form.event_image_url,
    game_id: form.game_id, livestream_link: form.livestream_link || null, announcements: form.announcements, player_notifications: form.player_notifications,
    created_at: now, updated_at: now, event_count: 0, completed_event_count: 0, participant_count: 0, entrant_count: 0, next_event: null,
    last_event_game: null, series_game: null, champion: null,
  };
}

/** `match_defaults` from the form. */
export function buildMatchDefaults(form: SeriesFormData): SeriesMatchDefaults {
  const defaults: SeriesMatchDefaults = {};
  if (form.match_rounds !== null) defaults.rounds_per_match = form.match_rounds; // tournaments only; matches play one game per map
  if (form.match_rules) defaults.rules = form.match_rules;
  defaults.stats_enabled = form.match_stats_enabled;
  defaults.player_notifications = form.match_player_notifications;
  if (form.match_maps.length > 0) defaults.maps = form.match_maps;
  return defaults;
}

export function buildDiscordConfig(form: SeriesFormData): SeriesDiscordConfig {
  return {
    registration_posts: form.discord_registration_posts,
    weekly_schedule: form.discord_weekly_schedule,
    standings_posts: form.discord_standings_posts,
    schedule_lead_hours: form.discord_schedule_lead_hours,
    team_creation: form.discord_team_creation,
  };
}

/**
 * Body for POST /api/series and PATCH /api/series/[id]. Empty optional fields are sent as null. For an edit pass the
 * form as it was loaded as `initial`: unchanged setup fields are then left out so a legacy series is never re-validated.
 */
export function buildSeriesPayload(form: SeriesFormData, initial?: SeriesFormData): Record<string, unknown> {
  const setup: Record<string, unknown> = setupPayload(form);
  if (initial) {
    const before = setupPayload(initial);
    for (const key of SETUP_KEYS) {
      if (JSON.stringify(before[key]) === JSON.stringify(setup[key])) delete setup[key];
    }
  }
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    start_date: dateInputToIso(form.start_date),
    end_date: dateInputToIso(form.end_date),
    livestream_link: form.livestream_link.trim() || null,
    event_image_url: form.event_image_url || null,
    announcements: form.announcements,
    player_notifications: form.player_notifications,
    scoring_config: form.scoring_config,
    match_defaults: buildMatchDefaults(form),
    discord_config: buildDiscordConfig(form),
    ...setup,
  };
}

/** Edit form state from a loaded series. Legacy series (no scoring type / no standings mode) keep those fields empty. */
export function formFromSeries(s: SeriesSummary): SeriesFormData {
  const defaults = s.match_defaults ?? {};
  const discord = s.discord_config ?? {};
  return {
    name: s.name,
    description: s.description ?? '',
    start_date: isoToDateInput(s.start_date),
    end_date: isoToDateInput(s.end_date),
    livestream_link: s.livestream_link ?? '',
    event_image_url: s.event_image_url ?? null,
    announcements: s.announcements,
    player_notifications: s.player_notifications,
    scoring_config: parseScoringConfig(s.scoring_config),
    entrant_type: s.entrant_type ?? 'solo',
    roster_min: s.roster_min ?? null,
    roster_max: s.roster_max ?? null,
    scoring_type: s.scoring_type ?? null,
    game_ids: s.game_ids ?? [],
    game_id: s.game_id ?? null,
    game_mode_id: s.game_mode_id ?? null,
    match_rounds: defaults.rounds_per_match ?? null,
    match_rules: defaults.rules ?? null,
    match_stats_enabled: defaults.stats_enabled ?? false,
    match_player_notifications: defaults.player_notifications ?? true,
    match_maps: defaults.maps ?? [],
    discord_registration_posts: discord.registration_posts ?? true,
    discord_weekly_schedule: discord.weekly_schedule ?? true,
    discord_standings_posts: discord.standings_posts ?? true,
    discord_schedule_lead_hours: discord.schedule_lead_hours ?? 48,
    discord_team_creation: discord.team_creation ?? true,
    previous_series_id: s.previous_series_id ?? null,
    copy_include_members: true,
    layout: EMPTY_LAYOUT,
  };
}

const STORAGE_KEY = 'seriesFormData';

/**
 * Create-series form state, persisted to sessionStorage the same way
 * useTournamentForm does so step navigation (?step=) and reloads keep input.
 */
export interface UseSeriesFormResult {
  form: SeriesFormData;
  setForm: React.Dispatch<React.SetStateAction<SeriesFormData>>;
  update: UpdateSeriesForm;
  clear: () => void;
}

export function useSeriesForm(): UseSeriesFormResult {
  const [form, setForm] = useState<SeriesFormData>(() => {
    if (typeof window === 'undefined') return EMPTY_SERIES_FORM;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const merged: SeriesFormData = { ...EMPTY_SERIES_FORM, ...JSON.parse(saved) };
        if (!merged.layout || !Array.isArray(merged.layout.stages) || !Array.isArray(merged.layout.items)) merged.layout = EMPTY_LAYOUT;
        // A form saved before standings modes existed: start from the default of its scoring type instead.
        if (isLegacyScoringConfig(merged.scoring_config ?? {})) merged.scoring_config = defaultScoringConfig(merged.scoring_type);
        return merged;
      }
    } catch {
      /* fall through to defaults */
    }
    return EMPTY_SERIES_FORM;
  });

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch { /* storage unavailable */ }
  }, [form]);

  const update: UpdateSeriesForm = useCallback((key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const clear = useCallback(() => {
    setForm(EMPTY_SERIES_FORM);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(`${STORAGE_KEY}:events`); // stale key from the removed Events step
    } catch { /* storage unavailable */ }
  }, []);

  return { form, setForm, update, clear };
}

/** Upload/remove handlers for the series cover, reusing the event-image endpoint. */
export function useSeriesImageUpload(
  imageUrl: string | null,
  onChange: (url: string | null) => void,
  /**
   * When false (edit page), removing only clears the field and leaves the file on disk:
   * the saved series still points at it until the user clicks Save.
   */
  deleteOnRemove = true
): { uploading: boolean; upload: (file: File | null) => Promise<void>; remove: () => Promise<void> } {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showError('File size must be less than 5MB');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const res = await fetch('/api/upload/event-image', { method: 'POST', body });
      if (res.ok) {
        const result = await res.json();
        onChange(result.imageUrl);
      } else {
        const err = await res.json().catch(() => ({}));
        showError(err.error || 'Failed to upload image');
      }
    } catch (err) {
      logger.error('Error uploading series image:', err);
      showError('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (imageUrl && deleteOnRemove) {
      try {
        await fetch(`/api/upload/event-image?imageUrl=${encodeURIComponent(imageUrl)}`, { method: 'DELETE' });
      } catch (err) {
        logger.error('Error deleting series image:', err);
      }
    }
    onChange(null);
  };

  return { uploading, upload, remove };
}

export function SeriesDetailsFields({
  form,
  update,
  deleteImageOnRemove = true,
}: {
  form: SeriesFormData;
  update: UpdateSeriesForm;
  deleteImageOnRemove?: boolean;
}): JSX.Element {
  const image = useSeriesImageUpload(form.event_image_url, (url) => update('event_image_url', url), deleteImageOnRemove);

  return (
    <SeriesFormCard title="Details">
      <TextInput
        label="Series Name"
        placeholder="e.g. Spring 2027 Championship"
        required
        value={form.name}
        onChange={(e) => update('name', e.currentTarget.value)}
      />
      <Textarea
        label="Description"
        placeholder="Describe this series..."
        value={form.description}
        onChange={(e) => update('description', e.currentTarget.value)}
        autosize
        minRows={3}
      />
      <Group grow align="flex-start">
        <DatePickerInput
          label="Start Date"
          placeholder="Pick start date"
          value={form.start_date}
          onChange={(v) => {
            update('start_date', v);
            // Keep the range valid if the new start passes the current end.
            if (v && form.end_date && form.end_date < v) update('end_date', null);
          }}
          clearable
        />
        <DatePickerInput
          label="End Date"
          placeholder="Pick end date"
          value={form.end_date}
          onChange={(v) => update('end_date', v)}
          clearable
          minDate={form.start_date ?? undefined}
        />
      </Group>
      <TextInput
        label="Livestream Link"
        placeholder="https://twitch.tv/..."
        value={form.livestream_link}
        onChange={(e) => update('livestream_link', e.currentTarget.value)}
      />
      <div>
        <EventImageUpload
          imagePreview={form.event_image_url}
          uploadingImage={image.uploading}
          onImageUpload={image.upload}
          onRemoveImage={image.remove}
        />
        <Text size="xs" c="dimmed" mt={6}>
          Used as the series cover. If empty, the cover follows the game of the next event.
        </Text>
      </div>
    </SeriesFormCard>
  );
}

export function SeriesNotificationsFields({ form, update }: { form: SeriesFormData; update: UpdateSeriesForm }): JSX.Element {
  return (
    <Stack gap="md">
      <SeriesFormCard title="Notifications">
        <Switch
          label="Discord Announcements"
          description="Post to Discord when the series is activated, completed, or cancelled"
          checked={form.announcements}
          onChange={(e) => update('announcements', e.currentTarget.checked)}
        />
        <Switch
          label="Player Notifications"
          description="Send DMs to participants for series events"
          checked={form.player_notifications}
          onChange={(e) => update('player_notifications', e.currentTarget.checked)}
        />
      </SeriesFormCard>
      <SeriesDiscordFields form={form} update={update} />
    </Stack>
  );
}

export function SeriesScoringFields({ form, update }: { form: SeriesFormData; update: UpdateSeriesForm }): JSX.Element {
  return (
    <SeriesFormCard title="Scoring">
      <Text size="xs" c="dimmed" mt={-8}>
        Controls how match and tournament results convert into series standings.
      </Text>
      <ScoringConfigEditor value={form.scoring_config} onChange={(v) => update('scoring_config', v)} scoringType={form.scoring_type} />
    </SeriesFormCard>
  );
}
