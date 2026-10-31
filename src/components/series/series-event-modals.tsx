'use client'

import { useState, useMemo, useEffect } from 'react';
import type { JSX } from 'react';
import {
  Modal, Stack, Group, Button, NumberInput, SegmentedControl, TextInput, Divider, Text,
} from '@mantine/core';
import { IconSearch, IconListNumbers } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { notificationHelper } from '@/lib/notifications';
import classes from '@/components/gradient-segmented-control.module.css';
import { useEventCandidates, filterCandidates, EventPickerList, EventPickerRow, candidateKey } from './event-picker';
import { formatMultiplier } from './series-shared';
import type { SeriesEventDetail } from './series-shared';

const QUICK_MULTIPLIERS = [1, 1.5, 2, 3];

function isValidMultiplier(v: number | string): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0.1 && v <= 10;
}

function MultiplierInput({ value, onChange }: { value: number | string; onChange: (v: number | string) => void }): JSX.Element {
  return (
    <div>
      <NumberInput
        label="Points Multiplier"
        description="Points from this event are multiplied by this value"
        value={value}
        onChange={onChange}
        min={0.1}
        max={10}
        step={0.5}
        decimalScale={2}
        allowDecimal
        error={value !== '' && !isValidMultiplier(value) ? 'Must be between 0.1 and 10' : undefined}
      />
      <Group gap={6} mt="xs">
        {QUICK_MULTIPLIERS.map(m => (
          <Button
            key={m}
            size="compact-sm"
            radius="xl"
            variant={value === m ? 'filled' : 'default'}
            color="violet"
            ff="monospace"
            onClick={() => onChange(m)}
          >
            {formatMultiplier(m)}
          </Button>
        ))}
      </Group>
    </div>
  );
}

interface AddSeriesEventModalProps {
  opened: boolean;
  onClose: () => void;
  seriesId: string;
  events: SeriesEventDetail[];
  onAdded: () => void;
}

export function AddSeriesEventModal({ opened, onClose, seriesId, events, onAdded }: AddSeriesEventModalProps): JSX.Element {
  const [type, setType] = useState<'match' | 'tournament'>('match');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState<number | string>(1);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const { candidates, loading } = useEventCandidates(opened);

  // Reset whenever the modal opens.
  useEffect(() => {
    if (opened) {
      setType('match');
      setSelectedId(null);
      setMultiplier(1);
      setSearch('');
    }
  }, [opened]);

  const existing = useMemo(() => new Set(events.map(e =>
    e.event_type === 'match' ? `match:${e.match_id}` : `tournament:${e.tournament_id}`
  )), [events]);

  const visible = useMemo(
    () => filterCandidates(candidates.filter(c => c.type === type && !existing.has(candidateKey(c))), search),
    [candidates, type, existing, search]
  );

  const last = events.length > 0 ? events.reduce((a, b) => (b.event_order > a.event_order ? b : a)) : null;
  const nextOrder = (last?.event_order ?? 0) + 1;

  const handleAdd = async () => {
    if (!selectedId || !isValidMultiplier(multiplier)) return;
    setSaving(true);
    const nid = `series-add-event-${seriesId}`;
    notificationHelper.loading({ id: nid, message: 'Adding event...' });
    try {
      const res = await fetch(`/api/series/${seriesId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: type,
          ...(type === 'match' ? { match_id: selectedId } : { tournament_id: selectedId }),
          points_multiplier: multiplier,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notificationHelper.update(nid, { type: 'error', message: data.error ?? 'Failed to add event' });
        return;
      }
      notificationHelper.update(nid, { type: 'success', message: 'Event added to series' });
      onClose();
      onAdded();
    } catch (err) {
      logger.error('Error adding series event:', err);
      notificationHelper.update(nid, { type: 'error', message: 'An error occurred while adding the event' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add Event to Series" size="md">
      <Stack gap="md">
        <SegmentedControl
          fullWidth
          radius="xl"
          classNames={classes}
          data={[{ label: 'Match', value: 'match' }, { label: 'Tournament', value: 'tournament' }]}
          value={type}
          onChange={(v) => { setType(v as 'match' | 'tournament'); setSelectedId(null); }}
        />
        <TextInput
          placeholder={type === 'match' ? 'Search matches...' : 'Search tournaments...'}
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <EventPickerList
          candidates={visible}
          loading={loading}
          emptyText={search ? 'Nothing matches your search' : `No ${type === 'match' ? 'matches' : 'tournaments'} available to add`}
          renderRow={(c) => (
            <EventPickerRow
              key={candidateKey(c)}
              candidate={c}
              selected={selectedId === c.id}
              onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
            />
          )}
        />
        <MultiplierInput value={multiplier} onChange={setMultiplier} />
        <Group gap={6} wrap="nowrap">
          <IconListNumbers size={14} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
          <Text size="xs" c="dimmed">
            Will be added as event #{nextOrder}{last ? `, after ${last.name ?? 'the last event'}` : ''}.
          </Text>
        </Group>
        <Divider />
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleAdd} loading={saving} disabled={!selectedId || !isValidMultiplier(multiplier)}>
            Add Event
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface EditSeriesEventModalProps {
  seriesId: string;
  event: SeriesEventDetail | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditSeriesEventModal({ seriesId, event, onClose, onSaved }: EditSeriesEventModalProps): JSX.Element {
  const [multiplier, setMultiplier] = useState<number | string>(1);
  const [order, setOrder] = useState<number | string>(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (event) {
      setMultiplier(event.points_multiplier);
      setOrder(event.event_order);
    }
  }, [event]);

  const orderValid = typeof order === 'number' && Number.isInteger(order) && order >= 1;

  const handleSave = async () => {
    if (!event || !isValidMultiplier(multiplier) || !orderValid) return;
    const changes: Record<string, number> = {};
    if (multiplier !== event.points_multiplier) changes.points_multiplier = multiplier;
    if (order !== event.event_order) changes.event_order = order as number;
    if (Object.keys(changes).length === 0) { onClose(); return; }

    setSaving(true);
    const nid = `series-edit-event-${event.id}`;
    notificationHelper.loading({ id: nid, message: 'Saving event...' });
    try {
      const res = await fetch(`/api/series/${seriesId}/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notificationHelper.update(nid, { type: 'error', message: data.error ?? 'Failed to update event' });
        return;
      }
      notificationHelper.update(nid, {
        type: 'success',
        message: data.swapped_with ? 'Event updated (swapped places with the event that had that number)' : 'Event updated',
      });
      onClose();
      onSaved();
    } catch (err) {
      logger.error('Error updating series event:', err);
      notificationHelper.update(nid, { type: 'error', message: 'An error occurred while saving the event' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={event !== null} onClose={onClose} title="Edit Event" size="sm">
      <Stack gap="md">
        {event?.name && (
          <Text size="sm" c="dimmed">#{event.event_order} · {event.name}</Text>
        )}
        <MultiplierInput value={multiplier} onChange={setMultiplier} />
        <NumberInput
          label="Order"
          description="If another event already has this number, the two swap places"
          value={order}
          onChange={setOrder}
          min={1}
          step={1}
          allowDecimal={false}
          error={order !== '' && !orderValid ? 'Must be a whole number of 1 or more' : undefined}
        />
        <Divider />
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={!isValidMultiplier(multiplier) || !orderValid}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
