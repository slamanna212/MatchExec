import { useState, useEffect, useMemo, useRef } from 'react';
import type { JSX, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Container, Stack, Button, Stepper, Group, Text, Divider, Alert, List } from '@mantine/core';
import {
  IconTimeline, IconArrowLeft, IconInfoCircle, IconBell, IconCalculator,
  IconListCheck, IconSettings, IconCalendarEvent,
} from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { logger } from '@/lib/logger/client';
import { notificationHelper, showError, showWarning } from '@/lib/notifications';
import {
  useSeriesForm, buildSeriesPayload, draftSeriesFromForm, SeriesDetailsFields, SeriesNotificationsFields,
  SeriesScoringFields, SeriesFormCard,
} from './series-form';
import { SeriesLayoutEditor } from './series-layout-editor';
import { describeDraftItem, draftSections, isLayoutEmpty, layoutProblems, toLayoutInput } from './series-layout';
import { SeriesSetupFields, SeriesCopyEntrantsFields, useGameCatalog } from './series-setup-fields';
import { validateRosterInputs } from './series-setup';
import type { GameCatalog } from './series-setup';
import type { SeriesFormData } from './series-form';
import { formatShortDate, formatPoints, describeSeriesFormat } from './series-shared';

const STEPS = [
  { label: 'Details', icon: IconInfoCircle },
  { label: 'Setup', icon: IconSettings },
  { label: 'Scoring', icon: IconCalculator },
  { label: 'Schedule', icon: IconCalendarEvent },
  { label: 'Notifications', icon: IconBell },
  { label: 'Review', icon: IconListCheck },
] as const;

const SCHEDULE_STEP = 4;

export function CreateSeriesPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawStep = Number.parseInt(searchParams.get('step') ?? '1', 10);
  const step = Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= STEPS.length ? rawStep : 1;

  const { form, update, clear } = useSeriesForm();
  const { catalog, loaded: catalogLoaded } = useGameCatalog();
  const [submitting, setSubmitting] = useState(false);
  // Set once the series exists: clearing the form then must not bounce the user back to step 1 (see below).
  const createdRef = useRef(false);

  const rosterError = validateRosterInputs(form.entrant_type, form.roster_min, form.roster_max);
  const draftSeries = useMemo(() => draftSeriesFromForm(form), [form]);
  const scheduleProblems = layoutProblems(form.layout, form.scoring_type);
  const canProceed = (s: number) => {
    if (s === 1) return form.name.trim().length > 0;
    if (s === 2) return rosterError === null;
    if (s === SCHEDULE_STEP) return scheduleProblems.length === 0;
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

  const handleCreate = async () => {
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
    if (!canProceed(SCHEDULE_STEP)) {
      showError(scheduleProblems[0] ?? 'Check the schedule');
      goTo(SCHEDULE_STEP);
      return;
    }
    setSubmitting(true);
    const nid = 'series-create';
    notificationHelper.loading({ id: nid, message: 'Creating series...' });

    try {
      const res = await fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildSeriesPayload(form),
          ...(isLayoutEmpty(form.layout) ? {} : { layout: toLayoutInput(form.layout) }),
        }),
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

      notificationHelper.update(nid, {
        type: 'success',
        message: isLayoutEmpty(form.layout) ? 'Series created! Plan the schedule next.' : 'Series created with its schedule. Open registration when you are ready.',
      });

      if (copyWarning) showWarning(copyWarning, 'Entrants copied with problems');

      createdRef.current = true;
      clear();
      navigate(`/series/${id}`);
    } catch (err) {
      logger.error('Error creating series:', err);
      notificationHelper.update(nid, { type: 'error', message: 'An error occurred while creating the series' });
    } finally {
      setSubmitting(false);
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
        {step === 3 && <SeriesScoringFields form={form} update={update} />}
        {step === SCHEDULE_STEP && (
          <SeriesLayoutEditor layout={form.layout} onChange={(layout) => update('layout', layout)} series={draftSeries} catalog={catalog} />
        )}
        {step === 5 && <SeriesNotificationsFields form={form} update={update} />}
        {step === 6 && (
          <Stack gap="md">
            <ReviewStep form={form} catalog={catalog} />
            <NextStepsNote planned={!isLayoutEmpty(form.layout)} />
          </Stack>
        )}

        <Group justify="space-between">
          <Button variant="outline" onClick={handleBack} disabled={submitting}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step < STEPS.length ? (
            <Button onClick={() => goTo(step + 1)} disabled={!canProceed(step)}>
              Next: {STEPS[step].label}
            </Button>
          ) : (
            <Button onClick={() => { void handleCreate(); }} loading={submitting} disabled={submitting}>
              Create Series
            </Button>
          )}
        </Group>
      </Stack>
    </Container>
  );
}

/** What happens after the series is created: registration, then closing it builds the schedule from the layout. */
function NextStepsNote({ planned }: { planned: boolean }): JSX.Element {
  return (
    <Alert variant="light" color="blue" icon={<IconInfoCircle size={18} />} title="What happens next">
      <Stack gap={6}>
        <Text size="sm">
          The series is created as a draft: nothing is posted to Discord and players cannot register yet.
        </Text>
        <List size="sm" type="ordered" spacing={4}>
          {!planned && <List.Item>On the series page, plan the schedule: stages, round robins, matches and playoffs.</List.Item>}
          <List.Item><b>Open registration</b> to post the series to Discord; players sign up and you approve them.</List.Item>
          <List.Item>
            <b>Close registration</b> when sign-ups are done: you split divisions, assign the single matches, and the round robins / calendars are
            generated with the approved entrants. The season starts.
          </List.Item>
          <List.Item>Playoffs are seeded from the standings once the regular season is decided.</List.Item>
        </List>
      </Stack>
    </Alert>
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

function ScheduleReview({ form }: { form: SeriesFormData }): JSX.Element {
  if (isLayoutEmpty(form.layout)) return <ReviewRow label="Schedule">Planned later on the series page</ReviewRow>;
  return (
    <Stack gap={4}>
      {draftSections(form.layout).map((section) => (
        <ReviewRow key={section.stage?.key ?? 'unstaged'} label={section.stage?.name ?? (form.layout.stages.length > 0 ? 'Unstaged' : 'Schedule')}>
          {section.items.length > 0 ? section.items.map(describeDraftItem).join(' · ') : 'Empty'}
        </ReviewRow>
      ))}
    </Stack>
  );
}

function ReviewStep({ form, catalog }: { form: SeriesFormData; catalog: GameCatalog }): JSX.Element {
  const start = form.start_date ? formatShortDate(`${form.start_date}T00:00:00`) : null;
  const end = form.end_date ? formatShortDate(`${form.end_date}T00:00:00`) : null;
  const sc = form.scoring_config;
  const placements = sc.tournament_position_points ?? [];
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
        {form.entrant_type === 'team' && (
          <ReviewRow label="Team creation">{form.discord_team_creation ? 'Players can create teams from Discord' : 'Organizers only'}</ReviewRow>
        )}
        <ReviewRow label="Primary game">{form.game_id ? gameName(form.game_id) : '—'}</ReviewRow>
        <ReviewRow label="Copy entrants from">{form.previous_series_id ? 'A previous series' : 'No'}</ReviewRow>
        <Divider />
        <ScheduleReview form={form} />
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
      </Stack>
    </SeriesFormCard>
  );
}
