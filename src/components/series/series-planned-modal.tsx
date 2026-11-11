import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Modal, Stack, Group, Button, TextInput, Select, NumberInput, Switch, Divider, Text, SegmentedControl } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
// Date picker styles load with the components that use them (not in the entry bundle)
import '@mantine/dates/styles.css';
import type { CreateSeriesPlannedEventInput, SeriesEventRole, SeriesSeedingRule, TournamentBracketFormat } from '@/shared/series-types';
import { formatsForScoringType, localDateTimeToIso } from './series-create-event-modals';
import type { CreateEventModalProps } from './series-create-event-modals';
import { PlacementFields } from './series-event-fields';
import { isValidMultiplier } from './series-multiplier-input';
import { buildSeedingRule, isoToPickerValue, validatePlannedForm } from './series-fixtures';
import type { PlannedFormState } from './series-fixtures';
import { runWithToast, scheduleApi } from './series-schedule-api';
import { allowedGameIds, defaultPlacement, placementPayload, withRole } from './series-template';
import { useGameCatalog } from './series-setup-fields';

const PLAYOFF_ROLES: SeriesEventRole[] = ['stage_playoff', 'season_playoff'];

export interface PlannedEventFormProps extends Omit<CreateEventModalProps, 'opened' | 'entrants' | 'onCreated'> {
  onCreated?: () => void;
  /** Collect the placeholder instead of creating it through the API (the create flow); resolve true to close. */
  onSubmitInput?: (input: CreateSeriesPlannedEventInput) => Promise<boolean> | boolean;
  /** Editing a collected placeholder. */
  initial?: CreateSeriesPlannedEventInput | null;
}

function PlannedForm({ series, stages, defaultStageId, onClose, onCreated, onSubmitInput, initial }: PlannedEventFormProps): JSX.Element {
  const { catalog } = useGameCatalog();
  const formats = formatsForScoringType(series.scoring_type);
  const [form, setForm] = useState<PlannedFormState>(() => {
    const rule = initial?.seeding_rule;
    return {
      name: rule?.template.name ?? 'Playoffs',
      source: rule?.source ?? (stages.length > 0 ? 'stage' : 'season'),
      stage_id: rule?.stage_id ?? defaultStageId ?? stages[stages.length - 1]?.id ?? null,
      top: rule?.top ?? 4,
      per_division: rule?.per_division ?? false,
      format: rule?.format ?? formats[0],
      game_id: rule?.template.game_id ?? series.game_id ?? null,
      rounds_per_match: rule?.template.rounds_per_match ?? series.match_defaults?.rounds_per_match ?? null,
      ruleset: rule?.template.ruleset ?? series.match_defaults?.rules ?? null,
      start_time: isoToPickerValue(rule?.template.start_time),
    };
  });
  const [autoSeed, setAutoSeed] = useState(initial?.seeding_rule.auto_seed !== false);
  const [placement, setPlacement] = useState(() => {
    if (initial) {
      return {
        stage_id: initial.stage_id ?? null, role: initial.role, week: initial.week ?? null,
        points_multiplier: initial.points_multiplier ?? 1, counts_for_standings: initial.counts_for_standings ?? false,
      };
    }
    const role: SeriesEventRole = stages.length > 0 ? 'stage_playoff' : 'season_playoff';
    return withRole(defaultPlacement(null, role), role);
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PlannedFormState>(key: K, value: PlannedFormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const gameIds = useMemo(() => allowedGameIds(series, catalog), [series, catalog]);

  // The rule's source follows the role: season playoffs read the whole season table.
  const onPlacement = (p: typeof placement) => {
    setPlacement(p);
    if (p.role === 'season_playoff' && form.source !== 'season') set('source', 'season');
    if (p.role === 'stage_playoff' && form.source !== 'stage' && stages.length > 0) set('source', 'stage');
  };

  let problem = validatePlannedForm(form);
  if (!problem && !isValidMultiplier(placement.points_multiplier)) problem = 'Points multiplier must be between 0.1 and 10';

  const submit = async () => {
    if (problem) return;
    const rule: SeriesSeedingRule = { ...buildSeedingRule({ ...form, start_time: localDateTimeToIso(form.start_time) }), auto_seed: autoSeed };
    const input: CreateSeriesPlannedEventInput = { ...placementPayload(placement), role: placement.role, seeding_rule: rule };
    if (onSubmitInput) {
      if (await onSubmitInput(input)) onClose();
      return;
    }
    setSaving(true);
    const created = await runWithToast(
      `series-create-planned-${series.id}`, 'Adding playoffs...', 'Playoff placeholder added',
      () => scheduleApi.createPlanned(series.id, input),
    );
    setSaving(false);
    if (created) { onClose(); onCreated?.(); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          A playoff placeholder sits in the schedule until its source stage is complete. Then you seed it: the qualifiers are
          taken from the standings and the bracket is created.
        </Text>
        <TextInput label="Name" required value={form.name} onChange={(e) => set('name', e.currentTarget.value)} />
        <Group grow align="flex-start">
          <div>
            <Text size="sm" fw={500} mb={4}>Qualifiers come from</Text>
            <SegmentedControl
              fullWidth
              value={form.source}
              onChange={(v) => {
                const source = v as PlannedFormState['source'];
                set('source', source);
                // The role follows the source (see onPlacement): playoffs that read the whole season decide the champion.
                const role: SeriesEventRole = source === 'season' ? 'season_playoff' : 'stage_playoff';
                setPlacement((p) => (p.role === role ? p : withRole(p, role)));
              }}
              data={[{ value: 'stage', label: 'A stage', disabled: stages.length === 0 }, { value: 'season', label: 'The season' }]}
            />
          </div>
          {form.source === 'stage' && (
            <Select
              label="Source stage"
              data={stages.map((s) => ({ value: s.id, label: s.name }))}
              value={form.stage_id}
              onChange={(v) => set('stage_id', v)}
              allowDeselect={false}
            />
          )}
        </Group>
        <Group grow align="flex-start">
          <NumberInput
            label={form.per_division ? 'Top N per division' : 'Top N qualify'}
            value={form.top}
            onChange={(v) => set('top', typeof v === 'number' ? v : 0)}
            min={2}
            allowDecimal={false}
          />
          <Select
            label="Format"
            data={formats.map((f) => ({ value: f, label: f.replace(/-/g, ' ') }))}
            value={form.format}
            onChange={(v) => { if (v) set('format', v as TournamentBracketFormat); }}
            allowDeselect={false}
          />
        </Group>
        <Switch
          label="Take the top N of each division"
          description="Interleaved by rank: division A #1, division B #1, division A #2, ..."
          checked={form.per_division}
          onChange={(e) => set('per_division', e.currentTarget.checked)}
        />
        <Group grow align="flex-start">
          <Select
            label="Game"
            data={gameIds.map((id) => ({ value: id, label: catalog.games.find((g) => g.id === id)?.name ?? id }))}
            value={form.game_id}
            onChange={(v) => set('game_id', v)}
            searchable
          />
          <NumberInput
            label="Rounds per match"
            placeholder="Series default"
            value={form.rounds_per_match ?? ''}
            onChange={(v) => set('rounds_per_match', typeof v === 'number' ? v : null)}
            min={1}
            allowDecimal={false}
          />
          <Select
            label="Rules"
            placeholder="Series default"
            data={[{ value: 'casual', label: 'Casual' }, { value: 'competitive', label: 'Competitive' }]}
            value={form.ruleset}
            onChange={(v) => set('ruleset', (v as 'casual' | 'competitive' | null) ?? null)}
            clearable
          />
        </Group>
        <Switch
          label="Seed automatically"
          description="Create the bracket as soon as the qualifiers are decided (a tie at the cut-off still waits for you)"
          checked={autoSeed}
          onChange={(e) => setAutoSeed(e.currentTarget.checked)}
        />
        <DateTimePicker
          label="First round starts"
          placeholder="Pick date and time (optional)"
          value={form.start_time}
          onChange={(v) => set('start_time', v)}
          timePickerProps={{ format: '12h' }}
        />
        <Divider label="Placement" labelPosition="left" />
        <PlacementFields value={placement} onChange={onPlacement} stages={stages} roles={PLAYOFF_ROLES} />
        {problem && <Text size="xs" c="dimmed">{problem}</Text>}
        <Divider />
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={problem !== null}>{initial ? 'Save playoffs' : 'Add playoffs'}</Button>
        </Group>
      </Stack>
    </form>
  );
}

export function PlannedEventModal(props: PlannedEventFormProps & { opened: boolean }): JSX.Element {
  const { opened, ...rest } = props;
  return (
    <Modal opened={opened} onClose={props.onClose} title="Playoff placeholder" size="lg">
      {opened && <PlannedForm {...rest} />}
    </Modal>
  );
}
