'use client'

import type { JSX } from 'react';
import { Stack, Text, Card, Avatar, Group, Badge } from '@mantine/core';
import { IconUserCheck } from '@tabler/icons-react';

interface Participant {
  id: string;
  username: string;
  avatar_url?: string | null;
}

interface ConfirmParticipantsProps {
  participants: Participant[];
}

/**
 * FFA / Position setup: shows all enrolled participants ready to compete.
 * No team assignment needed — every participant is their own entry.
 */
export function ConfirmParticipants({ participants }: ConfirmParticipantsProps): JSX.Element {
  return (
    <Stack gap="sm">
      <Group gap="xs" mb="xs">
        <IconUserCheck size={18} />
        <Text fw={600}>{participants.length} participant{participants.length !== 1 ? 's' : ''} confirmed</Text>
      </Group>
      {participants.map((p) => (
        <Card key={p.id} withBorder padding="sm" radius="md">
          <Group gap="sm">
            <Avatar src={p.avatar_url ?? undefined} size="sm" radius="xl">
              {p.username[0]?.toUpperCase()}
            </Avatar>
            <Text size="sm" fw={500}>{p.username}</Text>
            <Badge variant="light" color="green" size="xs" ml="auto">Ready</Badge>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
