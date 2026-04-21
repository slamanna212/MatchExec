'use client'

import { Paper, Stack, Text, Badge, ThemeIcon } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';

export function StatsVisualizationPlaceholder() {
  return (
    <Paper
      withBorder
      p="xl"
      radius="md"
      style={{ minHeight: '420px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Stack align="center" gap="md">
        <ThemeIcon size={48} radius="xl" variant="light" color="violet">
          <IconChartBar size={24} />
        </ThemeIcon>
        <Stack align="center" gap={4}>
          <Text fw={600} size="lg">Stats Visualization</Text>
          <Text size="sm" c="dimmed" ta="center" maw={280}>
            Player stats, charts, and match analytics will appear here
          </Text>
        </Stack>
        <Badge variant="outline" color="gray" size="sm">Coming Soon</Badge>
      </Stack>
    </Paper>
  );
}
