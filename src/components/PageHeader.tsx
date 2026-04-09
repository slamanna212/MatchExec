import { Group, ThemeIcon, Title, Text } from '@mantine/core';
import type React from 'react';

interface PageHeaderProps {
  icon: React.ComponentType<{ size: number | string }>;
  title: string;
  subtitle?: string;
  /** Optional element rendered on the right side (e.g. a Button or Badge) */
  action?: React.ReactNode;
}

/**
 * Consistent page title area shared by every top-level page.
 * Renders an icon, heading, optional subtitle, and an optional right-side action.
 */
export function PageHeader({ icon: Icon, title, subtitle, action }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" mb="xl">
      <Group gap="md" align="flex-start">
        <ThemeIcon size={44} radius="md" variant="light" color="violet">
          <Icon size={24} />
        </ThemeIcon>
        <div>
          <Title order={2} size="h3">{title}</Title>
          {subtitle && (
            <Text size="sm" c="dimmed" mt={2}>{subtitle}</Text>
          )}
        </div>
      </Group>
      {action}
    </Group>
  );
}
