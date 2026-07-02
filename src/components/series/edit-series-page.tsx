'use client'

import { logger } from '@/lib/logger/client';
import { useState, useEffect } from 'react';
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
  Loader,
  Center,
  Alert,
  Divider,
  Text,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconTimeline, IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { showError, showSuccess } from '@/lib/notifications';
import { ScoringConfigEditor } from './scoring-config-editor';
import type { SeriesScoringConfig } from '@/lib/series';

interface SeriesRow {
  id: string;
  name: string;
  description?: string;
  status: string;
  start_date?: string;
  end_date?: string;
  livestream_link?: string;
  announcements: boolean;
  player_notifications: boolean;
  scoring_config?: string;
}

export function EditSeriesPage({ seriesId }: { seriesId: string }): JSX.Element {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [livestreamLink, setLivestreamLink] = useState('');
  const [announcements, setAnnouncements] = useState(true);
  const [playerNotifications, setPlayerNotifications] = useState(true);
  const [scoringConfig, setScoringConfig] = useState<SeriesScoringConfig>({});

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/series/${seriesId}`);
        if (!res.ok) { setError('Series not found'); return; }
        const { series: s }: { series: SeriesRow } = await res.json();
        setName(s.name);
        setDescription(s.description ?? '');
        setStartDate(s.start_date ? new Date(s.start_date) : null);
        setEndDate(s.end_date ? new Date(s.end_date) : null);
        setLivestreamLink(s.livestream_link ?? '');
        setAnnouncements(s.announcements);
        setPlayerNotifications(s.player_notifications);
        if (s.scoring_config) {
          try { setScoringConfig(JSON.parse(s.scoring_config)); } catch { /* leave default */ }
        }
      } catch (err) {
        logger.error('Error loading series:', err);
        setError('Failed to load series');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [seriesId]);

  const handleSave = async () => {
    if (!name.trim()) { showError('Name is required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/series/${seriesId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          start_date: startDate?.toISOString() ?? undefined,
          end_date: endDate?.toISOString() ?? undefined,
          livestream_link: livestreamLink.trim() || undefined,
          announcements,
          player_notifications: playerNotifications,
          scoring_config: scoringConfig,
        }),
      });
      if (!res.ok) { showError('Failed to update series'); return; }
      showSuccess('Series updated');
      router.push(`/series/${seriesId}`);
    } catch (err) {
      logger.error('Error saving series:', err);
      showError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Center style={{ minHeight: 400 }}><Loader size="lg" /></Center>;
  }

  if (error) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <PageHeader
          icon={IconTimeline}
          title="Edit Series"
          subtitle={name}
          breadcrumbs={[
            { title: 'Series', href: '/series' },
            { title: name, href: `/series/${seriesId}` },
          ]}
        />

        <TextInput
          label="Series Name"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />

        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          autosize
          minRows={3}
        />

        <Group grow>
          <DatePickerInput
            label="Start Date"
            value={startDate}
            onChange={(v) => setStartDate(v as Date | null)}
            clearable
          />
          <DatePickerInput
            label="End Date"
            value={endDate}
            onChange={(v) => setEndDate(v as Date | null)}
            clearable
            minDate={startDate ?? undefined}
          />
        </Group>

        <TextInput
          label="Livestream Link"
          placeholder="https://twitch.tv/..."
          value={livestreamLink}
          onChange={(e) => setLivestreamLink(e.currentTarget.value)}
        />

        <Divider />
        <Text fw={500} size="sm">Notifications</Text>

        <Switch
          label="Discord Announcements"
          checked={announcements}
          onChange={(e) => setAnnouncements(e.currentTarget.checked)}
        />

        <Switch
          label="Player Notifications"
          checked={playerNotifications}
          onChange={(e) => setPlayerNotifications(e.currentTarget.checked)}
        />

        <Divider />

        <ScoringConfigEditor value={scoringConfig} onChange={setScoringConfig} />

        <Divider />

        <Group justify="space-between">
          <Button
            variant="outline"
            leftSection={<IconArrowLeft size={14} />}
            onClick={() => router.push(`/series/${seriesId}`)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>Save Changes</Button>
        </Group>
      </Stack>
    </Container>
  );
}
