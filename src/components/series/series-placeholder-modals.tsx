import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import {
  Modal, Stack, Group, Button, Divider, Text, TextInput, Alert, Loader, Center, Select, Badge, Card, SimpleGrid, ScrollArea,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
// Date picker styles load with the components that use them (not in the entry bundle)
import '@mantine/dates/styles.css';
import { IconAlertTriangle, IconTrophy } from '@tabler/icons-react';
import { SectionLabel } from '@/components/SectionLabel';
import type {
  CreateSeriesPlannedMatchInput, GeneratorPreview, ProjectedBracketResponse, RaceCalendarConfig, RoundRobinConfig, RoundRobinDivisionMode,
  SeriesBatchKind, SeriesEntrantDto, SeriesStageDto,
} from '@/shared/series-types';
import { localDateTimeToIso } from './series-create-event-modals';
import { EntrantSelect } from './series-entrant-select';
import { MatchTemplateFields, PlacementFields } from './series-event-fields';
import {
  buildRaceCalendarConfig, buildRoundRobinConfig, defaultRaceCalendarForm, defaultRoundRobinForm, entrantNameMap, isoToPickerValue,
  matchEntrantBounds, matchTemplatePayload, raceCalendarFormFromConfig, roundRobinFormFromConfig, schedulableEntrants,
  validateRaceCalendarForm, validateRoundRobinForm,
} from './series-fixtures';
import type { RaceCalendarFormState, RoundRobinFormState } from './series-fixtures';
import { RaceCalendarFields, RoundRobinFields } from './series-generator-fields';
import type { SetForm } from './series-generator-fields';
import { isValidMultiplier } from './series-multiplier-input';
import { errorMessage, runWithToast, scheduleApi } from './series-schedule-api';
import { useGameCatalog } from './series-setup-fields';
import { defaultPlacement, defaultTemplateState, placementPayload } from './series-template';
import type { PlacementState } from './series-template';
import { formatShortDateTime } from './series-shared';
import type { SeriesEventView, SeriesSummary } from './series-shared';

type GeneratorConfig = RoundRobinConfig | RaceCalendarConfig;

function Footer({ onClose, busy, disabled, label, problem }: { onClose: () => void; busy?: boolean; disabled: boolean; label: string; problem?: string | null }): JSX.Element {
  return (
    <>
      {problem && <Text size="xs" c="dimmed">{problem}</Text>}
      <Divider />
      <Group justify="flex-end">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" loading={busy} disabled={disabled}>{label}</Button>
      </Group>
    </>
  );
}

// ─── planned round robin / race calendar ─────────────────────────────────────

interface PlannedScheduleModalProps {
  opened: boolean;
  kind: SeriesBatchKind;
  series: SeriesSummary;
  stages: SeriesStageDto[];
  /** Editing an existing placeholder. */
  initial?: GeneratorConfig | null;
  defaultStageId?: string | null;
  onClose: () => void;
  /** Resolve true to close the modal. */
  onSubmit: (config: GeneratorConfig) => Promise<boolean> | boolean;
}

function PlannedScheduleForm({ kind, series, stages, initial, defaultStageId, onClose, onSubmit }: Omit<PlannedScheduleModalProps, 'opened'>): JSX.Element {
  const { catalog } = useGameCatalog();
  const [busy, setBusy] = useState(false);
  const [rr, setRr] = useState<RoundRobinFormState>(() => (kind === 'round_robin' && initial
    ? roundRobinFormFromConfig(initial as RoundRobinConfig)
    : defaultRoundRobinForm({ stage_id: defaultStageId ?? null, template: defaultTemplateState(series), start_date: series.start_date?.slice(0, 10) ?? null, match_days: [2] })));
  const [race, setRace] = useState<RaceCalendarFormState>(() => (kind === 'race_calendar' && initial
    ? raceCalendarFormFromConfig(initial as RaceCalendarConfig)
    : defaultRaceCalendarForm({ stage_id: defaultStageId ?? null, template: defaultTemplateState(series), start_date: series.start_date?.slice(0, 10) ?? null })));
  const setRrField: SetForm<RoundRobinFormState> = (key, value) => setRr((f) => ({ ...f, [key]: value }));
  const setRaceField: SetForm<RaceCalendarFormState> = (key, value) => setRace((f) => ({ ...f, [key]: value }));

  const problem = kind === 'round_robin' ? validateRoundRobinForm(rr, 0, true) : validateRaceCalendarForm(race, 0, true);
  const submit = async () => {
    if (problem) return;
    const config: GeneratorConfig = kind === 'round_robin'
      ? { ...buildRoundRobinConfig({ ...rr, all_entrants: true }), divisions: rr.divisions }
      : buildRaceCalendarConfig({ ...race, all_entrants: true });
    setBusy(true);
    const ok = await onSubmit({ ...config, entrant_ids: null });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Stack gap="md">
        {kind === 'round_robin'
          ? <RoundRobinFields form={rr} set={setRrField} series={series} catalog={catalog} stages={stages} active={[]} planned />
          : <RaceCalendarFields form={race} set={setRaceField} series={series} catalog={catalog} stages={stages} active={[]} planned />}
        <Footer onClose={onClose} busy={busy} disabled={problem !== null} problem={problem} label={initial ? 'Save' : 'Add to schedule'} />
      </Stack>
    </form>
  );
}

/** A round robin / race calendar placeholder: the generator settings now, the fixtures once the entrants are known. */
export function PlannedScheduleModal(props: PlannedScheduleModalProps): JSX.Element {
  const { opened, ...rest } = props;
  const title = `${props.kind === 'round_robin' ? 'Round robin' : 'Race calendar'} (generated at registration close)`;
  return (
    <Modal opened={opened} onClose={props.onClose} title={title} size="xl">
      {opened && <PlannedScheduleForm {...rest} />}
    </Modal>
  );
}

// ─── single match placeholder ────────────────────────────────────────────────

interface PlannedMatchModalProps {
  opened: boolean;
  series: SeriesSummary;
  stages: SeriesStageDto[];
  initial?: CreateSeriesPlannedMatchInput | null;
  defaultStageId?: string | null;
  /** Editing a saved placeholder: only the match itself can change (placement is edited like any event). */
  templateOnly?: boolean;
  onClose: () => void;
  onSubmit: (input: CreateSeriesPlannedMatchInput) => Promise<boolean> | boolean;
}

function PlannedMatchForm({ series, stages, initial, defaultStageId, templateOnly, onClose, onSubmit }: Omit<PlannedMatchModalProps, 'opened'>): JSX.Element {
  const { catalog } = useGameCatalog();
  const [name, setName] = useState(initial?.match.name ?? '');
  const [start, setStart] = useState<string | null>(isoToPickerValue(initial?.match.start_date));
  const [template, setTemplate] = useState(() => (initial
    ? { game_id: initial.match.game_id ?? series.game_id ?? null, maps: [...(initial.match.maps ?? [])], rounds: null, rules: initial.match.rules ?? null }
    : defaultTemplateState(series)));
  const [placement, setPlacement] = useState<PlacementState>(() => (initial
    ? {
      stage_id: initial.stage_id ?? null, role: initial.role ?? 'regular', week: initial.week ?? null,
      points_multiplier: initial.points_multiplier ?? 1, counts_for_standings: initial.counts_for_standings ?? (initial.role ?? 'regular') === 'regular',
    }
    : defaultPlacement(defaultStageId ?? null)));
  const [busy, setBusy] = useState(false);

  const startIso = localDateTimeToIso(start);
  let problem: string | null = null;
  if (!name.trim()) problem = 'Give the match a name (the entrants are not known yet)';
  else if (!startIso) problem = 'Pick a start date and time';
  else if (!isValidMultiplier(placement.points_multiplier)) problem = 'Points multiplier must be between 0.1 and 10';

  const submit = async () => {
    if (problem || !startIso) return;
    setBusy(true);
    const ok = await onSubmit({ ...placementPayload(placement), match: { ...matchTemplatePayload(template), name: name.trim(), start_date: startIso } });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          A match whose entrants are picked later: an opener, a showcase, a rivalry game. You assign the teams when registration closes.
        </Text>
        <TextInput label="Name" placeholder="e.g. Season Opener" required value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <DateTimePicker label="Start date & time" placeholder="Pick date and time" required value={start} onChange={setStart} timePickerProps={{ format: '12h' }} />
        <MatchTemplateFields series={series} catalog={catalog} value={template} onChange={setTemplate} />
        {!templateOnly && (
          <>
            <Divider label="Placement" labelPosition="left" />
            <PlacementFields value={placement} onChange={setPlacement} stages={stages} />
          </>
        )}
        <Footer onClose={onClose} busy={busy} disabled={problem !== null} problem={problem} label={initial ? 'Save' : 'Add to schedule'} />
      </Stack>
    </form>
  );
}

export function PlannedMatchModal(props: PlannedMatchModalProps): JSX.Element {
  const { opened, ...rest } = props;
  return (
    <Modal opened={opened} onClose={props.onClose} title="Match placeholder" size="lg">
      {opened && <PlannedMatchForm {...rest} />}
    </Modal>
  );
}

/** The placeholder input of a planned match event (to edit it). */
export function plannedMatchInputOf(event: SeriesEventView): CreateSeriesPlannedMatchInput | null {
  const t = event.match_template;
  if (!t) return null;
  return {
    stage_id: event.stage_id, role: event.role, week: event.week, points_multiplier: event.points_multiplier,
    counts_for_standings: event.counts_for_standings,
    match: { ...t, name: t.name ?? event.name ?? '', start_date: t.start_date ?? event.start_date ?? '' },
  };
}

// ─── assigning a match placeholder ───────────────────────────────────────────

/** Entrant ids picked for a placeholder are valid for the series' scoring type (Normal: 2..16; FFA / racing: 1+). */
export function assignmentProblem(scoringType: string | null | undefined, ids: readonly string[]): string | null {
  const bounds = matchEntrantBounds(scoringType);
  if (ids.length < Math.max(bounds.min, 1)) return bounds.min >= 2 ? 'Pick at least two entrants' : 'Pick at least one entrant';
  if (bounds.max !== null && ids.length > bounds.max) return `A match takes at most ${bounds.max} entrants`;
  return null;
}

interface FillMatchModalProps {
  series: SeriesSummary;
  event: SeriesEventView | null;
  entrants: SeriesEntrantDto[];
  onClose: () => void;
  onFilled: () => void;
}

/** Assigns the entrants of one match placeholder and creates its match now. */
export function FillMatchModal({ series, event, entrants, onClose, onFilled }: FillMatchModalProps): JSX.Element {
  const active = useMemo(() => schedulableEntrants(entrants), [entrants]);
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setIds([]); }, [event?.id]);
  const problem = assignmentProblem(series.scoring_type, ids);

  const submit = async () => {
    if (!event || problem) return;
    setBusy(true);
    const res = await runWithToast(`series-fill-${event.id}`, 'Creating match...', 'Match created', () => scheduleApi.fillPlannedMatch(series.id, event.id, ids));
    setBusy(false);
    if (res) { onClose(); onFilled(); }
  };

  return (
    <Modal opened={event !== null} onClose={onClose} title={`Assign entrants: ${event?.name ?? ''}`} size="md">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">{formatShortDateTime(event?.start_date) ?? 'No date set'}. The match is created with these entrants&apos; rosters.</Text>
          <EntrantSelect entrants={active} value={ids} onChange={setIds} />
          <Footer onClose={onClose} busy={busy} disabled={problem !== null} problem={problem} label="Create match" />
        </Stack>
      </form>
    </Modal>
  );
}

// ─── generating a planned schedule now ───────────────────────────────────────

/** Compact read-only fixture list: per week, fixture names and times. */
export function FixtureSummary({ preview, names, maxWeeks = 3 }: { preview: GeneratorPreview; names: ReadonlyMap<string, string>; maxWeeks?: number }): JSX.Element {
  const weeks = [...new Set(preview.fixtures.map((f) => f.week))].sort((a, b) => a - b);
  const first = preview.fixtures[0]?.start;
  const last = preview.fixtures.at(-1)?.start;
  const label = (ids: string[], fallback: string) => (ids.length === 2 ? ids.map((id) => names.get(id) ?? id).join(' vs ') : fallback);
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Badge variant="light" color="violet">{preview.fixtures.length} {preview.fixtures.length === 1 ? 'event' : 'events'}</Badge>
        <Badge variant="light" color="gray">{weeks.length} {weeks.length === 1 ? 'week' : 'weeks'}</Badge>
        {first && <Text size="xs" c="dimmed">{formatShortDateTime(first)} → {formatShortDateTime(last)}</Text>}
      </Group>
      {preview.warnings.length > 0 && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
          <Stack gap={2}>{preview.warnings.map((w) => <Text key={w} size="xs">{w}</Text>)}</Stack>
        </Alert>
      )}
      <ScrollArea.Autosize mah={220}>
        <Stack gap={6}>
          {weeks.slice(0, maxWeeks).map((week) => (
            <div key={week}>
              <SectionLabel>Week {week}</SectionLabel>
              {preview.fixtures.filter((f) => f.week === week).map((f) => (
                <Text key={`${f.start}-${f.entrant_ids.join()}`} size="xs">{formatShortDateTime(f.start)} · {label(f.entrant_ids, f.name)}</Text>
              ))}
            </div>
          ))}
          {weeks.length > maxWeeks && <Text size="xs" c="dimmed">… and {weeks.length - maxWeeks} more weeks</Text>}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}

export const DIVISION_MODE_OPTIONS: Array<{ value: RoundRobinDivisionMode; label: string }> = [
  { value: 'none', label: 'Everyone plays everyone' },
  { value: 'within', label: 'Only within divisions' },
  { value: 'within_and_cross', label: 'Within divisions twice, across once' },
];

interface GenerateBatchModalProps {
  series: SeriesSummary;
  batch: { id: string; kind: SeriesBatchKind; config: GeneratorConfig } | null;
  entrants: SeriesEntrantDto[];
  onClose: () => void;
  onGenerated: () => void;
}

/** Previews a planned schedule with today's approved entrants and generates it. */
export function GenerateBatchModal({ series, batch, entrants, onClose, onGenerated }: GenerateBatchModalProps): JSX.Element {
  const [divisions, setDivisions] = useState<RoundRobinDivisionMode>('none');
  const [preview, setPreview] = useState<GeneratorPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const names = useMemo(() => entrantNameMap(entrants), [entrants]);
  const hasDivisions = entrants.some((e) => e.status === 'active' && e.division);
  const batchId = batch?.id ?? null;

  useEffect(() => {
    if (!batchId) return undefined;
    let cancelled = false;
    setPreview(null);
    setError(null);
    scheduleApi.previewPlannedBatch(series.id, batchId, { divisions })
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch((err: unknown) => { if (!cancelled) setError(errorMessage(err, 'Failed to preview the schedule')); });
    return () => { cancelled = true; };
  }, [series.id, batchId, divisions]);

  const generate = async () => {
    if (!batchId) return;
    setBusy(true);
    const res = await runWithToast(`series-generate-${batchId}`, 'Generating schedule...', (r) => `${r.events.length} events created`,
      () => scheduleApi.generatePlannedBatch(series.id, batchId, { divisions }));
    setBusy(false);
    if (res) { onClose(); onGenerated(); }
  };

  return (
    <Modal opened={batch !== null} onClose={onClose} title="Generate schedule now" size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">Creates the fixtures with the entrants approved right now. Entrants approved later are not added (regenerate the unplayed events then).</Text>
        {batch?.kind === 'round_robin' && hasDivisions && (
          <Select label="Divisions" data={DIVISION_MODE_OPTIONS} value={divisions} onChange={(v) => { if (v) setDivisions(v as RoundRobinDivisionMode); }} allowDeselect={false} />
        )}
        {error && <Alert color="red" variant="light">{error}</Alert>}
        {!preview && !error && <Center py="md"><Loader size="sm" /></Center>}
        {preview && <FixtureSummary preview={preview} names={names} />}
        <Divider />
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => { void generate(); }} loading={busy} disabled={!preview || preview.fixtures.length === 0}>Generate</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ─── playoff picture ─────────────────────────────────────────────────────────

/** First round of a projected (or decided) playoff: seed pairs in bracket order, or the qualifier list for a points format. */
export function ProjectedBracketView({ bracket }: { bracket: ProjectedBracketResponse }): JSX.Element {
  if (bracket.qualifiers.length === 0) return <Text size="sm" c="dimmed">Nobody qualifies yet.</Text>;
  const seedLine = (q: ProjectedBracketResponse['qualifiers'][number]) => (
    <Group gap={6} wrap="nowrap">
      <Text size="xs" c="dimmed" ff="monospace" w={22}>#{q.seed}</Text>
      <Text size="sm" fw={500} truncate>{q.name}</Text>
    </Group>
  );
  return (
    <Stack gap="xs">
      {bracket.pairings.length > 0 ? (
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
          {bracket.pairings.map((p) => (
            <Card key={`${p.a.seed}-${p.b?.seed ?? 'bye'}`} withBorder radius="sm" padding="xs">
              {seedLine(p.a)}
              {p.b ? seedLine(p.b) : <Text size="xs" c="dimmed" pl={28}>Bye</Text>}
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Stack gap={2}>{bracket.qualifiers.map((q) => <div key={q.entrant_id}>{seedLine(q)}</div>)}</Stack>
      )}
    </Stack>
  );
}

/** Loads the projected bracket of a planned playoff (reloads when `refreshToken` changes). */
export function useProjectedBracket(seriesId: string, eventId: string | null, refreshToken = 0): { bracket: ProjectedBracketResponse | null; error: string | null } {
  const [bracket, setBracket] = useState<ProjectedBracketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!eventId) { setBracket(null); return undefined; }
    let cancelled = false;
    scheduleApi.projectedBracket(seriesId, eventId)
      .then((b) => { if (!cancelled) { setBracket(b); setError(null); } })
      .catch((err: unknown) => { if (!cancelled) setError(errorMessage(err, 'Failed to load the playoff picture')); });
    return () => { cancelled = true; };
  }, [seriesId, eventId, refreshToken]);
  return { bracket, error };
}

export function ProjectedBracketModal({ seriesId, event, onClose }: { seriesId: string; event: SeriesEventView | null; onClose: () => void }): JSX.Element {
  const { bracket, error } = useProjectedBracket(seriesId, event?.id ?? null);
  return (
    <Modal opened={event !== null} onClose={onClose} title={<Group gap={6}><IconTrophy size={18} /><Text fw={600}>{event?.name ?? 'Playoffs'}: playoff picture</Text></Group>} size="lg">
      <Stack gap="sm">
        {error && <Alert color="red" variant="light">{error}</Alert>}
        {!bracket && !error && <Center py="md"><Loader size="sm" /></Center>}
        {bracket && (
          <>
            <Text size="sm" c="dimmed">
              {bracket.provisional
                ? 'If the season ended today. The seeds follow the standings and change as results come in.'
                : 'The qualifiers are decided.'}
            </Text>
            <ProjectedBracketView bracket={bracket} />
            {bracket.warnings.length > 0 && (
              <Stack gap={2}>{bracket.warnings.map((w) => <Text key={w} size="xs" c="dimmed">{w}</Text>)}</Stack>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
