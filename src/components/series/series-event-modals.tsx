import { useState, useMemo, useEffect } from 'react';
import type { JSX } from 'react';
import {
  Modal, Stack, Group, Button, NumberInput, SegmentedControl, TextInput, Divider, Text, Select, Switch,
} from '@mantine/core';
import { IconSearch, IconListNumbers, IconLock } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { notificationHelper } from '@/lib/notifications';
import type { SeriesEventRole, SeriesStageDto } from '@/shared/series-types';
import { useEventCandidates, filterCandidates, EventPickerList, EventPickerRow, candidateKey } from './event-picker';
import { PlacementFields } from './series-event-fields';
import { MultiplierInput, isValidMultiplier } from './series-multiplier-input';
import type { SeriesEditLevel } from './series-schedule-helpers';
import { STRUCTURE_LOCKED_HINT } from './series-schedule-helpers';
import { EVENT_ROLE_LABEL } from './series-shared';
import type { SeriesEventView } from './series-shared';
import { defaultPlacement, placementPayload } from './series-template';

interface AddSeriesEventModalProps {
  opened: boolean;
  onClose: () => void;
  seriesId: string;
  events: SeriesEventView[];
  stages?: SeriesStageDto[];
  defaultStageId?: string | null;
  onAdded: () => void;
}

/** Attach an existing match or tournament to the series (the original flow, now with stage / role / week). */
export function AddSeriesEventModal({
  opened, onClose, seriesId, events, stages = [], defaultStageId = null, onAdded,
}: AddSeriesEventModalProps): JSX.Element {
  const [type, setType] = useState<'match' | 'tournament'>('match');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placement, setPlacement] = useState(() => defaultPlacement(defaultStageId));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const { candidates, loading } = useEventCandidates(opened);

  // Reset whenever the modal opens.
  useEffect(() => {
    if (opened) {
      setType('match');
      setSelectedId(null);
      setPlacement(defaultPlacement(defaultStageId));
      setSearch('');
    }
  }, [opened, defaultStageId]);

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
    if (!selectedId || !isValidMultiplier(placement.points_multiplier)) return;
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
          ...placementPayload(placement),
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
    <Modal opened={opened} onClose={onClose} title="Attach existing event" size="md">
      <Stack gap="md">
        <SegmentedControl
          fullWidth
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
        <PlacementFields value={placement} onChange={setPlacement} stages={stages} />
        <Group gap={6} wrap="nowrap">
          <IconListNumbers size={14} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
          <Text size="xs" c="dimmed">
            Will be added as event #{nextOrder}{last ? `, after ${last.name ?? 'the last event'}` : ''}.
          </Text>
        </Group>
        <Divider />
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleAdd} loading={saving} disabled={!selectedId || !isValidMultiplier(placement.points_multiplier)}>
            Add Event
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface EditSeriesEventModalProps {
  seriesId: string;
  event: SeriesEventView | null;
  /** `full`: everything is editable; `placement`: only week (the rest is locked once the series starts). */
  level: SeriesEditLevel;
  onClose: () => void;
  onSaved: () => void;
}

const ROLE_OPTIONS = (Object.keys(EVENT_ROLE_LABEL) as SeriesEventRole[]).map((r) => ({ value: r, label: EVENT_ROLE_LABEL[r] }));

export function EditSeriesEventModal({ seriesId, event, level, onClose, onSaved }: EditSeriesEventModalProps): JSX.Element {
  const [multiplier, setMultiplier] = useState<number | string>(1);
  const [order, setOrder] = useState<number | string>(1);
  const [week, setWeek] = useState<number | string>('');
  const [role, setRole] = useState<SeriesEventRole>('regular');
  const [counts, setCounts] = useState(true);
  const [saving, setSaving] = useState(false);
  const structure = level === 'full';

  useEffect(() => {
    if (event) {
      setMultiplier(event.points_multiplier);
      setOrder(event.event_order);
      setWeek(event.week ?? '');
      setRole(event.role);
      setCounts(event.counts_for_standings);
    }
  }, [event]);

  const orderValid = typeof order === 'number' && Number.isInteger(order) && order >= 1;
  const weekValue = typeof week === 'number' ? week : null;

  const handleSave = async () => {
    if (!event || !isValidMultiplier(multiplier) || !orderValid) return;
    const changes: Record<string, unknown> = {};
    if (structure) {
      if (multiplier !== event.points_multiplier) changes.points_multiplier = multiplier;
      if (order !== event.event_order) changes.event_order = order as number;
      if (role !== event.role) changes.role = role;
      if (counts !== event.counts_for_standings) changes.counts_for_standings = counts;
    }
    if (weekValue !== event.week) changes.week = weekValue;
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
        <MultiplierInput value={multiplier} onChange={setMultiplier} disabled={!structure} />
        <NumberInput
          label="Order"
          description="If another event already has this number, the two swap places"
          value={order}
          onChange={setOrder}
          min={1}
          step={1}
          allowDecimal={false}
          disabled={!structure}
          error={order !== '' && !orderValid ? 'Must be a whole number of 1 or more' : undefined}
        />
        <Select
          label="Role"
          data={ROLE_OPTIONS}
          value={role}
          onChange={(v) => { if (v) setRole(v as SeriesEventRole); }}
          allowDeselect={false}
          disabled={!structure}
        />
        <Switch
          label="Counts for standings"
          checked={counts}
          onChange={(e) => setCounts(e.currentTarget.checked)}
          disabled={!structure}
        />
        <NumberInput
          label="Week"
          placeholder="No week"
          value={week}
          onChange={setWeek}
          min={1}
          allowDecimal={false}
        />
        {!structure && (
          <Group gap={6} wrap="nowrap">
            <IconLock size={14} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
            <Text size="xs" c="dimmed">{STRUCTURE_LOCKED_HINT}.</Text>
          </Group>
        )}
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
