import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Stack, Group, Text, Badge, Card, Button, ActionIcon, Menu, Alert, SimpleGrid, ThemeIcon, Tooltip } from '@mantine/core';
import {
  IconPlus, IconChevronDown, IconRepeat, IconFlag, IconSwords, IconTrophy, IconDots, IconEdit, IconTrash, IconArrowUp, IconArrowDown,
  IconArrowsExchange, IconCalendarOff, IconCalendarStats, IconAlertTriangle, IconLayoutList, IconSparkles,
} from '@tabler/icons-react';
import { EmptyState } from '@/components/EmptyState';
import type { RaceCalendarConfig, RoundRobinConfig, SeriesBatchKind } from '@/shared/series-types';
import { SeriesEventRow } from './series-event-row';
import {
  addItem, addStage, draftEventView, draftSections, draftStagesAsDtos, itemStage, layoutProblems, layoutTemplate, layoutTemplatesFor,
  moveItem, moveItemToStage, moveStage, removeItem, removeStage, replaceItem, summarizeLayout, updateStage,
} from './series-layout';
import type { DraftItem, DraftLayout, DraftSection, DraftStage, NewDraftItem } from './series-layout';
import { PlannedBatchRow } from './series-planned-batch-row';
import { PlannedMatchModal, PlannedScheduleModal } from './series-placeholder-modals';
import { PlannedEventModal } from './series-planned-modal';
import { StageFormModal } from './series-stage-modals';
import { defaultTemplateState } from './series-template';
import type { GameCatalog } from './series-setup';
import type { SeriesSummary } from './series-shared';

interface SeriesLayoutEditorProps {
  layout: DraftLayout;
  onChange: (layout: DraftLayout) => void;
  /** The series being created (from the form), for game / scoring defaults. */
  series: SeriesSummary;
  catalog: GameCatalog;
}

type ModalState =
  | { type: 'batch'; kind: SeriesBatchKind; key?: string; stageKey: string | null }
  | { type: 'match'; key?: string; stageKey: string | null }
  | { type: 'playoff'; key?: string; stageKey: string | null }
  | null;

/** The create flow's Schedule step: lay out the whole season (stages and placeholders) before anyone signs up. */
export function SeriesLayoutEditor({ layout, onChange, series, catalog }: SeriesLayoutEditorProps): JSX.Element {
  const [modal, setModal] = useState<ModalState>(null);
  const [stageForm, setStageForm] = useState<{ open: boolean; stage: DraftStage | null }>({ open: false, stage: null });
  const sections = useMemo(() => draftSections(layout), [layout]);
  const stageDtos = useMemo(() => draftStagesAsDtos(layout), [layout]);
  const problems = layoutProblems(layout, series.scoring_type ?? null);
  const normal = series.scoring_type === 'Normal';
  const editing = modal?.key ? layout.items.find((i) => i.key === modal.key) ?? null : null;
  const gameName = catalog.games.find((g) => g.id === series.game_id)?.name ?? null;
  const gameColor = catalog.games.find((g) => g.id === series.game_id)?.color ?? null;

  const save = (item: NewDraftItem): boolean => {
    onChange(modal?.key ? replaceItem(layout, modal.key, item) : addItem(layout, item));
    return true;
  };

  const lastStageKey = layout.stages.length > 0 ? layout.stages[0].key : null;
  const addMenu = (stageKey: string | null, compact = false) => (
    <Menu withinPortal position="bottom-end">
      <Menu.Target>
        <Button size="xs" variant={compact ? 'subtle' : 'filled'} leftSection={<IconPlus size={14} />} rightSection={<IconChevronDown size={14} />}>
          {compact ? 'Add' : 'Add to schedule'}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Generated when registration closes</Menu.Label>
        {normal
          ? <Menu.Item leftSection={<IconRepeat size={14} />} onClick={() => setModal({ type: 'batch', kind: 'round_robin', stageKey })}>Round robin</Menu.Item>
          : <Menu.Item leftSection={<IconFlag size={14} />} onClick={() => setModal({ type: 'batch', kind: 'race_calendar', stageKey })}>Race calendar</Menu.Item>}
        <Menu.Label>Entrants picked later</Menu.Label>
        <Menu.Item leftSection={<IconSwords size={14} />} onClick={() => setModal({ type: 'match', stageKey })}>Single match</Menu.Item>
        <Menu.Label>Seeded from the standings</Menu.Label>
        <Menu.Item leftSection={<IconTrophy size={14} />} onClick={() => setModal({ type: 'playoff', stageKey })}>Playoffs</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const templates = layoutTemplatesFor(series.scoring_type ?? null);
  const applyTemplate = (id: Parameters<typeof layoutTemplate>[0]) =>
    onChange(layoutTemplate(id, { startDate: series.start_date?.slice(0, 10) ?? null, template: defaultTemplateState(series) }));

  return (
    <Stack gap="md">
      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <div style={{ minWidth: 0 }}>
            <Text fw={600}>Season layout</Text>
            <Text size="xs" c="dimmed">
              Plan the whole season now. Round robins and race calendars are generated, and single matches get their entrants, when you close registration.
            </Text>
          </div>
          <Group gap="xs">
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setStageForm({ open: true, stage: null })}>Add stage</Button>
            {addMenu(lastStageKey)}
          </Group>
        </Group>
      </Card>

      {problems.length > 0 && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />} title="Fix before creating the series">
          <Stack gap={2}>{problems.map((p) => <Text key={p} size="sm">{p}</Text>)}</Stack>
        </Alert>
      )}

      {layout.items.length === 0 && layout.stages.length === 0 ? (
        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            <EmptyState icon={IconLayoutList} title="Nothing planned yet" description="Start from a template or build the schedule yourself. You can skip this and plan it on the series page later." />
            <SimpleGrid cols={{ base: 1, sm: templates.length }} spacing="sm">
              {templates.map((t) => (
                <Card key={t.id} withBorder radius="md" padding="sm">
                  <Stack gap={6}>
                    <Group gap={6}>
                      <ThemeIcon size="sm" variant="light" color="violet"><IconSparkles size={12} /></ThemeIcon>
                      <Text size="sm" fw={600}>{t.label}</Text>
                    </Group>
                    <Text size="xs" c="dimmed">{t.description}</Text>
                    <Button size="compact-sm" variant="light" onClick={() => applyTemplate(t.id)}>Use template</Button>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          </Stack>
        </Card>
      ) : (
        <Stack gap="xl">
          {sections.map((section, i) => (
            <DraftSectionView
              key={section.stage?.key ?? 'unstaged'}
              section={section}
              index={i}
              layout={layout}
              catalog={catalog}
              series={series}
              gameName={gameName}
              gameColor={gameColor}
              addMenu={addMenu}
              onChange={onChange}
              onEdit={(item) => setModal({ type: item.type, key: item.key, stageKey: itemStage(item), ...(item.type === 'batch' ? { kind: item.kind } : {}) } as ModalState)}
              onRenameStage={(stage) => setStageForm({ open: true, stage })}
            />
          ))}
          <Text size="xs" c="dimmed" ta="center">{summarizeLayout(layout)}</Text>
        </Stack>
      )}

      <StageFormModal
        opened={stageForm.open}
        onClose={() => setStageForm({ open: false, stage: null })}
        stage={stageForm.stage ? stageDtos.find((s) => s.id === stageForm.stage?.key) ?? null : null}
        defaultName={layout.stages.length === 0 ? 'Regular season' : layout.stages.length === 1 ? 'Playoffs' : `Stage ${layout.stages.length + 1}`}
        onSubmit={(values) => {
          const target = stageForm.stage;
          onChange(target ? updateStage(layout, target.key, { name: values.name }) : addStage(layout, values.name, values.counts_toward_season));
          setStageForm({ open: false, stage: null });
        }}
      />
      <PlannedScheduleModal
        opened={modal?.type === 'batch'}
        kind={modal?.type === 'batch' ? modal.kind : 'round_robin'}
        series={series}
        stages={stageDtos}
        initial={editing?.type === 'batch' ? editing.config : null}
        defaultStageId={modal?.stageKey ?? null}
        onClose={() => setModal(null)}
        onSubmit={(config: RoundRobinConfig | RaceCalendarConfig) => save({ type: 'batch', kind: modal?.type === 'batch' ? modal.kind : 'round_robin', config })}
      />
      <PlannedMatchModal
        opened={modal?.type === 'match'}
        series={series}
        stages={stageDtos}
        initial={editing?.type === 'match' ? editing.input : null}
        defaultStageId={modal?.stageKey ?? null}
        onClose={() => setModal(null)}
        onSubmit={(input) => save({ type: 'match', input })}
      />
      <PlannedEventModal
        opened={modal?.type === 'playoff'}
        series={series}
        stages={stageDtos}
        initial={editing?.type === 'playoff' ? editing.input : null}
        defaultStageId={modal?.stageKey ?? null}
        onClose={() => setModal(null)}
        onSubmitInput={(input) => save({ type: 'playoff', input })}
      />
    </Stack>
  );
}

interface DraftSectionViewProps {
  section: DraftSection;
  index: number;
  layout: DraftLayout;
  catalog: GameCatalog;
  series: SeriesSummary;
  gameName: string | null;
  gameColor: string | null;
  addMenu: (stageKey: string | null, compact?: boolean) => JSX.Element;
  onChange: (layout: DraftLayout) => void;
  onEdit: (item: DraftItem) => void;
  onRenameStage: (stage: DraftStage) => void;
}

function DraftSectionView({ section, index, layout, catalog, series, gameName, gameColor, addMenu, onChange, onEdit, onRenameStage }: DraftSectionViewProps): JSX.Element {
  const { stage, items } = section;
  const stageKey = stage?.key ?? null;
  const otherStages = layout.stages.filter((s) => s.key !== stageKey);
  return (
    <Stack gap="xs" data-testid={`draft-section-${stageKey ?? 'unstaged'}`}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="wrap" style={{ minWidth: 0 }}>
          <Text fw={600} size="lg" truncate>{stage ? stage.name : 'Unstaged'}</Text>
          {stage && !stage.counts_toward_season && (
            <Tooltip label="This stage's results do not feed the season table" withArrow>
              <Badge size="sm" variant="outline" color="gray" leftSection={<IconCalendarOff size={10} />}>Not in season</Badge>
            </Tooltip>
          )}
          <Text size="xs" c="dimmed">{items.length} {items.length === 1 ? 'item' : 'items'}</Text>
        </Group>
        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
          {addMenu(stageKey, true)}
          {stage && (
            <Menu withinPortal position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${stage.name}`}><IconDots size={16} /></ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onRenameStage(stage)}>Rename...</Menu.Item>
                <Menu.Item leftSection={<IconArrowUp size={14} />} disabled={index === 0} onClick={() => onChange(moveStage(layout, stage.key, -1))}>Move up</Menu.Item>
                <Menu.Item leftSection={<IconArrowDown size={14} />} disabled={index === layout.stages.length - 1} onClick={() => onChange(moveStage(layout, stage.key, 1))}>Move down</Menu.Item>
                <Menu.Item leftSection={<IconCalendarStats size={14} />} onClick={() => onChange(updateStage(layout, stage.key, { counts_toward_season: !stage.counts_toward_season }))}>
                  {stage.counts_toward_season ? 'Exclude from season table' : 'Count toward season table'}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => onChange(removeStage(layout, stage.key))}>Delete stage</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>

      {items.length === 0 ? (
        <Card withBorder radius="md" style={{ borderStyle: 'dashed' }}>
          <Text size="sm" c="dimmed" ta="center">Nothing in this stage yet. Use Add to plan a round robin, a match or playoffs here.</Text>
        </Card>
      ) : items.map((item, i) => {
        const actions = (
          <>
            <ActionIcon variant="subtle" size="sm" aria-label="Move up" disabled={i === 0} onClick={() => onChange(moveItem(layout, item.key, -1))}><IconArrowUp size={14} /></ActionIcon>
            <ActionIcon variant="subtle" size="sm" aria-label="Move down" disabled={i === items.length - 1} onClick={() => onChange(moveItem(layout, item.key, 1))}><IconArrowDown size={14} /></ActionIcon>
            <Menu withinPortal position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Placeholder actions"><IconDots size={14} /></ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => onEdit(item)}>Edit...</Menu.Item>
                {(otherStages.length > 0 || stageKey) && (
                  <>
                    <Menu.Divider />
                    <Menu.Label>Move to stage</Menu.Label>
                    {otherStages.map((s) => (
                      <Menu.Item key={s.key} leftSection={<IconArrowsExchange size={14} />} onClick={() => onChange(moveItemToStage(layout, item.key, s.key))}>{s.name}</Menu.Item>
                    ))}
                    {stageKey && <Menu.Item leftSection={<IconArrowsExchange size={14} />} onClick={() => onChange(moveItemToStage(layout, item.key, null))}>Unstaged</Menu.Item>}
                  </>
                )}
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => onChange(removeItem(layout, item.key))}>Remove</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </>
        );
        if (item.type === 'batch') {
          return <PlannedBatchRow key={item.key} kind={item.kind} config={item.config} gameName={gameName} gameColor={gameColor} actions={actions} />;
        }
        const view = draftEventView(item, layout.items.indexOf(item) + 1, catalog, series.game_id ?? null);
        return <SeriesEventRow key={item.key} event={view} actions={actions} />;
      })}
    </Stack>
  );
}
