import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Modal, Stack, Group, Button, TextInput, Switch, Divider, Text } from '@mantine/core';
import type { SeriesScoringConfig, SeriesScoringType, SeriesStageDto } from '@/shared/series-types';
import { defaultScoringConfig } from './scoring-config';
import { ScoringConfigEditor } from './scoring-config-editor';
import { parseScoringConfig } from './series-shared';

interface StageFormModalProps {
  opened: boolean;
  onClose: () => void;
  /** null = adding a stage. */
  stage: SeriesStageDto | null;
  onSubmit: (values: { name: string; counts_toward_season: boolean }) => Promise<void> | void;
}

/** Add a stage or rename one. */
export function StageFormModal({ opened, onClose, stage, onSubmit }: StageFormModalProps): JSX.Element {
  const [name, setName] = useState('');
  const [counts, setCounts] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opened) {
      setName(stage?.name ?? '');
      setCounts(stage?.counts_toward_season ?? true);
    }
  }, [opened, stage]);

  const valid = name.trim().length > 0 && name.trim().length <= 100;
  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), counts_toward_season: counts });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={stage ? 'Rename stage' : 'Add stage'} size="sm">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="Stage 1"
            data-autofocus
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={100}
          />
          {!stage && (
            <Switch
              label="Counts toward the season table"
              description="Turn off for stages that only get their own table (for example playoffs)"
              checked={counts}
              onChange={(e) => setCounts(e.currentTarget.checked)}
            />
          )}
          <Divider />
          <Group justify="flex-end">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving} disabled={!valid}>{stage ? 'Save' : 'Add stage'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

interface StageScoringModalProps {
  stage: SeriesStageDto | null;
  seriesScoring: SeriesScoringConfig | null | undefined;
  scoringType?: SeriesScoringType | null;
  onClose: () => void;
  /** null clears the override. */
  onSave: (config: SeriesScoringConfig | null) => Promise<void> | void;
}

function StageScoringForm({ stage, seriesScoring, scoringType, onClose, onSave }: Omit<StageScoringModalProps, 'stage'> & { stage: SeriesStageDto }): JSX.Element {
  const [config, setConfig] = useState<SeriesScoringConfig | null>(stage.scoring_config);
  const [saving, setSaving] = useState(false);

  const save = async (value: SeriesScoringConfig | null) => {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };

  // Start the override from what the series uses now, so only the differences need editing.
  const startOverride = () => {
    const base = parseScoringConfig(seriesScoring);
    setConfig(Object.keys(base).length > 0 ? structuredClone(base) : defaultScoringConfig(scoringType ?? null));
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        By default a stage is scored with the series scoring. An override replaces the series values it sets for this stage&apos;s table only.
      </Text>
      {config === null ? (
        <Button variant="light" onClick={startOverride}>Override the series scoring</Button>
      ) : (
        <ScoringConfigEditor value={config} onChange={setConfig} scoringType={scoringType} />
      )}
      <Divider />
      <Group justify="space-between">
        {stage.scoring_config !== null ? (
          <Button variant="subtle" color="red" onClick={() => { void save(null); }} disabled={saving}>Use series scoring</Button>
        ) : <span />}
        <Group>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => { void save(config); }} loading={saving} disabled={config === null && stage.scoring_config === null}>Save</Button>
        </Group>
      </Group>
    </Stack>
  );
}

/** Per-stage scoring override (the same editor the series form uses). */
export function StageScoringModal(props: StageScoringModalProps): JSX.Element {
  const { stage, onClose } = props;
  return (
    <Modal opened={stage !== null} onClose={onClose} title={stage ? `Scoring for ${stage.name}` : 'Stage scoring'} size="lg">
      {stage && <StageScoringForm {...props} stage={stage} />}
    </Modal>
  );
}
