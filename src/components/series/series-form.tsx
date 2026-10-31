'use client'

import { useState, useEffect, useCallback } from 'react';
import type { JSX, ReactNode } from 'react';
import { Card, Stack, TextInput, Textarea, Group, Switch, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { SectionLabel } from '@/components/SectionLabel';
import { EventImageUpload } from '@/components/create-match/EventImageUpload';
import { showError } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';
import type { SeriesScoringConfig } from '@/lib/series';
import { ScoringConfigEditor } from './scoring-config-editor';

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
  scoring_config: {},
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

/** Body for POST /api/series and PATCH /api/series/[id]. Empty optional fields are sent as null. */
export function buildSeriesPayload(form: SeriesFormData): Record<string, unknown> {
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
  pickedEvents: Record<string, PickedEvent>;
  setPickedEvents: React.Dispatch<React.SetStateAction<Record<string, PickedEvent>>>;
}

export function useSeriesForm(): UseSeriesFormResult {
  const [form, setForm] = useState<SeriesFormData>(() => {
    if (typeof window === 'undefined') return EMPTY_SERIES_FORM;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) return { ...EMPTY_SERIES_FORM, ...JSON.parse(saved) };
    } catch {
      /* fall through to defaults */
    }
    return EMPTY_SERIES_FORM;
  });

  const [pickedEvents, setPickedEvents] = useState<Record<string, PickedEvent>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = sessionStorage.getItem(`${STORAGE_KEY}:events`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch { /* storage unavailable */ }
  }, [form]);

  useEffect(() => {
    try { sessionStorage.setItem(`${STORAGE_KEY}:events`, JSON.stringify(pickedEvents)); } catch { /* storage unavailable */ }
  }, [pickedEvents]);

  const update: UpdateSeriesForm = useCallback((key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const clear = useCallback(() => {
    setForm(EMPTY_SERIES_FORM);
    setPickedEvents({});
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(`${STORAGE_KEY}:events`);
    } catch { /* storage unavailable */ }
  }, []);

  return { form, setForm, update, clear, pickedEvents, setPickedEvents };
}

/** An event picked on the create stepper's Events step, keyed by `${type}:${id}`. */
export interface PickedEvent {
  type: 'match' | 'tournament';
  id: string;
  name: string;
  multiplier: number;
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

export function SeriesFormCard({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <SectionLabel>{title}</SectionLabel>
        {children}
      </Stack>
    </Card>
  );
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
  );
}

export function SeriesScoringFields({ form, update }: { form: SeriesFormData; update: UpdateSeriesForm }): JSX.Element {
  return (
    <SeriesFormCard title="Scoring">
      <Text size="xs" c="dimmed" mt={-8}>
        Controls how match and tournament results convert into series standings points.
      </Text>
      <ScoringConfigEditor value={form.scoring_config} onChange={(v) => update('scoring_config', v)} />
    </SeriesFormCard>
  );
}
