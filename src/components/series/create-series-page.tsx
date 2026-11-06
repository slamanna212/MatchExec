import { useState, useMemo, useEffect, useRef } from 'react';
import type { JSX, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Container, Stack, Button, Stepper, Group, Text, TextInput, Divider } from '@mantine/core';
import {
  IconTimeline, IconArrowLeft, IconInfoCircle, IconBell, IconCalculator,
  IconListDetails, IconListCheck, IconSearch, IconSettings,
} from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { logger } from '@/lib/logger/client';
import { notificationHelper, showError, showWarning } from '@/lib/notifications';
import {
  useSeriesForm, buildSeriesPayload, SeriesDetailsFields, SeriesNotificationsFields,
  SeriesScoringFields, SeriesFormCard,
} from './series-form';
import { SeriesSetupFields, SeriesCopyEntrantsFields, useGameCatalog } from './series-setup-fields';
import { validateRosterInputs } from './series-setup';
import type { GameCatalog } from './series-setup';
import type { PickedEvent, SeriesFormData } from './series-form';
import {
  useEventCandidates, filterCandidates, EventPickerList, EventPickerRow, EventTypeBadge, candidateKey,
} from './event-picker';
import { formatMultiplier, formatShortDate, formatPoints, describeSeriesFormat } from './series-shared';

const STEPS = [
  { label: 'Details', icon: IconInfoCircle },
  { label: 'Setup', icon: IconSettings },
  { label: 'Notifications', icon: IconBell },
  { label: 'Scoring', icon: IconCalculator },
  { label: 'Events', icon: IconListDetails },
  { label: 'Review', icon: IconListCheck },
] as const;

const DEFAULT_MULTIPLIER: Record<'match' | 'tournament', number> = { match: 1, tournament: 1.5 };

export function CreateSeriesPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawStep = Number.parseInt(searchParams.get('step') ?? '1', 10);
  const step = Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= STEPS.length ? rawStep : 1;

  const { form, update, clear, pickedEvents, setPickedEvents } = useSeriesForm();
  const { catalog, loaded: catalogLoaded } = useGameCatalog();
  const [submitting, setSubmitting] = useState<'create' | 'activate' | null>(null);
  // Set once the series exists: clearing the form then must not bounce the user back to step 1 (see below).
  const createdRef = useRef(false);

  const rosterError = validateRosterInputs(form.entrant_type, form.roster_min, form.roster_max);
  const canProceed = (s: number) => {
    if (s === 1) return form.name.trim().length > 0;
    if (s === 2) return rosterError === null;
    return true;
  };

  // A direct link to a later step (or a cleared form) without a name goes back to Details.
  const missingName = step > 1 && !canProceed(1);
  useEffect(() => {
    // After a successful create the form is cleared before the redirect to the new series lands; without this guard
    // that redirect would be overridden by this one and the user would end up on an empty Details form.
    if (missingName && !createdRef.current) navigate('/series/create?step=1', { replace: true });
  }, [missingName, navigate]);

  const goTo = (s: number) => {
    // Never skip past step 1 without a name (e.g. clicking a later stepper step).
    const target = s > 1 && !canProceed(1) ? 1 : s;
    navigate(`/series/create?step=${target}`);
  };

  const handleCancel = () => {
    clear();
    navigate('/series');
  };

  const handleBack = () => (step === 1 ? handleCancel() : goTo(step - 1));

  const handleCreate = async (activate: boolean) => {
    if (!canProceed(1)) {
      showError('Series name is required');
      goTo(1);
      return;
    }
    if (!canProceed(2)) {
      showError(rosterError ?? 'Check the series setup');
      goTo(2);
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

      // Seed the entrants from the previous season. The series exists already, so problems are reported, not fatal.
      let copyWarning: string | null = null;
      if (form.previous_series_id) {
        try {
          const copyRes = await fetch(`/api/series/${id}/entrants/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_series_id: form.previous_series_id, include_members: form.copy_include_members }),
          });
          const copyData = await copyRes.json().catch(() => ({})) as { error?: string; skipped?: Array<{ name: string; reason: string }> };
          if (!copyRes.ok) {
            copyWarning = `Entrants were not copied: ${copyData.error ?? 'unknown error'}`;
          } else if (copyData.skipped && copyData.skipped.length > 0) {
            copyWarning = `Skipped: ${copyData.skipped.map((x) => x.name).join(', ')}`;
          }
        } catch (err) {
          logger.error('Error copying series entrants:', err);
          copyWarning = 'Entrants were not copied';
        }
      }

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

      if (copyWarning) showWarning(copyWarning, 'Entrants copied with problems');

      createdRef.current = true;
      clear();
      navigate(`/series/${id}`);
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
        {step === 2 && (
          <Stack gap="md">
            <SeriesSetupFields form={form} update={update} catalog={catalog} catalogLoaded={catalogLoaded} />
            <SeriesCopyEntrantsFields form={form} update={update} />
          </Stack>
        )}
        {step === 3 && <SeriesNotificationsFields form={form} update={update} />}
        {step === 4 && <SeriesScoringFields form={form} update={update} />}
        {step === 5 && <EventsStep picked={pickedEvents} setPicked={setPickedEvents} />}
        {step === 6 && <ReviewStep form={form} picked={pickedEvents} catalog={catalog} />}

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

function ReviewStep({ form, picked, catalog }: { form: SeriesFormData; picked: Record<string, PickedEvent>; catalog: GameCatalog }): JSX.Element {
  const start = form.start_date ? formatShortDate(`${form.start_date}T00:00:00`) : null;
  const end = form.end_date ? formatShortDate(`${form.end_date}T00:00:00`) : null;
  const sc = form.scoring_config;
  const placements = sc.tournament_position_points ?? [];
  const events = Object.values(picked);
  const gameName = (id: string) => catalog.games.find((g) => g.id === id)?.name ?? id;
  const allowedGames = form.game_ids.length > 0 ? form.game_ids : form.game_id ? [form.game_id] : [];
  const rosterText = form.entrant_type === 'team' && (form.roster_min !== null || form.roster_max !== null)
    ? ` (${form.roster_min ?? 1}-${form.roster_max ?? 'any'} players)`
    : '';

  return (
    <SeriesFormCard title="Review">
      <Stack gap="sm">
        <ReviewRow label="Name">{form.name.trim() || '—'}</ReviewRow>
        <ReviewRow label="Dates">{start || end ? `${start ?? '?'} → ${end ?? '?'}` : '—'}</ReviewRow>
        <ReviewRow label="Livestream">{form.livestream_link.trim() || '—'}</ReviewRow>
        <Divider />
        <ReviewRow label="Format">
          {form.scoring_type ? `${describeSeriesFormat(form.entrant_type, form.scoring_type)}${rosterText}` : '—'}
        </ReviewRow>
        <ReviewRow label="Games">{allowedGames.length > 0 ? allowedGames.map(gameName).join(', ') : 'Any'}</ReviewRow>
        <ReviewRow label="Primary game">{form.game_id ? gameName(form.game_id) : '—'}</ReviewRow>
        <ReviewRow label="Copy entrants from">{form.previous_series_id ? 'A previous series' : 'No'}</ReviewRow>
        <Divider />
        <ReviewRow label="Announcements">{form.announcements ? 'Enabled' : 'Disabled'}</ReviewRow>
        <ReviewRow label="Player Notifications">{form.player_notifications ? 'Enabled' : 'Disabled'}</ReviewRow>
        <ReviewRow label="Discord posts">
          {[
            form.discord_registration_posts && 'registration',
            form.discord_weekly_schedule && 'weekly schedule',
            form.discord_standings_posts && 'standings',
          ].filter(Boolean).join(', ') || 'None'}
        </ReviewRow>
        <Divider />
        {sc.mode === 'head_to_head' ? (
          <ReviewRow label="Win / loss / tie">
            {formatPoints(sc.win_points ?? 0)} / {formatPoints(sc.loss_points ?? 0)} / {formatPoints(sc.tie_points ?? 0)} pts
          </ReviewRow>
        ) : (
          <>
            {sc.mode === 'points' && (
              <ReviewRow label="Position points">
                {(sc.position_points ?? []).length > 0 ? (sc.position_points ?? []).map(formatPoints).join(' · ') : '—'}
              </ReviewRow>
            )}
            <ReviewRow label="Match win / loss">
              {formatPoints(sc.match_win_points ?? 0)} / {formatPoints(sc.match_loss_points ?? 0)} pts
            </ReviewRow>
            <ReviewRow label="Placement points">
              {placements.length > 0 ? placements.map(formatPoints).join(' · ') : '—'}
            </ReviewRow>
            <ReviewRow label="Position matches">
              {sc.position_event_use_event_spread !== false ? 'Use their own point spread' : 'Win / loss points'}
            </ReviewRow>
          </>
        )}
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
