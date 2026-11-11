import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Stack, Group, Text, Card, Button, Alert, Loader, Center } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus, IconLock, IconListDetails, IconAlertCircle } from '@tabler/icons-react';
import { EmptyState } from '@/components/EmptyState';
import type { SeriesBatchDto, SeriesScoringConfig, SeriesStageDto } from '@/shared/series-types';
import { useSeriesEntrants } from './series-entrants-api';
import { schedulableEntrants } from './series-fixtures';
import {
  FillMatchModal, GenerateBatchModal, PlannedMatchModal, PlannedScheduleModal, ProjectedBracketModal, plannedMatchInputOf,
} from './series-placeholder-modals';
import { SeriesAddEventMenu } from './series-add-event-menu';
import { EditSeriesEventModal } from './series-event-modals';
import { SeedPlayoffsModal } from './series-seed-modal';
import { buildSchedule, editLevel, isSeedable, stageMovePatch, unplayedInBatch } from './series-schedule-helpers';
import { runWithToast, scheduleApi, useSeriesStages } from './series-schedule-api';
import { SCHEDULE_HANDLER_KEYS, SeriesStageSection } from './series-stage-section';
import type { ScheduleActions, ScheduleHandlers } from './series-stage-section';
import { StageFormModal, StageScoringModal } from './series-stage-modals';
import type { SeriesEventView, SeriesSummary } from './series-shared';

interface SeriesSchedulePanelProps {
  series: SeriesSummary;
  events: SeriesEventView[];
  /** The series' schedules (planned ones render as placeholders). */
  batches?: SeriesBatchDto[];
  /** Called after any change so the page reloads the series, events and standings. */
  onChanged: () => void;
}

const confirm = (title: string, body: string, label: string, onConfirm: () => void, color = 'red') => {
  modals.openConfirmModal({
    title,
    children: <Text size="sm">{body}</Text>,
    labels: { confirm: label, cancel: 'Back' },
    confirmProps: { color },
    onConfirm,
  });
};

/** Schedule tab: stages as sections with their events, the Add event menu, stage management, batch actions and playoff seeding. */
export function SeriesSchedulePanel({ series, events, batches = [], onChanged }: SeriesSchedulePanelProps): JSX.Element {
  const level = editLevel(series.status);
  const { stages, loading: stagesLoading, error: stagesError, reload: reloadStages } = useSeriesStages(series.id);
  const { entrants } = useSeriesEntrants(series.id);
  const [completedSeedable, setCompletedSeedable] = useState<string[]>([]);
  const [editing, setEditing] = useState<SeriesEventView | null>(null);
  const [seeding, setSeeding] = useState<SeriesEventView | null>(null);
  const [stageForm, setStageForm] = useState<{ open: boolean; stage: SeriesStageDto | null }>({ open: false, stage: null });
  const [scoringStage, setScoringStage] = useState<SeriesStageDto | null>(null);
  const [filling, setFilling] = useState<SeriesEventView | null>(null);
  const [editingMatch, setEditingMatch] = useState<SeriesEventView | null>(null);
  const [bracketOf, setBracketOf] = useState<SeriesEventView | null>(null);
  const [editingBatch, setEditingBatch] = useState<SeriesBatchDto | null>(null);
  const [generating, setGenerating] = useState<SeriesBatchDto | null>(null);

  const sections = useMemo(() => buildSchedule(stages, events, batches), [stages, events, batches]);
  const canFill = schedulableEntrants(entrants).length >= 2;
  const seedableIds = useMemo(() => {
    const ids = new Set(completedSeedable);
    for (const e of events) if (isSeedable(e, stages)) ids.add(e.id);
    return ids;
  }, [completedSeedable, events, stages]);

  const refresh = () => {
    void reloadStages();
    onChanged();
  };

  const act = async <T,>(nid: string, loadingMessage: string, success: string | ((r: T) => string), action: () => Promise<T>): Promise<T | null> => {
    const result = await runWithToast(nid, loadingMessage, success, action);
    if (result !== null) refresh();
    return result;
  };

  const handlerImpl: ScheduleHandlers = {
    editEvent: setEditing,
    removeEvent: (ev) => confirm(
      'Remove Event',
      `Remove "${ev.name ?? `Event #${ev.event_order}`}" from this series? Its points will no longer count. `
        + `If the series created this ${ev.event_type} and it has not started, it is deleted too; otherwise the ${ev.event_type} itself is kept.`,
      'Remove Event',
      () => {
        void act(`series-remove-event-${ev.id}`, 'Removing event...',
          (r: { deleted_target: boolean }) => (r.deleted_target ? `Event and its ${ev.event_type} removed` : 'Event removed'),
          () => scheduleApi.removeEvent(series.id, ev.id));
      },
    ),
    moveEvent: (ev, patch) => {
      void act(`series-move-event-${ev.id}`, 'Moving event...', 'Event moved', () => scheduleApi.updateEvent(series.id, ev.id, patch));
    },
    moveToStage: (ev, stageId) => {
      void act(`series-move-event-${ev.id}`, 'Moving event...', 'Event moved', () => scheduleApi.updateEvent(series.id, ev.id, { stage_id: stageId }));
    },
    regenerateBatch: (ev) => {
      const batchId = ev.batch_id as string;
      confirm(
        'Regenerate unplayed events',
        `Remove the ${unplayedInBatch(events, batchId)} unplayed events of this generated schedule and create the fixtures that are still owed? Played events are kept.`,
        'Regenerate',
        () => {
          void act(`series-regenerate-${batchId}`, 'Regenerating schedule...',
            (r: { removed: number; events: unknown[] }) => `Removed ${r.removed}, created ${r.events.length}`,
            () => scheduleApi.regenerateBatch(series.id, batchId));
        },
        'blue',
      );
    },
    removeBatch: (ev) => {
      const batchId = ev.batch_id as string;
      confirm(
        'Remove unplayed events',
        `Remove the ${unplayedInBatch(events, batchId)} unplayed events of this generated schedule together with their matches? Played events stay in the series.`,
        'Remove unplayed',
        () => {
          void act(`series-remove-batch-${batchId}`, 'Removing unplayed events...',
            (r: { removed: number; kept: number }) => `Removed ${r.removed} unplayed${r.kept > 0 ? `, kept ${r.kept}` : ''}`,
            () => scheduleApi.removeBatch(series.id, batchId));
        },
      );
    },
    seed: setSeeding,
    renameStage: (stage) => setStageForm({ open: true, stage }),
    moveStage: (stage, delta) => {
      const patch = stageMovePatch(stages, stage.id, delta);
      if (patch) void act(`series-move-stage-${stage.id}`, 'Moving stage...', 'Stage moved', () => scheduleApi.updateStage(series.id, stage.id, patch));
    },
    completeStage: (stage) => confirm(
      'Complete stage',
      `Mark "${stage.name}" as complete? Playoff placeholders that read from it become ready to seed.`,
      'Complete stage',
      () => {
        void act(`series-complete-stage-${stage.id}`, 'Completing stage...',
          (r: { seedable_event_ids?: string[] }) => ((r.seedable_event_ids?.length ?? 0) > 0
            ? `${stage.name} complete: ${r.seedable_event_ids?.length} playoff ${r.seedable_event_ids?.length === 1 ? 'event is' : 'events are'} ready to seed`
            : `${stage.name} complete`),
          async () => {
            const r = await scheduleApi.completeStage(series.id, stage.id);
            setCompletedSeedable((prev) => [...new Set([...prev, ...(r.seedable_event_ids ?? [])])]);
            return r;
          });
      },
      'blue',
    ),
    editStageScoring: setScoringStage,
    toggleStageCounts: (stage) => {
      void act(`series-stage-counts-${stage.id}`, 'Updating stage...', 'Stage updated',
        () => scheduleApi.updateStage(series.id, stage.id, { counts_toward_season: !stage.counts_toward_season }));
    },
    fillMatch: setFilling,
    editPlannedMatch: setEditingMatch,
    showBracket: setBracketOf,
    editPlannedBatch: setEditingBatch,
    generateBatch: setGenerating,
    movePlannedBatch: (batch, stageId) => {
      void act(`series-move-batch-${batch.id}`, 'Moving schedule...', 'Schedule moved', () => scheduleApi.updatePlannedBatch(series.id, batch.id, { stage_id: stageId }));
    },
    deletePlannedBatch: (batch) => confirm(
      'Remove planned schedule',
      `Remove this planned ${batch.kind === 'round_robin' ? 'round robin' : 'race calendar'}? Nothing was generated from it yet.`,
      'Remove',
      () => { void act(`series-remove-batch-${batch.id}`, 'Removing...', 'Planned schedule removed', () => scheduleApi.removeBatch(series.id, batch.id)); },
    ),
    deleteStage: (stage) => confirm(
      'Delete stage',
      `Delete "${stage.name}"? Its events are kept and move to Unstaged.`,
      'Delete stage',
      () => { void act(`series-delete-stage-${stage.id}`, 'Deleting stage...', 'Stage deleted', () => scheduleApi.deleteStage(series.id, stage.id)); },
    ),
  };

  // The handlers close over fresh state every render. Rows get stable wrappers that delegate to the latest
  // implementation, so memoized rows are not re-rendered by unrelated panel state (modals, toasts).
  const handlerRef = useRef(handlerImpl);
  useLayoutEffect(() => { handlerRef.current = handlerImpl; });
  const handlers = useMemo(() => Object.fromEntries(
    SCHEDULE_HANDLER_KEYS.map((key) => [key, (...args: unknown[]) => (handlerRef.current[key] as (...a: unknown[]) => void)(...args)]),
  ) as unknown as ScheduleHandlers, []);
  const nextEventId = series.next_event?.id ?? null;
  const gameName = series.series_game?.game_name ?? null;
  const gameColor = series.series_game?.game_color ?? null;
  const actions = useMemo<ScheduleActions>(
    () => ({ ...handlers, level, stages, seedableIds, nextEventId, canFill, gameName, gameColor }),
    [handlers, level, stages, seedableIds, nextEventId, canFill, gameName, gameColor],
  );

  const submitStage = async (values: { name: string; counts_toward_season: boolean }) => {
    const target = stageForm.stage;
    const done = target
      ? await act(`series-rename-stage-${target.id}`, 'Renaming stage...', 'Stage renamed', () => scheduleApi.updateStage(series.id, target.id, { name: values.name }))
      : await act(`series-add-stage-${series.id}`, 'Adding stage...', 'Stage added', () => scheduleApi.createStage(series.id, values));
    if (done) setStageForm({ open: false, stage: null });
  };

  const saveScoring = async (config: SeriesScoringConfig | null) => {
    if (!scoringStage) return;
    const stage = scoringStage;
    const done = await act(`series-stage-scoring-${stage.id}`, 'Saving scoring...', 'Stage scoring saved',
      () => scheduleApi.updateStage(series.id, stage.id, { scoring_config: config }));
    if (done) setScoringStage(null);
  };

  const hasContent = stages.length > 0 || events.length > 0 || batches.some((b) => b.status === 'planned');
  const editable = level !== 'none';

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="xs">
        {editable ? (
          <Text size="xs" c="dimmed">
            {level === 'full' ? 'Order, multiplier and role can be changed until the series starts.' : 'The series is running: order, multiplier and role are locked.'}
          </Text>
        ) : (
          <Group gap={6} wrap="nowrap">
            <IconLock size={14} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
            <Text size="xs" c="dimmed">This series is over, so its schedule can no longer be changed.</Text>
          </Group>
        )}
        <Group gap="xs">
          {editable && (
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setStageForm({ open: true, stage: null })}>
              Add stage
            </Button>
          )}
          <SeriesAddEventMenu series={series} stages={stages} entrants={entrants} events={events} disabled={!editable} onChanged={refresh} />
        </Group>
      </Group>

      {stagesError && <Alert color="red" icon={<IconAlertCircle size={16} />}>{stagesError}</Alert>}

      {stagesLoading && !hasContent ? (
        <Center py="xl"><Loader /></Center>
      ) : !hasContent ? (
        <Card withBorder radius="md">
          <EmptyState
            icon={IconListDetails}
            title="No events yet"
            description="Plan the season with placeholders (generated when registration closes), or create matches and tournaments right away"
          />
        </Card>
      ) : (
        <Stack gap="xl">
          {sections.map((section, i) => (
            <SeriesStageSection key={section.key} section={section} index={i} total={stages.length} actions={actions} />
          ))}
        </Stack>
      )}

      <EditSeriesEventModal
        seriesId={series.id}
        event={editing}
        level={level}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <SeedPlayoffsModal seriesId={series.id} event={seeding} onClose={() => setSeeding(null)} onSeeded={refresh} />
      <FillMatchModal series={series} event={filling} entrants={entrants} onClose={() => setFilling(null)} onFilled={refresh} />
      <ProjectedBracketModal seriesId={series.id} event={bracketOf} onClose={() => setBracketOf(null)} />
      <PlannedMatchModal
        opened={editingMatch !== null}
        series={series}
        stages={stages}
        initial={editingMatch ? plannedMatchInputOf(editingMatch) : null}
        templateOnly
        onClose={() => setEditingMatch(null)}
        onSubmit={async (input) => {
          if (!editingMatch) return false;
          const id = editingMatch.id;
          return (await act(`series-edit-placeholder-${id}`, 'Saving...', 'Match placeholder saved', () => scheduleApi.updatePlannedMatch(series.id, id, input.match))) !== null;
        }}
      />
      <PlannedScheduleModal
        opened={editingBatch !== null}
        kind={editingBatch?.kind ?? 'round_robin'}
        series={series}
        stages={stages}
        initial={editingBatch?.config ?? null}
        onClose={() => setEditingBatch(null)}
        onSubmit={async (config) => {
          if (!editingBatch) return false;
          const id = editingBatch.id;
          return (await act(`series-edit-batch-${id}`, 'Saving...', 'Planned schedule saved', () => scheduleApi.updatePlannedBatch(series.id, id, { config }))) !== null;
        }}
      />
      <GenerateBatchModal series={series} batch={generating} entrants={entrants} onClose={() => setGenerating(null)} onGenerated={refresh} />
      <StageFormModal opened={stageForm.open} onClose={() => setStageForm({ open: false, stage: null })} stage={stageForm.stage} defaultName={`Stage ${stages.length + 1}`} onSubmit={submitStage} />
      <StageScoringModal
        stage={scoringStage}
        seriesScoring={series.scoring_config}
        scoringType={series.scoring_type}
        onClose={() => setScoringStage(null)}
        onSave={saveScoring}
      />
    </Stack>
  );
}
