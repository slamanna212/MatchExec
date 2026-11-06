import type { JSX } from 'react';
import { Group, NumberInput, Button } from '@mantine/core';
import { formatMultiplier } from './series-shared';

const QUICK_MULTIPLIERS = [1, 1.5, 2, 3];

export function isValidMultiplier(v: number | string): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0.1 && v <= 10;
}

/** Points multiplier input with quick-pick chips (0.1 to 10). */
export function MultiplierInput({ value, onChange, disabled }: {
  value: number | string; onChange: (v: number | string) => void; disabled?: boolean;
}): JSX.Element {
  return (
    <div>
      <NumberInput
        label="Points Multiplier"
        description="Points from this event are multiplied by this value"
        value={value}
        onChange={onChange}
        min={0.1}
        max={10}
        step={0.5}
        decimalScale={2}
        allowDecimal
        disabled={disabled}
        error={value !== '' && !isValidMultiplier(value) ? 'Must be between 0.1 and 10' : undefined}
      />
      <Group gap={6} mt="xs">
        {QUICK_MULTIPLIERS.map(m => (
          <Button
            key={m}
            size="compact-sm"
            radius="xl"
            variant={value === m ? 'filled' : 'default'}
            color="violet"
            ff="monospace"
            disabled={disabled}
            onClick={() => onChange(m)}
          >
            {formatMultiplier(m)}
          </Button>
        ))}
      </Group>
    </div>
  );
}
