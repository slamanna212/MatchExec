import type { JSX } from 'react';
import { MultiSelect, Switch, Stack, Text } from '@mantine/core';
import type { SeriesEntrantDto } from '@/shared/series-types';

interface EntrantSelectProps {
  /** Schedulable (active) entrants. */
  entrants: SeriesEntrantDto[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  description?: string;
  /** When set, shows an "All active entrants" switch and hides the picker while it is on. */
  all?: { value: boolean; onChange: (all: boolean) => void };
  error?: string | null;
}

const optionLabel = (e: SeriesEntrantDto) => (e.tag ? `${e.name} [${e.tag}]` : e.name);

/** Multi-select of active entrants with an optional "all active entrants" shortcut. */
export function EntrantSelect({ entrants, value, onChange, label = 'Entrants', description, all, error }: EntrantSelectProps): JSX.Element {
  return (
    <Stack gap={6}>
      {all && (
        <Switch
          label={`All active entrants (${entrants.length})`}
          checked={all.value}
          onChange={(e) => all.onChange(e.currentTarget.checked)}
        />
      )}
      {(!all || !all.value) && (
        <MultiSelect
          label={label}
          description={description}
          placeholder={value.length === 0 ? 'Pick entrants' : undefined}
          data={entrants.map((e) => ({ value: e.id, label: optionLabel(e) }))}
          value={value}
          onChange={onChange}
          searchable
          clearable
          nothingFoundMessage="No active entrants"
          error={error ?? undefined}
        />
      )}
      {entrants.length === 0 && <Text size="xs" c="orange">There are no active entrants yet. Add and approve entrants first.</Text>}
    </Stack>
  );
}
