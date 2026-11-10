import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Modal, Stack, Group, Button, TextInput, SegmentedControl, Divider, Text, Alert } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
// Date picker styles load with the components that use them (not in the entry bundle)
import '@mantine/dates/styles.css';
import classes from '@/components/gradient-segmented-control.module.css';
import type { SeriesEntrantDto, SeriesStageDto, TournamentBracketFormat } from '@/shared/series-types';
import { EntrantSelect } from './series-entrant-select';
import { MatchTemplateFields, PlacementFields } from './series-event-fields';
import { isValidMultiplier } from './series-multiplier-input';
import { matchEntrantBounds, matchTemplatePayload, schedulableEntrants } from './series-fixtures';
import { SeedOrderList } from './series-seed-order-list';
import { scheduleApi, runWithToast } from './series-schedule-api';
import { useGameCatalog } from './series-setup-fields';
import { defaultPlacement, defaultTemplateState, placementPayload } from './series-template';
import type { SeriesSummary } from './series-shared';

export interface CreateEventModalProps {
  opened: boolean;
  onClose: () => void;
  series: SeriesSummary;
  stages: SeriesStageDto[];
  entrants: SeriesEntrantDto[];
  /** Stage preselected in the placement fields. */
  defaultStageId?: string | null;
  onCreated: () => void;
}

/** 'YYYY-MM-DD HH:mm:ss' (local, from the date-time picker) -> ISO instant, or null. */
export function localDateTimeToIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function ModalFooter({ onClose, saving, disabled, label }: { onClose: () => void; saving: boolean; disabled: boolean; label: string }): JSX.Element {
  return (
    <>
      <Divider />
      <Group justify="flex-end">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving} disabled={disabled}>{label}</Button>
      </Group>
    </>
  );
}

function CreateMatchForm({ onClose, series, stages, entrants, defaultStageId, onCreated }: Omit<CreateEventModalProps, 'opened'>): JSX.Element {
  const { catalog } = useGameCatalog();
  const active = useMemo(() => schedulableEntrants(entrants), [entrants]);
  const bounds = matchEntrantBounds(series.scoring_type);
  const allowAll = series.scoring_type !== 'Normal';
  const [all, setAll] = useState(allowAll);
  const [ids, setIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState(() => defaultTemplateState(series));
  const [start, setStart] = useState<string | null>(null);
  const [placement, setPlacement] = useState(() => defaultPlacement(defaultStageId ?? null));
  const [saving, setSaving] = useState(false);

  const count = all && allowAll ? active.length : ids.length;
  const startIso = localDateTimeToIso(start);
  let problem: string | null = null;
  if (count < bounds.min) problem = bounds.min === 2 ? 'Pick at least two entrants' : 'Pick at least one entrant';
  else if (bounds.max !== null && count > bounds.max) problem = `A match takes at most ${bounds.max} entrants`;
  else if (!startIso) problem = 'Pick a start date and time';
  else if (!isValidMultiplier(placement.points_multiplier)) problem = 'Points multiplier must be between 0.1 and 10';

  const submit = async () => {
    if (problem || !startIso) return;
    setSaving(true);
    const created = await runWithToast(
      `series-create-match-${series.id}`, 'Creating match...', 'Match created',
      () => scheduleApi.createMatch(series.id, {
        ...placementPayload(placement),
        entrant_ids: all && allowAll ? null : ids,
        match: { ...matchTemplatePayload(template), ...(name.trim() ? { name: name.trim() } : {}), start_date: startIso },
      }),
    );
    setSaving(false);
    if (created) { onClose(); onCreated(); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Stack gap="md">
        <EntrantSelect
          entrants={active}
          value={ids}
          onChange={setIds}
          description={series.scoring_type === 'Normal' ? 'Team vs team: pick 2 to 16 entrants' : undefined}
          all={allowAll ? { value: all, onChange: setAll } : undefined}
        />
        <TextInput
          label="Name"
          placeholder="Default: the entrants' names"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <DateTimePicker
          label="Start date & time"
          placeholder="Pick date and time"
          required
          value={start}
          onChange={setStart}
          timePickerProps={{ format: '12h' }}
        />
        <MatchTemplateFields series={series} catalog={catalog} value={template} onChange={setTemplate} />
        <Divider label="Placement" labelPosition="left" />
        <PlacementFields value={placement} onChange={setPlacement} stages={stages} />
        {problem && <Text size="xs" c="dimmed">{problem}</Text>}
        <ModalFooter onClose={onClose} saving={saving} disabled={problem !== null} label="Create match" />
      </Stack>
    </form>
  );
}

export function CreateMatchModal(props: CreateEventModalProps): JSX.Element {
  const { opened, ...rest } = props;
  return (
    <Modal opened={opened} onClose={props.onClose} title="Create match" size="lg">
      <CreateMatchForm {...rest} />
    </Modal>
  );
}

const FORMAT_LABEL: Record<TournamentBracketFormat, string> = {
  'single-elimination': 'Single elimination',
  'double-elimination': 'Double elimination',
  'cumulative-points': 'Cumulative points',
};

/** Formats a series of this scoring type can run: brackets for team-vs-team, a points leaderboard for FFA / racing. */
export function formatsForScoringType(scoringType: string | null | undefined): TournamentBracketFormat[] {
  return scoringType === 'Normal' ? ['single-elimination', 'double-elimination'] : ['cumulative-points'];
}

function CreateTournamentForm({ onClose, series, stages, entrants, defaultStageId, onCreated }: Omit<CreateEventModalProps, 'opened'>): JSX.Element {
  const { catalog } = useGameCatalog();
  const active = useMemo(() => schedulableEntrants(entrants), [entrants]);
  const formats = formatsForScoringType(series.scoring_type);
  const [ids, setIds] = useState<string[]>(() => active.map((e) => e.id));
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentBracketFormat>(formats[0]);
  const [template, setTemplate] = useState(() => defaultTemplateState(series));
  const [start, setStart] = useState<string | null>(null);
  const [placement, setPlacement] = useState(() => defaultPlacement(defaultStageId ?? null));
  const [saving, setSaving] = useState(false);

  const byId = new Map(active.map((e) => [e.id, e]));
  let problem: string | null = null;
  if (!name.trim()) problem = 'Give the tournament a name';
  else if (ids.length < 2) problem = 'Pick at least two entrants';
  else if (!isValidMultiplier(placement.points_multiplier)) problem = 'Points multiplier must be between 0.1 and 10';

  const submit = async () => {
    if (problem) return;
    setSaving(true);
    const created = await runWithToast(
      `series-create-tournament-${series.id}`, 'Creating tournament...', 'Tournament created',
      () => scheduleApi.createTournament(series.id, {
        ...placementPayload(placement),
        entrant_ids: ids,
        seed_order: ids,
        format,
        tournament: {
          name: name.trim(),
          ...(template.game_id ? { game_id: template.game_id } : {}),
          ...(template.rounds !== null ? { rounds_per_match: template.rounds } : {}),
          ...(template.rules ? { ruleset: template.rules } : {}),
          ...(localDateTimeToIso(start) ? { start_time: localDateTimeToIso(start) } : {}),
        },
      }),
    );
    setSaving(false);
    if (created) { onClose(); onCreated(); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Stack gap="md">
        <TextInput label="Name" required value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <div>
          <Text size="sm" fw={500} mb={4}>Format</Text>
          <SegmentedControl
            fullWidth
            radius="xl"
            classNames={classes}
            value={format}
            onChange={(v) => setFormat(v as TournamentBracketFormat)}
            data={formats.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))}
          />
        </div>
        <EntrantSelect entrants={active} value={ids} onChange={setIds} />
        {ids.length > 0 && (
          <div>
            <Text size="sm" fw={500} mb={4}>Seed order</Text>
            <Text size="xs" c="dimmed" mb="xs">#1 is the top seed. Defaults to the entrant seeds, then name.</Text>
            <SeedOrderList
              items={ids.map((id) => ({ id, name: byId.get(id)?.name ?? id }))}
              onChange={setIds}
            />
          </div>
        )}
        <DateTimePicker
          label="Start date & time"
          placeholder="Pick date and time (optional)"
          value={start}
          onChange={setStart}
          timePickerProps={{ format: '12h' }}
        />
        <MatchTemplateFields series={series} catalog={catalog} value={template} onChange={setTemplate} hideMaps />
        <Divider label="Placement" labelPosition="left" />
        <PlacementFields value={placement} onChange={setPlacement} stages={stages} />
        {series.scoring_type === 'Normal' && (
          <Alert color="gray" variant="light">Brackets are generated right away from the seed order above.</Alert>
        )}
        {problem && <Text size="xs" c="dimmed">{problem}</Text>}
        <ModalFooter onClose={onClose} saving={saving} disabled={problem !== null} label="Create tournament" />
      </Stack>
    </form>
  );
}

export function CreateTournamentModal(props: CreateEventModalProps): JSX.Element {
  const { opened, ...rest } = props;
  return (
    <Modal opened={opened} onClose={props.onClose} title="Create tournament" size="lg">
      <CreateTournamentForm {...rest} />
    </Modal>
  );
}
