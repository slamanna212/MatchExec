'use client'

import { logger } from '@/lib/logger/client';
import { useState } from 'react';
import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Stack,
  TextInput,
  Textarea,
  Button,
  Group,
  Switch,
  Text,
  Divider,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconTimeline, IconArrowLeft } from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { showError, showSuccess } from '@/lib/notifications';
import { ScoringConfigEditor } from './scoring-config-editor';
import type { SeriesScoringConfig } from '@/lib/series';

interface SeriesFormData {
  name: string;
  description: string;
  start_date: Date | null;
  end_date: Date | null;
  livestream_link: string;
  announcements: boolean;
  player_notifications: boolean;
  scoring_config: SeriesScoringConfig;
}

export function CreateSeriesPage(): JSX.Element {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SeriesFormData>({
    name: '',
    description: '',
    start_date: null,
    end_date: null,
    livestream_link: '',
    announcements: true,
    player_notifications: true,
    scoring_config: {},
  });

  const update = <K extends keyof SeriesFormData>(key: K, value: SeriesFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      showError('Series name is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          start_date: form.start_date?.toISOString() ?? undefined,
          end_date: form.end_date?.toISOString() ?? undefined,
          livestream_link: form.livestream_link.trim() || undefined,
          announcements: form.announcements,
          player_notifications: form.player_notifications,
          scoring_config: form.scoring_config,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        showError(err.error ?? 'Failed to create series');
        return;
      }

      const data = await res.json();
      showSuccess('Series created!');
      router.push(`/series/${data.id}`);
    } catch (error) {
      logger.error('Error creating series:', error);
      showError('An error occurred while creating the series');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <PageHeader
          icon={IconTimeline}
          title="Create Series"
          subtitle="Set up a new multi-event championship"
          breadcrumbs={[{ title: 'Series', href: '/series' }]}
        />

        <TextInput
          label="Series Name"
          placeholder="e.g. Spring 2026 Championship"
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

        <Group grow>
          <DatePickerInput
            label="Start Date"
            placeholder="Pick start date"
            value={form.start_date}
            onChange={(v) => setForm(prev => ({ ...prev, start_date: v as Date | null }))}
            clearable
          />
          <DatePickerInput
            label="End Date"
            placeholder="Pick end date"
            value={form.end_date}
            onChange={(v) => setForm(prev => ({ ...prev, end_date: v as Date | null }))}
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

        <Divider />

        <Text fw={500} size="sm">Notifications</Text>

        <Switch
          label="Discord Announcements"
          description="Post announcements to Discord when series status changes"
          checked={form.announcements}
          onChange={(e) => update('announcements', e.currentTarget.checked)}
        />

        <Switch
          label="Player Notifications"
          description="Send DMs to participants for series events"
          checked={form.player_notifications}
          onChange={(e) => update('player_notifications', e.currentTarget.checked)}
        />

        <Divider />

        <ScoringConfigEditor
          value={form.scoring_config}
          onChange={(v) => update('scoring_config', v)}
        />

        <Divider />

        <Group justify="space-between">
          <Button
            variant="outline"
            leftSection={<IconArrowLeft size={14} />}
            onClick={() => router.push('/series')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Create Series
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
