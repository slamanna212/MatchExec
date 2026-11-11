import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import {
  Modal, Stack, Group, Button, Text, Stepper, NumberInput, TextInput, Select, Alert, Card, Badge, Table, Loader, Center, SimpleGrid,
} from '@mantine/core';
import { IconAlertTriangle, IconUsers, IconSwords, IconListCheck, IconArrowsShuffle } from '@tabler/icons-react';
import type { GeneratorPreview, RoundRobinDivisionMode, SeriesBatchDto } from '@/shared/series-types';
import { useSeriesEntrants } from './series-entrants-api';
import {
  MAX_DIVISIONS, closePayload, defaultDivisionNames, divisionPayload, existingDivisions, snakeSplit, unassignedToDivision,
} from './series-close';
import { EntrantSelect } from './series-entrant-select';
import { describeScheduleConfig, entrantNameMap, schedulableEntrants } from './series-fixtures';
import { DIVISION_MODE_OPTIONS, FixtureSummary, assignmentProblem } from './series-placeholder-modals';
import { errorMessage, runWithToast, scheduleApi } from './series-schedule-api';
import { plannedWork } from './series-schedule-helpers';
import { formatShortDateTime } from './series-shared';
import type { SeriesEventView, SeriesSummary } from './series-shared';

interface CloseRegistrationModalProps {
  opened: boolean;
  series: SeriesSummary;
  events: SeriesEventView[];
  batches: SeriesBatchDto[];
  onClose: () => void;
  onClosed: () => void;
}

type PreviewState = { preview: GeneratorPreview | null; error: string | null };

/**
 * Closing registration (or starting a draft season): divisions, then entrants for every match placeholder, then a review
 * of what each planned schedule generates. Confirming does all of it in one request and starts the season.
 */
export function CloseRegistrationModal({ opened, series, events, batches, onClose, onClosed }: CloseRegistrationModalProps): JSX.Element {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={series.status === 'registration' ? 'Close registration and build the schedule' : 'Start season and build the schedule'}
      size="xl"
    >
      {opened && <CloseFlow series={series} events={events} batches={batches} onClose={onClose} onClosed={onClosed} />}
    </Modal>
  );
}

function CloseFlow({ series, events, batches, onClose, onClosed }: Omit<CloseRegistrationModalProps, 'opened'>): JSX.Element {
  const { entrants, loading } = useSeriesEntrants(series.id);
  const work = useMemo(() => plannedWork(events, batches), [events, batches]);
  const active = useMemo(() => schedulableEntrants(entrants), [entrants]);
  const pending = entrants.filter((e) => e.status === 'pending');
  const names = useMemo(() => entrantNameMap(entrants), [entrants]);
  const hasRoundRobin = work.batches.some((b) => b.kind === 'round_robin');
  const steps = ['entrants', ...(work.matches.length > 0 ? ['matches'] : []), 'review'] as const;
  const [step, setStep] = useState(0);
  const current = steps[step];

  // divisions
  const [divisionNames, setDivisionNames] = useState<string[]>([]);
  const [divisionOf, setDivisionOf] = useState<Record<string, string | null>>({});
  const [initialised, setInitialised] = useState(false);
  useEffect(() => {
    if (loading || initialised) return;
    const existing = existingDivisions(entrants);
    setDivisionNames(existing.length > 1 ? existing : []);
    setDivisionOf(Object.fromEntries(schedulableEntrants(entrants).map((e) => [e.id, e.division])));
    setInitialised(true);
  }, [loading, initialised, entrants]);
  const setDivisionCount = (n: number) => {
    const count = Math.max(1, Math.min(MAX_DIVISIONS, n));
    if (count === 1) { setDivisionNames([]); return; }
    const next = [...divisionNames, ...defaultDivisionNames(count)].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, count);
    setDivisionNames(next);
  };
  const renameDivision = (i: number, name: string) => {
    const old = divisionNames[i];
    setDivisionNames(divisionNames.map((d, j) => (j === i ? name : d)));
    setDivisionOf((prev) => Object.fromEntries(Object.entries(prev).map(([id, d]) => [id, d === old ? name : d])));
  };

  // match placeholders
  const [matchAssign, setMatchAssign] = useState<Record<string, string[]>>({});
  const matchProblems = work.matches.map((m) => assignmentProblem(series.scoring_type, matchAssign[m.id] ?? []));

  // review
  const [batchModes, setBatchModes] = useState<Record<string, RoundRobinDivisionMode>>({});
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const multi = divisionNames.length > 1;
  const overrides = useMemo(() => divisionPayload(entrants, divisionNames, divisionOf), [entrants, divisionNames, divisionOf]);
  // The page re-polls while registration is open: only refetch the previews when the planned schedules really change.
  const batchKey = work.batches.map((b) => `${b.id}:${JSON.stringify(b.config)}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the content, not the array identity
  const stableBatches = useMemo(() => work.batches, [batchKey]);
  useEffect(() => {
    if (current !== 'review') return undefined;
    let cancelled = false;
    for (const b of stableBatches) {
      const mode = b.kind === 'round_robin' ? (multi ? (batchModes[b.id] ?? 'within') : 'none') : undefined;
      setPreviews((p) => ({ ...p, [b.id]: { preview: null, error: null } }));
      scheduleApi.previewPlannedBatch(series.id, b.id, { ...(mode ? { divisions: mode } : {}), division_overrides: overrides })
        .then((preview) => { if (!cancelled) setPreviews((p) => ({ ...p, [b.id]: { preview, error: null } })); })
        .catch((err: unknown) => { if (!cancelled) setPreviews((p) => ({ ...p, [b.id]: { preview: null, error: errorMessage(err, 'Preview failed') } })); });
    }
    return () => { cancelled = true; };
  }, [current, stableBatches, series.id, overrides, batchModes, multi]);

  const [busy, setBusy] = useState(false);
  const unassigned = unassignedToDivision(entrants, divisionNames, divisionOf);
  const previewErrors = work.batches.map((b) => previews[b.id]?.error).filter(Boolean);
  let blocker: string | null = null;
  if (current === 'entrants') {
    if (active.length < 2) blocker = 'At least two approved entrants are needed. Approve sign-ups in the Entrants tab first.';
    else if (divisionNames.some((d) => !d.trim())) blocker = 'Give every division a name';
    else if (new Set(divisionNames.map((d) => d.trim())).size !== divisionNames.length) blocker = 'Division names must be different';
  } else if (current === 'matches') {
    const i = matchProblems.findIndex(Boolean);
    if (i >= 0) blocker = `${work.matches[i].name ?? 'A match'}: ${matchProblems[i]}`;
  } else if (previewErrors.length > 0) {
    blocker = previewErrors[0] ?? null;
  }

  const confirm = async () => {
    setBusy(true);
    const body = closePayload({ entrants, divisionNames: divisionNames.map((d) => d.trim()), divisionOf, batches: work.batches, batchModes, matches: matchAssign });
    const res = await runWithToast(
      `series-close-${series.id}`, 'Building the schedule...',
      (r) => `Season started: ${r.generated.reduce((n, g) => n + g.event_count, 0) + r.filled.length} events created`,
      () => scheduleApi.closeRegistration(series.id, body),
    );
    setBusy(false);
    if (res) { onClose(); onClosed(); }
  };

  if (loading) return <Center py="xl"><Loader /></Center>;

  return (
    <Stack gap="lg">
      <Stepper active={step} size="sm" onStepClick={(i) => { if (i < step) setStep(i); }}>
        <Stepper.Step label="Entrants" icon={<IconUsers size={16} />} />
        {work.matches.length > 0 && <Stepper.Step label="Matches" icon={<IconSwords size={16} />} />}
        <Stepper.Step label="Review" icon={<IconListCheck size={16} />} />
      </Stepper>

      {current === 'entrants' && (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
            <Card withBorder radius="md" padding="sm"><Text size="xs" c="dimmed">Approved</Text><Text fw={700} size="xl">{active.length}</Text></Card>
            <Card withBorder radius="md" padding="sm"><Text size="xs" c="dimmed">Pending</Text><Text fw={700} size="xl" c={pending.length > 0 ? 'yellow' : undefined}>{pending.length}</Text></Card>
          </SimpleGrid>
          {pending.length > 0 && (
            <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
              {pending.length} pending {pending.length === 1 ? 'entrant is' : 'entrants are'} left out: {pending.map((e) => e.name).join(', ')}. Approve them in the Entrants tab first if they should play.
            </Alert>
          )}
          {hasRoundRobin && (
            <Stack gap="sm">
              <Group align="flex-end" gap="sm">
                <NumberInput label="Divisions" description="1 = everyone in one table" value={Math.max(1, divisionNames.length)} onChange={(v) => setDivisionCount(typeof v === 'number' ? v : 1)} min={1} max={MAX_DIVISIONS} allowDecimal={false} w={160} />
                {multi && (
                  <Button variant="light" leftSection={<IconArrowsShuffle size={16} />} onClick={() => setDivisionOf(snakeSplit(entrants, divisionNames))}>
                    Split by seed
                  </Button>
                )}
              </Group>
              {multi && (
                <>
                  <SimpleGrid cols={{ base: 1, sm: Math.min(divisionNames.length, 4) }} spacing="xs">
                    {divisionNames.map((d, i) => (
                      <TextInput key={i} size="xs" label={`Division ${i + 1}`} value={d} onChange={(e) => renameDivision(i, e.currentTarget.value)} />
                    ))}
                  </SimpleGrid>
                  <Table.ScrollContainer minWidth={360}>
                    <Table verticalSpacing={4}>
                      <Table.Thead><Table.Tr><Table.Th>Entrant</Table.Th><Table.Th w={70}>Seed</Table.Th><Table.Th w={200}>Division</Table.Th></Table.Tr></Table.Thead>
                      <Table.Tbody>
                        {active.map((e) => (
                          <Table.Tr key={e.id}>
                            <Table.Td><Text size="sm">{e.name}</Text></Table.Td>
                            <Table.Td><Text size="sm" c="dimmed">{e.seed ?? '–'}</Text></Table.Td>
                            <Table.Td>
                              <Select size="xs" data={divisionNames} value={divisionOf[e.id] && divisionNames.includes(divisionOf[e.id] as string) ? divisionOf[e.id] : null} placeholder="Pick" onChange={(v) => setDivisionOf((p) => ({ ...p, [e.id]: v }))} />
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                  {unassigned.length > 0 && <Text size="xs" c="orange">{unassigned.length} without a division: they form their own pool.</Text>}
                </>
              )}
            </Stack>
          )}
        </Stack>
      )}

      {current === 'matches' && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">Pick who plays in each match placeholder. The matches are created with their rosters.</Text>
          {work.matches.map((m, i) => (
            <Card key={m.id} withBorder radius="md" padding="sm">
              <Stack gap={6}>
                <Group justify="space-between">
                  <Text fw={600}>{m.name}</Text>
                  <Text size="xs" c="dimmed">{formatShortDateTime(m.start_date) ?? 'No date'}</Text>
                </Group>
                <EntrantSelect entrants={active} value={matchAssign[m.id] ?? []} onChange={(ids) => setMatchAssign((p) => ({ ...p, [m.id]: ids }))} error={(matchAssign[m.id]?.length ?? 0) > 0 ? matchProblems[i] : null} />
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      {current === 'review' && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            This is what gets created with the {active.length} approved entrants. Fixtures can still be moved afterwards, and unplayed ones regenerated.
          </Text>
          {work.matches.length > 0 && (
            <Card withBorder radius="md" padding="sm">
              <Text fw={600} mb={4}>Matches</Text>
              {work.matches.map((m) => (
                <Text key={m.id} size="sm">{m.name}: {(matchAssign[m.id] ?? []).map((id) => names.get(id) ?? id).join(' vs ')}</Text>
              ))}
            </Card>
          )}
          {work.batches.map((b) => (
            <Card key={b.id} withBorder radius="md" padding="sm">
              <Stack gap="xs">
                <Group justify="space-between" wrap="wrap">
                  <div>
                    <Text fw={600}>{b.kind === 'round_robin' ? 'Round robin' : 'Race calendar'}</Text>
                    <Text size="xs" c="dimmed">{describeScheduleConfig(b.kind, b.config)}</Text>
                  </div>
                  {b.kind === 'round_robin' && multi && (
                    <Select size="xs" w={260} data={DIVISION_MODE_OPTIONS} value={batchModes[b.id] ?? 'within'} onChange={(v) => { if (v) setBatchModes((p) => ({ ...p, [b.id]: v as RoundRobinDivisionMode })); }} allowDeselect={false} />
                  )}
                </Group>
                {previews[b.id]?.error && <Alert color="red" variant="light">{previews[b.id]?.error}</Alert>}
                {!previews[b.id]?.preview && !previews[b.id]?.error && <Center py="xs"><Loader size="sm" /></Center>}
                {previews[b.id]?.preview && <FixtureSummary preview={previews[b.id]?.preview as GeneratorPreview} names={names} />}
              </Stack>
            </Card>
          ))}
          {work.batches.length === 0 && work.matches.length === 0 && (
            <Text size="sm">Nothing is planned, so no events are created. The season simply starts.</Text>
          )}
          {events.some((e) => e.status === 'planned' && e.seeding_rule) && (
            <Group gap={6}><Badge variant="light" color="violet">Playoffs</Badge><Text size="xs" c="dimmed">are seeded from the standings once the regular season is decided.</Text></Group>
          )}
        </Stack>
      )}

      {blocker && <Text size="sm" c="orange">{blocker}</Text>}
      <Group justify="space-between">
        <Button variant="outline" onClick={step === 0 ? onClose : () => setStep(step - 1)} disabled={busy}>{step === 0 ? 'Cancel' : 'Back'}</Button>
        {current === 'review' ? (
          <Button color="violet" onClick={() => { void confirm(); }} loading={busy} disabled={blocker !== null || work.batches.some((b) => !previews[b.id]?.preview)}>
            {series.status === 'registration' ? 'Close registration & start season' : 'Start season'}
          </Button>
        ) : (
          <Button onClick={() => setStep(step + 1)} disabled={blocker !== null}>Next</Button>
        )}
      </Group>
    </Stack>
  );
}
