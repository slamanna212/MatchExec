'use client'

import { useState, useMemo, useEffect } from 'react';
import type { JSX, ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container, Stack, Button, Stepper, Group, Text, TextInput, Divider } from '@mantine/core';
import {
  IconTimeline, IconArrowLeft, IconInfoCircle, IconBell, IconCalculator,
  IconListDetails, IconListCheck, IconSearch,
} from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { logger } from '@/lib/logger/client';
import { notificationHelper, showError } from '@/lib/notifications';
import {
  useSeriesForm, buildSeriesPayload, SeriesDetailsFields, SeriesNotificationsFields,
  SeriesScoringFields, SeriesFormCard,
} from './series-form';
import type { PickedEvent, SeriesFormData } from './series-form';
import {
  useEventCandidates, filterCandidates, EventPickerList, EventPickerRow, EventTypeBadge, candidateKey,
} from './event-picker';
import { formatMultiplier, formatShortDate, formatPoints } from './series-shared';

const STEPS = [
  { label: 'Details', icon: IconInfoCircle },
  { label: 'Notifications', icon: IconBell },
  { label: 'Scoring', icon: IconCalculator },
  { label: 'Events', icon: IconListDetails },
  { label: 'Review', icon: IconListCheck },
] as const;

const DEFAULT_MULTIPLIER: Record<'match' | 'tournament', number> = { match: 1, tournament: 1.5 };

export function CreateSeriesPage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawStep = Number.parseInt(searchParams.get('step') ?? '1', 10);
  const step = Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= STEPS.length ? rawStep : 1;

  const { form, update, clear, pickedEvents, setPickedEvents } = useSeriesForm();
  const [submitting, setSubmitting] = useState<'create' | 'activate' | null>(null);

  const canProceed = (s: number) => (s === 1 ? form.name.trim().length > 0 : true);

  // A direct link to a later step (or a cleared form) without a name goes back to Details.
  const missingName = step > 1 && !canProceed(1);
  useEffect(() => {
    if (missingName) router.replace('/series/create?step=1');
  }, [missingName, router]);

  const goTo = (s: number) => {
    // Never skip past step 1 without a name (e.g. clicking a later stepper step).
    const target = s > 1 && !canProceed(1) ? 1 : s;
    router.push(`/series/create?step=${target}`);
  };

  const handleCancel = () => {
    clear();
    router.push('/series');
  };

  const handleBack = () => (step === 1 ? handleCancel() : goTo(step - 1));

  const handleCreate = async (activate: boolean) => {
    if (!canProceed(1)) {
      showError('Series name is required');
      goTo(1);
      return;
    }
    setSubmitting(activate ? 'activate' : 'create');
    const nid = 'series-create';
    notificationHelper.loading({ id: nid, message: 'Creating series...' });

    try {
      const res = await fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSeriesPayload(form)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        notificationHelper.update(nid, { type: 'error', message: err.error ?? 'Failed to create series' });
        return;
      }
      const { id } = await res.json() as { id: string };

      // Add picked events one by one, in the order they were picked. The series already
      // exists at this point, so a failure is reported and the user lands on the series page.
      const failed: string[] = [];
      for (const ev of Object.values(pickedEvents)) {
        try {
          const evRes = await fetch(`/api/series/${id}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_type: ev.type,
              ...(ev.type === 'match' ? { match_id: ev.id } : { tournament_id: ev.id }),
              points_multiplier: ev.multiplier,
            }),
          });
          if (!evRes.ok) {
            const err = await evRes.json().catch(() => ({}));
            failed.push(`${ev.name}${err.error ? ` (${err.error})` : ''}`);
          }
        } catch (err) {
          logger.error('Error adding series event:', err);
          failed.push(ev.name);
        }
      }

      if (failed.length > 0) {
        notificationHelper.update(nid, {
          type: 'warning',
          title: 'Series created with problems',
          message: `Couldn't add: ${failed.join(', ')}.${activate ? ' The series was not activated.' : ''}`,
        });
      } else if (activate) {
        const tRes = await fetch(`/api/series/${id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' }),
        });
        if (tRes.ok) {
          notificationHelper.update(nid, { type: 'success', message: 'Series created and activated!' });
        } else {
          const err = await tRes.json().catch(() => ({}));
          notificationHelper.update(nid, {
            type: 'warning',
            message: `Series created, but activation failed: ${err.error ?? 'unknown error'}`,
          });
        }
      } else {
        notificationHelper.update(nid, { type: 'success', message: 'Series created!' });
      }

      clear();
      router.push(`/series/${id}`);
    } catch (err) {
      logger.error('Error creating series:', err);
      notificationHelper.update(nid, { type: 'error', message: 'An error occurred while creating the series' });
    } finally {
      setSubmitting(null);
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
          action={
            <Button variant="outline" leftSection={<IconArrowLeft size={16} />} onClick={handleBack}>
              Back
            </Button>
          }
        />

        <Stepper active={step - 1} onStepClick={(i) => goTo(i + 1)} size="sm">
          {STEPS.map(({ label, icon: Icon }) => (
            <Stepper.Step key={label} label={label} icon={<Icon size={18} />} />
          ))}
        </Stepper>

        {step === 1 && <SeriesDetailsFields form={form} update={update} />}
        {step === 2 && <SeriesNotificationsFields form={form} update={update} />}
        {step === 3 && <SeriesScoringFields form={form} update={update} />}
        {step === 4 && <EventsStep picked={pickedEvents} setPicked={setPickedEvents} />}
        {step === 5 && <ReviewStep form={form} picked={pickedEvents} />}

        <Group justify="space-between">
          <Button variant="outline" onClick={handleBack} disabled={submitting !== null}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length ? (
            <Button onClick={() => goTo(step + 1)} disabled={!canProceed(step)}>
              Next: {STEPS[step].label}
            </Button>
          ) : (
            <Group gap="sm">
              <Button
                variant="outline"
                onClick={() => handleCreate(false)}
                loading={submitting === 'create'}
                disabled={submitting !== null}
              >
                Create Series
              </Button>
              <Button
                onClick={() => handleCreate(true)}
                loading={submitting === 'activate'}
                disabled={submitting !== null}
              >
                Create &amp; Activate
              </Button>
            </Group>
          )}
        </Group>
      </Stack>
    </Container>
  );
}

function EventsStep({
  picked,
  setPicked,
}: {
  picked: Record<string, PickedEvent>;
  setPicked: (updater: (prev: Record<string, PickedEvent>) => Record<string, PickedEvent>) => void;
}): JSX.Element {
  const { candidates, loading } = useEventCandidates();
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => filterCandidates(candidates, search), [candidates, search]);

  return (
    <SeriesFormCard title="Events (optional)">
      <Text size="sm" c="dimmed" mt={-8}>
        Add existing matches and tournaments now, or later from the series page.
      </Text>
      <TextInput
        placeholder="Search matches and tournaments..."
        leftSection={<IconSearch size={14} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      <EventPickerList
        candidates={filtered}
        loading={loading}
        maxHeight={420}
        emptyText={search ? 'No events match your search' : 'No matches or tournaments available'}
        renderRow={(c) => {
          const key = candidateKey(c);
          const isPicked = key in picked;
          return (
            <EventPickerRow
              key={key}
              candidate={c}
              selected={isPicked}
              onClick={() => setPicked(prev => {
                const next = { ...prev };
                if (isPicked) delete next[key];
                else next[key] = { type: c.type, id: c.id, name: c.name, multiplier: DEFAULT_MULTIPLIER[c.type] };
                return next;
              })}
              extra={
                <Group gap={6} wrap="nowrap" visibleFrom="xs">
                  <EventTypeBadge type={c.type} />
                  <Text size="xs" ff="monospace" fw={700} c="violet">{formatMultiplier(DEFAULT_MULTIPLIER[c.type])}</Text>
                </Group>
              }
            />
          );
        }}
      />
      {Object.keys(picked).length > 0 && (
        <Text size="xs" c="dimmed">
          {Object.keys(picked).length} selected · added in the order picked · multipliers can be changed until the series starts
        </Text>
      )}
    </SeriesFormCard>
  );
}

function ReviewRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
      <Text size="sm" fw={500} c="dimmed" style={{ flexShrink: 0 }}>{label}:</Text>
      <Text size="sm" ta="right" style={{ wordBreak: 'break-word' }}>{children}</Text>
    </Group>
  );
}

function ReviewStep({ form, picked }: { form: SeriesFormData; picked: Record<string, PickedEvent> }): JSX.Element {
  const start = form.start_date ? formatShortDate(`${form.start_date}T00:00:00`) : null;
  const end = form.end_date ? formatShortDate(`${form.end_date}T00:00:00`) : null;
  const sc = form.scoring_config;
  const placements = sc.tournament_position_points ?? [];
  const events = Object.values(picked);

  return (
    <SeriesFormCard title="Review">
      <Stack gap="sm">
        <ReviewRow label="Name">{form.name.trim() || '—'}</ReviewRow>
        <ReviewRow label="Dates">{start || end ? `${start ?? '?'} → ${end ?? '?'}` : '—'}</ReviewRow>
        <ReviewRow label="Livestream">{form.livestream_link.trim() || '—'}</ReviewRow>
        <ReviewRow label="Announcements">{form.announcements ? 'Enabled' : 'Disabled'}</ReviewRow>
        <ReviewRow label="Player Notifications">{form.player_notifications ? 'Enabled' : 'Disabled'}</ReviewRow>
        <Divider />
        <ReviewRow label="Match win / loss">
          {formatPoints(sc.match_win_points ?? 0)} / {formatPoints(sc.match_loss_points ?? 0)} pts
        </ReviewRow>
        <ReviewRow label="Placement points">
          {placements.length > 0 ? placements.map(formatPoints).join(' · ') : '—'}
        </ReviewRow>
        <ReviewRow label="Position matches">
          {sc.position_event_use_event_spread !== false ? 'Use their own point spread' : 'Win / loss points'}
        </ReviewRow>
        <Divider />
        <ReviewRow label="Events">
          {events.length === 0
            ? 'None yet'
            : events.map((e, i) => `#${i + 1} ${e.name} ${formatMultiplier(e.multiplier)}`).join(', ')}
        </ReviewRow>
      </Stack>
    </SeriesFormCard>
  );
}
