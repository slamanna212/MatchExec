import { Stack, ThemeIcon, Text } from '@mantine/core';
import type React from 'react';

interface EmptyStateProps {
  icon: React.ComponentType<{ size: number }>;
  title: string;
  description?: string;
  /** Optional CTA rendered below the description */
  action?: React.ReactNode;
}

/**
 * Consistent empty-state placeholder used when a list has no items.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Stack align="center" py="xl" gap="sm">
      <ThemeIcon size={56} radius="xl" variant="light" color="gray">
        <Icon size={28} />
      </ThemeIcon>
      <Text size="lg" fw={600}>{title}</Text>
      {description && (
        <Text size="sm" c="dimmed" ta="center">{description}</Text>
      )}
      {action}
    </Stack>
  );
}
