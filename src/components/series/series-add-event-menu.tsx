import { useState } from 'react';
import type { JSX } from 'react';
import { Button, Menu } from '@mantine/core';
import {
  IconPlus, IconChevronDown, IconSwords, IconTrophy, IconRepeat, IconFlag, IconCalendarPlus, IconCalendarTime,
} from '@tabler/icons-react';
import type { SeriesEntrantDto, SeriesStageDto } from '@/shared/series-types';
import { schedulableEntrants } from './series-fixtures';
import { CreateMatchModal, CreateTournamentModal } from './series-create-event-modals';
import { RaceCalendarModal, RoundRobinModal } from './series-generator-modals';
import { PlannedMatchModal, PlannedScheduleModal } from './series-placeholder-modals';
import { PlannedEventModal } from './series-planned-modal';
import { runWithToast, scheduleApi } from './series-schedule-api';
import { defaultStageId } from './series-template';
import type { SeriesEventView, SeriesSummary } from './series-shared';

type Flow = 'match' | 'tournament' | 'round-robin' | 'race-calendar' | 'playoff' | 'plan-schedule' | 'plan-match' | null;

interface SeriesAddEventMenuProps {
  series: SeriesSummary;
  stages: SeriesStageDto[];
  entrants: SeriesEntrantDto[];
  events: SeriesEventView[];
  disabled?: boolean;
  onChanged: () => void;
}

/**
 * The schedule's "Add event" menu. Placeholders (a round robin / race calendar generated when registration closes, a
 * single match whose entrants are picked later, playoffs seeded from the standings) work before anyone has signed up;
 * creating events right away needs approved entrants.
 */
export function SeriesAddEventMenu({ series, stages, entrants, disabled, onChanged }: SeriesAddEventMenuProps): JSX.Element {
  const [flow, setFlow] = useState<Flow>(null);
  const normal = series.scoring_type === 'Normal';
  const hasType = !!series.scoring_type;
  const builderReady = hasType && schedulableEntrants(entrants).length > 0;
  const stageId = defaultStageId(stages);
  const close = () => setFlow(null);
  const common = { onClose: close, series, stages, entrants, defaultStageId: stageId, onCreated: onChanged };
  const scheduleKind = normal ? 'round_robin' : 'race_calendar';

  return (
    <>
      <Menu withinPortal position="bottom-end" disabled={disabled}>
        <Menu.Target>
          <Button size="xs" leftSection={<IconPlus size={14} />} rightSection={<IconChevronDown size={14} />} disabled={disabled}>
            Add event
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {!hasType && <Menu.Label>Set a scoring type to create events</Menu.Label>}
          <Menu.Label>Plan now, fill in later</Menu.Label>
          <Menu.Item leftSection={<IconCalendarTime size={14} />} disabled={!hasType} onClick={() => setFlow('plan-schedule')}>
            {normal ? 'Round robin (generated later)' : 'Race calendar (generated later)'}
          </Menu.Item>
          <Menu.Item leftSection={<IconSwords size={14} />} disabled={!hasType} onClick={() => setFlow('plan-match')}>Match placeholder</Menu.Item>
          <Menu.Item leftSection={<IconCalendarPlus size={14} />} disabled={!hasType} onClick={() => setFlow('playoff')}>Playoff placeholder</Menu.Item>
          <Menu.Divider />
          <Menu.Label>{builderReady ? 'Create now' : 'Create now (needs approved entrants)'}</Menu.Label>
          {normal && (
            <Menu.Item leftSection={<IconRepeat size={14} />} disabled={!builderReady} onClick={() => setFlow('round-robin')}>Round robin</Menu.Item>
          )}
          {!normal && (
            <Menu.Item leftSection={<IconFlag size={14} />} disabled={!builderReady} onClick={() => setFlow('race-calendar')}>Race calendar</Menu.Item>
          )}
          <Menu.Item leftSection={<IconTrophy size={14} />} disabled={!builderReady} onClick={() => setFlow('tournament')}>Tournament</Menu.Item>
          <Menu.Item leftSection={<IconSwords size={14} />} disabled={!builderReady} onClick={() => setFlow('match')}>Single match</Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <CreateMatchModal opened={flow === 'match'} {...common} />
      <CreateTournamentModal opened={flow === 'tournament'} {...common} />
      <RoundRobinModal opened={flow === 'round-robin'} {...common} />
      <RaceCalendarModal opened={flow === 'race-calendar'} {...common} />
      <PlannedEventModal opened={flow === 'playoff'} onClose={close} series={series} stages={stages} defaultStageId={stageId} onCreated={onChanged} />
      <PlannedScheduleModal
        opened={flow === 'plan-schedule'}
        kind={scheduleKind}
        series={series}
        stages={stages}
        defaultStageId={stageId}
        onClose={close}
        onSubmit={async (config) => {
          const ok = await runWithToast(`series-plan-${series.id}`, 'Adding to the schedule...', 'Planned schedule added',
            () => scheduleApi.createPlannedBatch(series.id, { kind: scheduleKind, config }));
          if (ok) onChanged();
          return ok !== null;
        }}
      />
      <PlannedMatchModal
        opened={flow === 'plan-match'}
        series={series}
        stages={stages}
        defaultStageId={stageId}
        onClose={close}
        onSubmit={async (input) => {
          const ok = await runWithToast(`series-plan-match-${series.id}`, 'Adding match placeholder...', 'Match placeholder added',
            () => scheduleApi.createPlannedMatch(series.id, input));
          if (ok) onChanged();
          return ok !== null;
        }}
      />
    </>
  );
}
