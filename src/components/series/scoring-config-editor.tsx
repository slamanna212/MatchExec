import type { JSX } from 'react';
import {
  Stack, Text, Group, NumberInput, Switch, UnstyledButton, CloseButton, SegmentedControl, Select, ActionIcon, Menu,
  Button, Badge, Alert,
} from '@mantine/core';
import { IconPlus, IconArrowUp, IconArrowDown, IconX, IconChevronDown, IconInfoCircle } from '@tabler/icons-react';
import type { SeriesScoringConfig, SeriesScoringType, SeriesStandingsMode } from '@/shared/series-types';
import { ordinal } from './series-shared';
import {
  ALLOWED_TIEBREAKERS, POSITION_PRESETS, TIEBREAKER_LABELS, effectiveTiebreakers, isLegacyScoringConfig, moveItem,
  suggestNextPlace, switchScoringMode,
} from './scoring-config';

interface ScoringConfigEditorProps {
  value: SeriesScoringConfig;
  onChange: (value: SeriesScoringConfig) => void;
  /** Only used for hints (which mode fits the series). The editor never changes the scoring type itself. */
  scoringType?: SeriesScoringType | null;
}

const TILE_WIDTH = 64;

interface PointsSpreadEditorProps {
  title: string;
  description: string;
  values: number[];
  onChange: (values: number[]) => void;
  /** Noun used in aria-labels: "place" -> "1st place points" / "Add a place", "position" -> "1st position points". */
  noun: string;
  presets?: boolean;
}

/** One number input per finishing position (index 0 = 1st). */
function PointsSpreadEditor({ title, description, values, onChange, noun, presets }: PointsSpreadEditorProps): JSX.Element {
  const setAt = (index: number, points: number) => {
    const next = [...values];
    next[index] = points;
    onChange(next);
  };

  return (
    <div>
      <Group justify="space-between" align="flex-end" mb="xs" wrap="nowrap">
        <div>
          <Text size="sm" fw={500}>{title}</Text>
          <Text size="xs" c="dimmed">{description}</Text>
        </div>
        {presets && (
          <Menu withinPortal position="bottom-end">
            <Menu.Target>
              <Button variant="light" size="xs" rightSection={<IconChevronDown size={14} />} style={{ flexShrink: 0 }}>
                Presets
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {POSITION_PRESETS.map((p) => (
                <Menu.Item key={p.id} onClick={() => onChange([...p.points])}>{p.label}</Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
      <Group gap="xs" align="flex-end">
        {values.map((pts, i) => (
          <Stack key={i} gap={4} align="center" w={TILE_WIDTH}>
            <Group gap={2} justify="center" wrap="nowrap" h={18}>
              <Text size="xs" c="dimmed" fw={600}>{ordinal(i + 1)}</Text>
              {i === values.length - 1 && (
                <CloseButton size="xs" aria-label={`Remove ${ordinal(i + 1)} ${noun}`} onClick={() => onChange(values.slice(0, -1))} />
              )}
            </Group>
            <NumberInput
              aria-label={`${ordinal(i + 1)} ${noun} points`}
              value={pts}
              onChange={(v) => setAt(i, typeof v === 'number' ? v : 0)}
              min={0}
              hideControls
              w={TILE_WIDTH}
              styles={{ input: { textAlign: 'center', paddingInline: 4 } }}
            />
          </Stack>
        ))}
        <UnstyledButton
          onClick={() => onChange([...values, suggestNextPlace(values)])}
          aria-label={`Add a ${noun}`}
          style={{
            width: TILE_WIDTH,
            height: 36,
            border: '1px dashed var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--mantine-color-dimmed)',
          }}
        >
          <IconPlus size={16} />
        </UnstyledButton>
      </Group>
    </div>
  );
}

function TiebreakerEditor({
  mode, value, onChange,
}: { mode: SeriesStandingsMode; value: SeriesScoringConfig; onChange: (v: SeriesScoringConfig) => void }): JSX.Element {
  const list = effectiveTiebreakers(value, mode);
  const remaining = ALLOWED_TIEBREAKERS[mode].filter((t) => !list.includes(t));
  const set = (next: typeof list) => onChange({ ...value, tiebreakers: next });

  return (
    <div>
      <Text size="sm" fw={500}>Tiebreakers</Text>
      <Text size="xs" c="dimmed" mb="xs">
        Applied in this order when entrants are level{value.tiebreakers ? '.' : ' (default order, change it to customise).'}
      </Text>
      <Stack gap={6}>
        {list.map((t, i) => (
          <Group key={t} gap="xs" wrap="nowrap">
            <Badge variant="light" color="gray" w={28} px={0}>{i + 1}</Badge>
            <Text size="sm" style={{ flex: 1 }}>{TIEBREAKER_LABELS[t]}</Text>
            <ActionIcon
              variant="subtle" size="sm" aria-label={`Move ${TIEBREAKER_LABELS[t]} up`}
              disabled={i === 0} onClick={() => set(moveItem(list, i, -1))}
            >
              <IconArrowUp size={14} />
            </ActionIcon>
            <ActionIcon
              variant="subtle" size="sm" aria-label={`Move ${TIEBREAKER_LABELS[t]} down`}
              disabled={i === list.length - 1} onClick={() => set(moveItem(list, i, 1))}
            >
              <IconArrowDown size={14} />
            </ActionIcon>
            <ActionIcon
              variant="subtle" size="sm" color="red" aria-label={`Remove ${TIEBREAKER_LABELS[t]}`}
              disabled={list.length <= 1} onClick={() => set(list.filter((x) => x !== t))}
            >
              <IconX size={14} />
            </ActionIcon>
          </Group>
        ))}
      </Stack>
      {remaining.length > 0 && (
        <Select
          mt="xs"
          size="xs"
          placeholder="Add a tiebreaker..."
          aria-label="Add a tiebreaker"
          data={remaining.map((t) => ({ value: t, label: TIEBREAKER_LABELS[t] }))}
          value={null}
          onChange={(v) => { if (v) set([...list, v as (typeof list)[number]]); }}
        />
      )}
    </div>
  );
}

/**
 * Configures how results convert into series standings. Two modes (`head_to_head`: record + optional league points from
 * 2-entrant matches; `points`: championship points per finishing position) plus the legacy view for configs saved
 * before modes existed (no `mode`: per-player points from match win/loss + tournament placement points).
 */
export function ScoringConfigEditor({ value, onChange, scoringType }: ScoringConfigEditorProps): JSX.Element {
  const legacy = isLegacyScoringConfig(value);
  const mode: SeriesStandingsMode | 'legacy' = legacy ? 'legacy' : (value.mode as SeriesStandingsMode);

  const update = <K extends keyof SeriesScoringConfig>(key: K, val: SeriesScoringConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  const modeOptions = [
    ...(legacy ? [{ label: 'Legacy', value: 'legacy' }] : []),
    { label: 'Head to head', value: 'head_to_head' },
    { label: 'Points', value: 'points' },
  ];

  const hint = scoringType === 'Normal'
    ? 'Team vs Team series usually run as head to head (a W-L-T record).'
    : scoringType
      ? 'Free-for-all and racing series usually run as points per finishing position.'
      : null;

  const tournamentPlacement = (
    <PointsSpreadEditor
      title="Tournament placement points"
      description="Points awarded by finishing position in tournament events. Places beyond the last one score 0."
      values={value.tournament_position_points ?? []}
      onChange={(v) => update('tournament_position_points', v)}
      noun="place"
    />
  );

  const matchWinLoss = (
    <Group grow align="flex-start">
      <NumberInput
        label="Points for a match win"
        value={value.match_win_points ?? 0}
        onChange={(v) => update('match_win_points', typeof v === 'number' ? v : 0)}
        min={0}
      />
      <NumberInput
        label="Points for a match loss"
        value={value.match_loss_points ?? 0}
        onChange={(v) => update('match_loss_points', typeof v === 'number' ? v : 0)}
        min={0}
      />
    </Group>
  );

  const eventSpread = (
    <Switch
      label="Position matches use their own point spread"
      description="For Position (race/ranking) matches, award the points earned in the match itself rather than the position points above. FFA matches always use the position points."
      checked={value.position_event_use_event_spread !== false}
      onChange={(e) => update('position_event_use_event_spread', e.currentTarget.checked)}
    />
  );

  return (
    <Stack gap="md">
      <div>
        <Text size="sm" fw={500} mb={4}>Standings mode</Text>
        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(v) => { if (v !== 'legacy') onChange(switchScoringMode(value, v as SeriesStandingsMode)); }}
          data={modeOptions}
        />
        {hint && <Text size="xs" c="dimmed" mt={6}>{hint}</Text>}
      </div>

      {legacy && (
        <Alert color="gray" variant="light" icon={<IconInfoCircle size={16} />}>
          This series was saved before standings modes existed, so it is scored per player with the rules below.
          Pick a mode above to switch it to entrant standings.
        </Alert>
      )}

      {mode === 'head_to_head' && (
        <>
          <Group grow align="flex-start">
            <NumberInput
              label="Points for a win"
              value={value.win_points ?? 0}
              onChange={(v) => update('win_points', typeof v === 'number' ? v : 0)}
            />
            <NumberInput
              label="Points for a loss"
              value={value.loss_points ?? 0}
              onChange={(v) => update('loss_points', typeof v === 'number' ? v : 0)}
            />
            <NumberInput
              label="Points for a tie"
              value={value.tie_points ?? 0}
              onChange={(v) => update('tie_points', typeof v === 'number' ? v : 0)}
            />
          </Group>
          <Text size="xs" c="dimmed" mt={-8}>
            Leave all at 0 for a plain win-loss record table.
          </Text>
          <TiebreakerEditor mode="head_to_head" value={value} onChange={onChange} />
        </>
      )}

      {mode === 'points' && (
        <>
          <PointsSpreadEditor
            title="Position points"
            description="Championship points per finishing position in race / free-for-all matches (1st first). Places beyond the last score 0."
            values={value.position_points ?? []}
            onChange={(v) => update('position_points', v)}
            noun="position"
            presets
          />
          {matchWinLoss}
          {tournamentPlacement}
          <NumberInput
            label="Drop worst results"
            description="Ignore each entrant's N lowest-scoring events (0 keeps every result)."
            value={value.drop_worst ?? 0}
            onChange={(v) => update('drop_worst', typeof v === 'number' ? v : 0)}
            min={0}
            allowDecimal={false}
          />
          {eventSpread}
          <TiebreakerEditor mode="points" value={value} onChange={onChange} />
        </>
      )}

      {mode === 'legacy' && (
        <>
          {matchWinLoss}
          {tournamentPlacement}
          {eventSpread}
        </>
      )}
    </Stack>
  );
}
