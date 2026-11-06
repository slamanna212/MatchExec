import { memo, useMemo } from 'react';
import type { JSX } from 'react';
import { Stack, Group, Text, Badge, Card, Button, ActionIcon, Menu, Tooltip } from '@mantine/core';
import {
  IconArrowUp, IconArrowDown, IconDots, IconEdit, IconTrash, IconFlagCheck, IconAdjustments, IconCalendarOff, IconCalendarStats,
  IconTrophy, IconRefresh, IconPlayerSkipForward, IconArrowsExchange,
} from '@tabler/icons-react';
import { EmptyState } from '@/components/EmptyState';
import { SectionLabel } from '@/components/SectionLabel';
import type { SeriesStageDto, SeriesStageStatus } from '@/shared/series-types';
import { SeriesEventRow } from './series-event-row';
import { STRUCTURE_LOCKED_HINT, byEventOrder } from './series-schedule-helpers';
import type { ScheduleSection, SeriesEditLevel } from './series-schedule-helpers';
import type { SeriesEventView } from './series-shared';

const STAGE_STATUS_COLOR: Record<SeriesStageStatus, string> = { upcoming: 'gray', active: 'green', complete: 'blue' };

/** Callbacks the schedule rows and stage headers use (supplied by `SeriesSchedulePanel`, kept referentially stable). */
export interface ScheduleHandlers {
  editEvent: (event: SeriesEventView) => void;
  removeEvent: (event: SeriesEventView) => void;
  moveEvent: (event: SeriesEventView, patch: { event_order: number }) => void;
  moveToStage: (event: SeriesEventView, stageId: string | null) => void;
  regenerateBatch: (event: SeriesEventView) => void;
  removeBatch: (event: SeriesEventView) => void;
  seed: (event: SeriesEventView) => void;
  renameStage: (stage: SeriesStageDto) => void;
  moveStage: (stage: SeriesStageDto, delta: -1 | 1) => void;
  completeStage: (stage: SeriesStageDto) => void;
  editStageScoring: (stage: SeriesStageDto) => void;
  toggleStageCounts: (stage: SeriesStageDto) => void;
  deleteStage: (stage: SeriesStageDto) => void;
}

export const SCHEDULE_HANDLER_KEYS = [
  'editEvent', 'removeEvent', 'moveEvent', 'moveToStage', 'regenerateBatch', 'removeBatch', 'seed',
  'renameStage', 'moveStage', 'completeStage', 'editStageScoring', 'toggleStageCounts', 'deleteStage',
] as const satisfies ReadonlyArray<keyof ScheduleHandlers>;

/** Everything the schedule rows and stage headers need to act on the series. */
export interface ScheduleActions extends ScheduleHandlers {
  level: SeriesEditLevel;
  stages: SeriesStageDto[];
  seedableIds: ReadonlySet<string>;
  nextEventId: string | null;
}

/** The event_order a row would swap with when moved up / down (null at the ends). */
interface MoveTargets { up: number | null; down: number | null }

/** Neighbour orders for every event of a section, computed with one sort instead of one per row. */
function moveTargetsFor(events: readonly SeriesEventView[]): Map<string, MoveTargets> {
  const sorted = [...events].sort(byEventOrder);
  const map = new Map<string, MoveTargets>();
  sorted.forEach((e, i) => map.set(e.id, { up: sorted[i - 1]?.event_order ?? null, down: sorted[i + 1]?.event_order ?? null }));
  return map;
}

function EventActions({ event, targets, actions }: { event: SeriesEventView; targets: MoveTargets; actions: ScheduleActions }): JSX.Element | null {
  const { level } = actions;
  if (level === 'none') return null;
  const structure = level === 'full';
  const up = targets.up === null ? null : { event_order: targets.up };
  const down = targets.down === null ? null : { event_order: targets.down };
  const otherStages = actions.stages.filter((s) => s.id !== event.stage_id);
  const planned = event.status === 'planned';
  const ready = actions.seedableIds.has(event.id);

  return (
    <>
      {planned && (
        <Button
          size="compact-xs"
          variant={ready ? 'filled' : 'light'}
          color="violet"
          leftSection={<IconTrophy size={12} />}
          onClick={() => actions.seed(event)}
        >
          Seed playoffs
        </Button>
      )}
      <Tooltip label={STRUCTURE_LOCKED_HINT} withArrow disabled={structure}>
        <ActionIcon
          variant="subtle" size="sm" aria-label="Move event up"
          disabled={!structure || !up}
          onClick={() => { if (up) actions.moveEvent(event, up); }}
        >
          <IconArrowUp size={14} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={STRUCTURE_LOCKED_HINT} withArrow disabled={structure}>
        <ActionIcon
          variant="subtle" size="sm" aria-label="Move event down"
          disabled={!structure || !down}
          onClick={() => { if (down) actions.moveEvent(event, down); }}
        >
          <IconArrowDown size={14} />
        </ActionIcon>
      </Tooltip>
      <Menu withinPortal position="bottom-end">
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Event actions">
            <IconDots size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => actions.editEvent(event)}>Edit...</Menu.Item>
          {(otherStages.length > 0 || event.stage_id) && (
            <>
              <Menu.Divider />
              <Menu.Label>Move to stage</Menu.Label>
              {otherStages.map((s) => (
                <Menu.Item key={s.id} leftSection={<IconArrowsExchange size={14} />} onClick={() => actions.moveToStage(event, s.id)}>
                  {s.name}
                </Menu.Item>
              ))}
              {event.stage_id && (
                <Menu.Item leftSection={<IconArrowsExchange size={14} />} onClick={() => actions.moveToStage(event, null)}>Unstaged</Menu.Item>
              )}
            </>
          )}
          {event.batch_id && (
            <>
              <Menu.Divider />
              <Menu.Label>Generated schedule</Menu.Label>
              <Menu.Item leftSection={<IconRefresh size={14} />} onClick={() => actions.regenerateBatch(event)}>Regenerate unplayed</Menu.Item>
              <Menu.Item color="red" leftSection={<IconPlayerSkipForward size={14} />} onClick={() => actions.removeBatch(event)}>
                Remove unplayed
              </Menu.Item>
            </>
          )}
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => actions.removeEvent(event)}>Remove from series</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}

function StageHeader({ stage, count, index, total, actions }: {
  stage: SeriesStageDto; count: number; index: number; total: number; actions: ScheduleActions;
}): JSX.Element {
  const editable = actions.level !== 'none';
  return (
    <Group justify="space-between" wrap="nowrap" align="center">
      <Group gap="xs" wrap="wrap" style={{ minWidth: 0 }}>
        <Text fw={600} size="lg" truncate>{stage.name}</Text>
        <Badge size="sm" variant="light" color={STAGE_STATUS_COLOR[stage.status]}>{stage.status}</Badge>
        {!stage.counts_toward_season && (
          <Tooltip label="This stage's results do not feed the season table" withArrow>
            <Badge size="sm" variant="outline" color="gray" leftSection={<IconCalendarOff size={10} />}>Not in season</Badge>
          </Tooltip>
        )}
        {stage.scoring_config && <Badge size="sm" variant="outline" color="violet">Custom scoring</Badge>}
        <Text size="xs" c="dimmed">{count} {count === 1 ? 'event' : 'events'}</Text>
      </Group>
      {editable && (
        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
          {stage.status !== 'complete' && (
            <Button size="compact-xs" variant="light" leftSection={<IconFlagCheck size={12} />} onClick={() => actions.completeStage(stage)}>
              Complete stage
            </Button>
          )}
          <Menu withinPortal position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${stage.name}`}><IconDots size={16} /></ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => actions.renameStage(stage)}>Rename...</Menu.Item>
              <Menu.Item leftSection={<IconArrowUp size={14} />} disabled={index === 0} onClick={() => actions.moveStage(stage, -1)}>Move up</Menu.Item>
              <Menu.Item leftSection={<IconArrowDown size={14} />} disabled={index === total - 1} onClick={() => actions.moveStage(stage, 1)}>Move down</Menu.Item>
              <Menu.Divider />
              <Menu.Item leftSection={<IconAdjustments size={14} />} onClick={() => actions.editStageScoring(stage)}>Scoring override...</Menu.Item>
              <Menu.Item leftSection={<IconCalendarStats size={14} />} onClick={() => actions.toggleStageCounts(stage)}>
                {stage.counts_toward_season ? 'Exclude from season table' : 'Count toward season table'}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => actions.deleteStage(stage)}>Delete stage</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      )}
    </Group>
  );
}

const NO_TARGETS: MoveTargets = { up: null, down: null };

interface ScheduleEventItemProps {
  event: SeriesEventView;
  targets: MoveTargets;
  isNext: boolean;
  ready: boolean;
  actions: ScheduleActions;
}

/** Memoized row: re-renders only when its own event, flags or the (stable) actions change. */
const ScheduleEventItem = memo(function ScheduleEventItem({ event, targets, isNext, ready, actions }: ScheduleEventItemProps): JSX.Element {
  return (
    <SeriesEventRow
      event={event}
      isNext={isNext}
      ready={ready}
      actions={<EventActions event={event} targets={targets} actions={actions} />}
    />
  );
});

interface SeriesStageSectionProps {
  section: ScheduleSection;
  index: number;
  total: number;
  actions: ScheduleActions;
}

/** One stage (or the "Unstaged" group) of the schedule: header, then events, grouped by week when weeks are set. */
export function SeriesStageSection({ section, index, total, actions }: SeriesStageSectionProps): JSX.Element {
  const { stage } = section;
  const targets = useMemo(() => moveTargetsFor(section.events), [section.events]);
  return (
    <Stack gap="xs" data-testid={`stage-section-${section.key}`}>
      {stage ? (
        <StageHeader stage={stage} count={section.events.length} index={index} total={total} actions={actions} />
      ) : (
        <Group gap="xs">
          <Text fw={600} size="lg">Unstaged</Text>
          <Text size="xs" c="dimmed">{section.events.length} {section.events.length === 1 ? 'event' : 'events'}</Text>
        </Group>
      )}

      {section.events.length === 0 ? (
        <Card withBorder radius="md">
          <EmptyState
            icon={IconCalendarStats}
            title="No events in this stage"
            description="Use Add event to create matches or tournaments here, or move existing events into it"
          />
        </Card>
      ) : (
        section.weeks.map((group) => (
          <Stack key={group.week ?? 'none'} gap="xs">
            {section.showWeekHeaders && (
              <SectionLabel>{group.week === null ? 'No week' : `Week ${group.week}`}</SectionLabel>
            )}
            {group.events.map((ev) => (
              <ScheduleEventItem
                key={ev.id}
                event={ev}
                targets={targets.get(ev.id) ?? NO_TARGETS}
                isNext={actions.nextEventId === ev.id}
                ready={actions.seedableIds.has(ev.id)}
                actions={actions}
              />
            ))}
          </Stack>
        ))
      )}
    </Stack>
  );
}
