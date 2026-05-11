import { Text } from '@mantine/core';
import type React from 'react';
import type { JSX } from 'react';

/**
 * Consistent subsection label for use inside cards and panels.
 * Renders as an uppercase, spaced-out, dimmed small label.
 */
export function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.05em' }}>
      {children}
    </Text>
  );
}
