import { useState } from 'react';
import type { JSX } from 'react';
import { Button, Menu } from '@mantine/core';
import {
  IconPlus, IconSwords, IconTrophy, IconRepeat, IconFlag, IconCalendarPlus, IconChevronDown,
} from '@tabler/icons-react';
import type { SeriesEntrantDto, SeriesStageDto } from '@/shared/series-types';
import { CreateMatchModal, CreateTournamentModal } from './series-create-event-modals';
import { schedulableEntrants } from './series-fixtures';
import { RaceCalendarModal, RoundRobinModal } from './series-generator-modals';
import { PlannedEventModal } from './series-planned-modal';
import type { SeriesEventView, SeriesSummary } from './series-shared';
import { defaultStageId } from './series-template';

type Flow = 'match' | 'tournament' | 'round-robin' | 'race-calendar' | 'playoff';

interface SeriesAddEventMenuProps {
  series: SeriesSummary;
  stages: SeriesStageDto[];
  entrants: SeriesEntrantDto[];
  events: SeriesEventView[];
  disabled?: boolean;
  onChanged: () => void;
}

/** "Add event" dropdown: Round robin / Race calendar, Tournament, Single match, Playoff placeholder. */
export function SeriesAddEventMenu({ series, stages, entrants, disabled, onChanged }: SeriesAddEventMenuProps): JSX.Element {
  const [flow, setFlow] = useState<Flow | null>(null);
  const normal = series.scoring_type === 'Normal';
  const builderReady = !!series.scoring_type && schedulableEntrants(entrants).length > 0;
  const stageId = defaultStageId(stages);
  const close = () => setFlow(null);
  const common = { onClose: close, series, stages, entrants, defaultStageId: stageId, onCreated: onChanged };

  return (
    <>
      <Menu withinPortal position="bottom-end" disabled={disabled}>
        <Menu.Target>
          <Button size="xs" leftSection={<IconPlus size={14} />} rightSection={<IconChevronDown size={14} />} disabled={disabled}>
            Add event
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {!builderReady && (
            <Menu.Label>
              {series.scoring_type ? 'Add and approve entrants to create events' : 'Set a scoring type to create events'}
            </Menu.Label>
          )}
          {normal && (
            <Menu.Item leftSection={<IconRepeat size={14} />} disabled={!builderReady} onClick={() => setFlow('round-robin')}>Round robin</Menu.Item>
          )}
          {!normal && (
            <Menu.Item leftSection={<IconFlag size={14} />} disabled={!builderReady} onClick={() => setFlow('race-calendar')}>Race calendar</Menu.Item>
          )}
          <Menu.Item leftSection={<IconTrophy size={14} />} disabled={!builderReady} onClick={() => setFlow('tournament')}>Tournament</Menu.Item>
          <Menu.Divider />
          <Menu.Item leftSection={<IconSwords size={14} />} disabled={!builderReady} onClick={() => setFlow('match')}>Single match</Menu.Item>
          <Menu.Item leftSection={<IconCalendarPlus size={14} />} disabled={!builderReady} onClick={() => setFlow('playoff')}>
            Playoff placeholder
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <CreateMatchModal opened={flow === 'match'} {...common} />
      <CreateTournamentModal opened={flow === 'tournament'} {...common} />
      <RoundRobinModal opened={flow === 'round-robin'} {...common} />
      <RaceCalendarModal opened={flow === 'race-calendar'} {...common} />
      <PlannedEventModal opened={flow === 'playoff'} onClose={close} series={series} stages={stages} defaultStageId={stageId} onCreated={onChanged} />
    </>
  );
}
