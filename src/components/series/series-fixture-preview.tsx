import type { JSX } from 'react';
import { Stack, Group, Text, Table, TextInput, NumberInput, ActionIcon, Tooltip, Alert, Badge } from '@mantine/core';
import { IconArrowsExchange, IconTrash, IconAlertTriangle } from '@tabler/icons-react';
import { SectionLabel } from '@/components/SectionLabel';
import type { GeneratorPreview } from '@/shared/series-types';
import {
  groupFixturesByWeek, isoToZoned, removeFixture, setFixtureTime, swapHomeAway, updateFixture,
} from './series-fixtures';
import type { EditableFixture } from './series-fixtures';

interface FixturePreviewProps {
  fixtures: EditableFixture[];
  onChange: (fixtures: EditableFixture[]) => void;
  byes: GeneratorPreview['byes'];
  warnings: string[];
  names: ReadonlyMap<string, string>;
  timezone: string;
  /** Race calendar: events with many entrants, so the name is editable instead of the home / away swap. */
  race?: boolean;
}

/** Editable generator preview: fixtures by week with date / time, home-away swap and remove. */
export function FixturePreview({ fixtures, onChange, byes, warnings, names, timezone, race }: FixturePreviewProps): JSX.Element {
  const groups = groupFixturesByWeek(fixtures, byes);
  const nameOf = (id: string) => names.get(id) ?? id;

  return (
    <Stack gap="md">
      {warnings.length > 0 && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />} title="Heads up">
          <Stack gap={2}>{warnings.map((w) => <Text key={w} size="sm">{w}</Text>)}</Stack>
        </Alert>
      )}
      {groups.length === 0 && <Text size="sm" c="dimmed" ta="center" py="md">Nothing left to create.</Text>}
      {groups.map((group) => (
        <Stack key={group.week} gap={4} data-testid={`preview-week-${group.week}`}>
          <Group justify="space-between" gap="xs">
            <SectionLabel>Week {group.week}</SectionLabel>
            {group.byes.length > 0 && (
              <Text size="xs" c="dimmed">Bye: {group.byes.map(nameOf).join(', ')}</Text>
            )}
          </Group>
          <Table.ScrollContainer minWidth={520}>
            <Table verticalSpacing={4} horizontalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={140}>Date</Table.Th>
                  <Table.Th w={110}>Time</Table.Th>
                  <Table.Th>{race ? 'Event' : 'Fixture'}</Table.Th>
                  <Table.Th w={80}>Week</Table.Th>
                  <Table.Th w={72} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {group.fixtures.map((f) => {
                  const zoned = isoToZoned(f.start, timezone);
                  return (
                    <Table.Tr key={f.key} data-testid="fixture-row">
                      <Table.Td>
                        <TextInput
                          type="date" size="xs" aria-label={`Date of ${f.name}`} value={zoned.date}
                          onChange={(e) => onChange(setFixtureTime(fixtures, f.key, e.currentTarget.value, zoned.time, timezone))}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          type="time" size="xs" aria-label={`Time of ${f.name}`} value={zoned.time}
                          onChange={(e) => onChange(setFixtureTime(fixtures, f.key, zoned.date, e.currentTarget.value, timezone))}
                        />
                      </Table.Td>
                      <Table.Td>
                        {race ? (
                          <Group gap="xs" wrap="nowrap">
                            <TextInput
                              size="xs" aria-label="Event name" value={f.name} style={{ flex: 1 }}
                              onChange={(e) => onChange(updateFixture(fixtures, f.key, { name: e.currentTarget.value }))}
                            />
                            <Badge size="xs" variant="light" color="gray">{f.entrant_ids.length} entrants</Badge>
                          </Group>
                        ) : (
                          <Text size="sm">{f.entrant_ids.length === 2 ? f.entrant_ids.map(nameOf).join(' vs ') : f.name}</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs" aria-label={`Week of ${f.name}`} value={f.week} min={1} allowDecimal={false} hideControls
                          onChange={(v) => { if (typeof v === 'number') onChange(updateFixture(fixtures, f.key, { week: v })); }}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap={2} wrap="nowrap" justify="flex-end">
                          {!race && f.entrant_ids.length === 2 && (
                            <Tooltip label="Swap home and away" withArrow>
                              <ActionIcon
                                variant="subtle" size="sm" aria-label={`Swap home and away of ${f.name}`}
                                onClick={() => onChange(swapHomeAway(fixtures, f.key, names))}
                              >
                                <IconArrowsExchange size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                          <ActionIcon
                            variant="subtle" color="red" size="sm" aria-label={`Remove ${f.name}`}
                            onClick={() => onChange(removeFixture(fixtures, f.key))}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      ))}
    </Stack>
  );
}
