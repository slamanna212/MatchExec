import type { JSX, ReactNode } from 'react';
import { Card, Stack } from '@mantine/core';
import { SectionLabel } from '@/components/SectionLabel';

export function SeriesFormCard({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <SectionLabel>{title}</SectionLabel>
        {children}
      </Stack>
    </Card>
  );
}
