import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Modal, Stack, Group, Button, Text, Badge, Alert, Loader, Center, Divider, Checkbox } from '@mantine/core';
import { IconAlertTriangle, IconAlertCircle } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import type { SeedPreviewResponse } from '@/shared/series-types';
import { seedOverride } from './series-schedule-helpers';
import { SeedOrderList } from './series-seed-order-list';
import { errorMessage, runWithToast, scheduleApi } from './series-schedule-api';
import type { SeriesEventView } from './series-shared';

interface SeedModalProps {
  seriesId: string;
  /** The planned event to seed; the modal is open while this is set. */
  event: SeriesEventView | null;
  onClose: () => void;
  onSeeded: () => void;
}

function SeedForm({ seriesId, event, onClose, onSeeded }: Omit<SeedModalProps, 'event'> & { event: SeriesEventView }): JSX.Element {
  const [preview, setPreview] = useState<SeedPreviewResponse | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [force, setForce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await scheduleApi.seedPreview(seriesId, event.id);
        if (cancelled) return;
        const sorted = [...res.qualifiers].sort((a, b) => a.seed - b.seed);
        setPreview({ ...res, qualifiers: sorted });
        setOrder(sorted.map((q) => q.entrant_id));
      } catch (err) {
        logger.error('Error loading seed preview:', err);
        if (!cancelled) setError(errorMessage(err, 'Failed to load the qualifiers'));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [seriesId, event.id]);

  const byId = new Map((preview?.qualifiers ?? []).map((q) => [q.entrant_id, q]));
  const reordered = preview ? seedOverride(preview.qualifiers, order) !== undefined : false;
  // A custom seed order is an explicit choice and skips the stage check; otherwise an unfinished source needs confirming.
  const blocked = !!preview && preview.blockers.length > 0 && !reordered && !force;

  const submit = async () => {
    if (!preview) return;
    setSaving(true);
    const res = await runWithToast(
      `series-seed-${event.id}`, 'Seeding playoffs...', 'Playoffs seeded',
      () => scheduleApi.seedEvent(seriesId, event.id, seedOverride(preview.qualifiers, order), force),
    );
    setSaving(false);
    if (res) { onClose(); onSeeded(); }
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        These entrants qualify, in seed order. Move entrants up or down to change the seeding before the bracket is created.
      </Text>
      {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
      {!preview && !error && <Center py="lg"><Loader /></Center>}
      {preview && preview.warnings.length > 0 && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />} title="Check before seeding">
          <Stack gap={2}>{preview.warnings.map((w) => <Text key={w} size="sm">{w}</Text>)}</Stack>
          {preview.blockers.length > 0 && !reordered && (
            <Checkbox mt="xs" size="xs" checked={force} onChange={(e) => setForce(e.currentTarget.checked)}
              label="Seed anyway (the standings may still change)" />
          )}
        </Alert>
      )}
      {preview && preview.qualifiers.length === 0 && <Text size="sm" c="dimmed" ta="center">Nobody qualifies yet.</Text>}
      {preview && preview.qualifiers.length > 0 && (
        <SeedOrderList
          items={order.map((id) => {
            const q = byId.get(id);
            return {
              id,
              name: q?.name ?? id,
              detail: (
                <Group gap={4} wrap="nowrap">
                  {q?.division && <Badge size="xs" variant="outline" color="gray">{q.division}</Badge>}
                  <Badge size="xs" variant="light" color="gray">Rank {q?.rank ?? '?'}</Badge>
                </Group>
              ),
            };
          })}
          onChange={setOrder}
        />
      )}
      {reordered && <Text size="xs" c="violet">Custom seed order: it overrides the standings.</Text>}
      <Divider />
      <Group justify="flex-end">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={() => { void submit(); }} loading={saving} disabled={!preview || preview.qualifiers.length < 2 || blocked}>
          Seed playoffs
        </Button>
      </Group>
    </Stack>
  );
}

/** Seed a planned playoff: shows the qualifiers from the standings, lets you reorder them, then creates the bracket. */
export function SeedPlayoffsModal({ seriesId, event, onClose, onSeeded }: SeedModalProps): JSX.Element {
  return (
    <Modal opened={event !== null} onClose={onClose} title={event ? `Seed ${event.name ?? 'playoffs'}` : 'Seed playoffs'} size="md">
      {event && <SeedForm seriesId={seriesId} event={event} onClose={onClose} onSeeded={onSeeded} />}
    </Modal>
  );
}
