import { useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { Modal, Stack, Group, Button, Divider, Text, Loader, Center } from '@mantine/core';
import type { GeneratorPreview, RaceCalendarConfig, RoundRobinConfig } from '@/shared/series-types';
import { FixturePreview } from './series-fixture-preview';
import {
  buildCommitPayload, buildRaceCalendarConfig, buildRoundRobinConfig, defaultRaceCalendarForm, defaultRoundRobinForm, entrantNameMap,
  schedulableEntrants, toEditable, validateRaceCalendarForm, validateRoundRobinForm,
} from './series-fixtures';
import type { EditableFixture, RaceCalendarFormState, RoundRobinFormState } from './series-fixtures';
import { RaceCalendarFields, RoundRobinFields } from './series-generator-fields';
import type { SetForm } from './series-generator-fields';
import type { CreateEventModalProps } from './series-create-event-modals';
import { runWithToast, scheduleApi } from './series-schedule-api';
import type { GeneratorKind } from './series-schedule-api';
import { useGameCatalog } from './series-setup-fields';
import { defaultTemplateState } from './series-template';

const singular = (noun: string): string => (noun.endsWith('ches') ? noun.slice(0, -2) : noun.replace(/s$/, ''));

interface GeneratorFlowProps<F, C> {
  kind: GeneratorKind;
  form: F;
  validate: (form: F) => string | null;
  buildConfig: (form: F) => C;
  timezone: string;
  names: ReadonlyMap<string, string>;
  seriesId: string;
  /** "matches" / "events": the noun in the commit button. */
  noun: string;
  race?: boolean;
  fields: ReactNode;
  onClose: () => void;
  onCreated: () => void;
}

/** Config -> Preview (editable table) -> Create. Shared by the round-robin and race-calendar modals. */
export function GeneratorFlow<F, C extends RoundRobinConfig | RaceCalendarConfig>({
  kind, form, validate, buildConfig, timezone, names, seriesId, noun, race, fields, onClose, onCreated,
}: GeneratorFlowProps<F, C>): JSX.Element {
  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [fixtures, setFixtures] = useState<EditableFixture[]>([]);
  const [meta, setMeta] = useState<Pick<GeneratorPreview, 'byes' | 'warnings'>>({ byes: [], warnings: [] });
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<C | null>(null);
  const problem = validate(form);

  const preview = async () => {
    if (problem) return;
    const cfg = buildConfig(form);
    setBusy(true);
    const res = await runWithToast(`series-preview-${kind}-${seriesId}`, 'Building the schedule...', 'Schedule ready', () => scheduleApi.previewGenerator(seriesId, kind, cfg));
    setBusy(false);
    if (!res) return;
    setConfig(cfg);
    setFixtures(toEditable(res.fixtures));
    setMeta({ byes: res.byes ?? [], warnings: res.warnings ?? [] });
    setStep('preview');
  };

  const commit = async () => {
    if (!config || fixtures.length === 0) return;
    setBusy(true);
    const res = await runWithToast(
      `series-commit-${kind}-${seriesId}`, `Creating ${noun}...`, (r) => `${r.events.length} ${noun} created`,
      () => scheduleApi.commitGenerator(seriesId, kind, buildCommitPayload(config, fixtures)),
    );
    setBusy(false);
    if (res) { onClose(); onCreated(); }
  };

  if (step === 'preview') {
    return (
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Review the schedule. Change a date or time, swap home and away, or remove fixtures you do not want, then create it.
        </Text>
        {busy && <Center><Loader size="sm" /></Center>}
        <FixturePreview fixtures={fixtures} onChange={setFixtures} byes={meta.byes} warnings={meta.warnings} names={names} timezone={timezone} race={race} />
        <Divider />
        <Group justify="space-between">
          <Button variant="subtle" onClick={() => setStep('config')} disabled={busy}>Back to settings</Button>
          <Group>
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={() => { void commit(); }} loading={busy} disabled={fixtures.length === 0}>
              Create {fixtures.length} {fixtures.length === 1 ? singular(noun) : noun}
            </Button>
          </Group>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {fields}
      {problem && <Text size="xs" c="dimmed">{problem}</Text>}
      <Divider />
      <Group justify="flex-end">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={() => { void preview(); }} loading={busy} disabled={problem !== null}>Preview</Button>
      </Group>
    </Stack>
  );
}

function RoundRobinForm({ series, stages, entrants, defaultStageId, onClose, onCreated }: Omit<CreateEventModalProps, 'opened'>): JSX.Element {
  const { catalog } = useGameCatalog();
  const active = useMemo(() => schedulableEntrants(entrants), [entrants]);
  const [form, setForm] = useState<RoundRobinFormState>(() =>
    defaultRoundRobinForm({ stage_id: defaultStageId ?? null, template: defaultTemplateState(series) }));
  const set: SetForm<RoundRobinFormState> = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <GeneratorFlow<RoundRobinFormState, RoundRobinConfig>
      kind="round-robin"
      form={form}
      validate={(f) => validateRoundRobinForm(f, active.length)}
      buildConfig={buildRoundRobinConfig}
      timezone={form.timezone}
      names={entrantNameMap(entrants)}
      seriesId={series.id}
      noun="matches"
      onClose={onClose}
      onCreated={onCreated}
      fields={<RoundRobinFields form={form} set={set} series={series} catalog={catalog} stages={stages} active={active} />}
    />
  );
}

export function RoundRobinModal(props: CreateEventModalProps): JSX.Element {
  const { opened, ...rest } = props;
  return (
    <Modal opened={opened} onClose={props.onClose} title="Round robin" size="xl">
      <RoundRobinForm {...rest} />
    </Modal>
  );
}

function RaceCalendarForm({ series, stages, entrants, defaultStageId, onClose, onCreated }: Omit<CreateEventModalProps, 'opened'>): JSX.Element {
  const { catalog } = useGameCatalog();
  const active = useMemo(() => schedulableEntrants(entrants), [entrants]);
  const [form, setForm] = useState<RaceCalendarFormState>(() =>
    defaultRaceCalendarForm({ stage_id: defaultStageId ?? null, template: defaultTemplateState(series) }));
  const set: SetForm<RaceCalendarFormState> = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <GeneratorFlow<RaceCalendarFormState, RaceCalendarConfig>
      kind="race-calendar"
      form={form}
      validate={(f) => validateRaceCalendarForm(f, active.length)}
      buildConfig={buildRaceCalendarConfig}
      timezone={form.timezone}
      names={entrantNameMap(entrants)}
      seriesId={series.id}
      noun="events"
      race
      onClose={onClose}
      onCreated={onCreated}
      fields={<RaceCalendarFields form={form} set={set} series={series} catalog={catalog} stages={stages} active={active} />}
    />
  );
}

export function RaceCalendarModal(props: CreateEventModalProps): JSX.Element {
  const { opened, ...rest } = props;
  return (
    <Modal opened={opened} onClose={props.onClose} title="Race calendar" size="xl">
      <RaceCalendarForm {...rest} />
    </Modal>
  );
}

