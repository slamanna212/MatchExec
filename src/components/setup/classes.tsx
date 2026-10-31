'use client'

import { useState, type JSX } from 'react';
import { Stack, Text, Card, Avatar, Group, Select, Badge } from '@mantine/core';

interface Participant {
  id: string;
  username: string;
  avatar_url?: string | null;
}

interface ClassAssignment {
  participantId: string;
  className: string;
}

const DEFAULT_CLASSES = ['GT3', 'GT4', 'LMP', 'GTE'];

interface ClassesProps {
  participants: Participant[];
  classNames?: string[];
  onChange?: (assignments: ClassAssignment[]) => void;
}

/**
 * Racing setup: assign participants to car classes for multi-class events.
 */
export function Classes({ participants, classNames = DEFAULT_CLASSES, onChange }: ClassesProps): JSX.Element {
  const [assignments, setAssignments] = useState<ClassAssignment[]>(
    participants.map((p) => ({ participantId: p.id, className: classNames[0] ?? 'GT3' }))
  );

  const updateClass = (id: string, cls: string) => {
    const next = assignments.map((a) => (a.participantId === id ? { ...a, className: cls } : a));
    setAssignments(next);
    onChange?.(next);
  };

  const classBadgeColor = (cls: string) => {
    const idx = classNames.indexOf(cls) % 5;
    return ['blue', 'green', 'orange', 'violet', 'red'][idx] ?? 'gray';
  };

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">Car Class Assignments</Text>
      {participants.map((p) => {
        const assignment = assignments.find((a) => a.participantId === p.id);
        return (
          <Card key={p.id} withBorder padding="sm" radius="md">
            <Group gap="sm" justify="space-between">
              <Group gap="sm">
                <Avatar src={p.avatar_url ?? undefined} size="sm" radius="xl">
                  {p.username[0]?.toUpperCase()}
                </Avatar>
                <Text size="sm" fw={500}>{p.username}</Text>
              </Group>
              <Group gap="xs">
                {assignment && (
                  <Badge color={classBadgeColor(assignment.className)} variant="light" size="sm">
                    {assignment.className}
                  </Badge>
                )}
                <Select
                  size="xs"
                  w={100}
                  data={classNames.map((c) => ({ value: c, label: c }))}
                  value={assignment?.className ?? classNames[0]}
                  onChange={(v) => v && updateClass(p.id, v)}
                />
              </Group>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}
