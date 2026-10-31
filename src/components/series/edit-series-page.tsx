'use client'

import { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Stack, Button, Group, Loader, Center, Alert } from '@mantine/core';
import { IconTimeline, IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { logger } from '@/lib/logger/client';
import { notificationHelper, showError } from '@/lib/notifications';
import {
  EMPTY_SERIES_FORM, buildSeriesPayload, isoToDateInput,
  SeriesDetailsFields, SeriesNotificationsFields, SeriesScoringFields,
} from './series-form';
import type { SeriesFormData, UpdateSeriesForm } from './series-form';
import { parseScoringConfig } from './series-shared';
import type { SeriesSummary } from './series-shared';

export function EditSeriesPage({ seriesId }: { seriesId: string }): JSX.Element {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState('');
  const [form, setForm] = useState<SeriesFormData>(EMPTY_SERIES_FORM);

  const update: UpdateSeriesForm = useCallback((key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/series/${seriesId}`);
        if (!res.ok) { setError(res.status === 404 ? 'Series not found' : 'Failed to load series'); return; }
        const { series: s }: { series: SeriesSummary } = await res.json();
        setSavedName(s.name);
        setForm({
          name: s.name,
          description: s.description ?? '',
          start_date: isoToDateInput(s.start_date),
          end_date: isoToDateInput(s.end_date),
          livestream_link: s.livestream_link ?? '',
          event_image_url: s.event_image_url ?? null,
          announcements: s.announcements,
          player_notifications: s.player_notifications,
          scoring_config: parseScoringConfig(s.scoring_config),
        });
      } catch (err) {
        logger.error('Error loading series:', err);
        setError('Failed to load series');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [seriesId]);

  const handleSave = async () => {
    if (!form.name.trim()) { showError('Series name is required'); return; }
    setSaving(true);
    const nid = `series-save-${seriesId}`;
    notificationHelper.loading({ id: nid, message: 'Saving series...' });
    try {
      const res = await fetch(`/api/series/${seriesId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSeriesPayload(form)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notificationHelper.update(nid, { type: 'error', message: data.error ?? 'Failed to update series' });
        return;
      }
      notificationHelper.update(nid, { type: 'success', message: 'Series updated' });
      router.push(`/series/${seriesId}`);
    } catch (err) {
      logger.error('Error saving series:', err);
      notificationHelper.update(nid, { type: 'error', message: 'An error occurred while saving' });
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

  const backToDetail = () => router.push(`/series/${seriesId}`);

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <PageHeader
          icon={IconTimeline}
          title="Edit Series"
          subtitle={savedName}
          breadcrumbs={[
            { title: 'Series', href: '/series' },
            { title: savedName, href: `/series/${seriesId}` },
          ]}
          action={
            <Button variant="outline" leftSection={<IconArrowLeft size={16} />} onClick={backToDetail}>
              Back
            </Button>
          }
        />

        {/* Removing the image only clears the field: the saved series still uses the file until Save. */}
        <SeriesDetailsFields form={form} update={update} deleteImageOnRemove={false} />
        <SeriesNotificationsFields form={form} update={update} />
        <SeriesScoringFields form={form} update={update} />

        <Group justify="space-between">
          <Button variant="outline" onClick={backToDetail} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save Changes</Button>
        </Group>
      </Stack>
    </Container>
  );
}
