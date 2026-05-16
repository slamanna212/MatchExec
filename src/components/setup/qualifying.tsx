'use client'

import { useState, type JSX } from 'react';
import { Stack, Text, NumberInput, Table, Avatar, Group } from '@mantine/core';
import { IconStopwatch } from '@tabler/icons-react';

interface Participant {
  id: string;
  username: string;
  avatar_url?: string | null;
}

interface QualifyingTime {
  participantId: string;
  lapTimeMs: number | null;
}

interface QualifyingProps {
  participants: Participant[];
  onChange?: (times: QualifyingTime[]) => void;
}

/**
 * Racing setup: record qualifying lap times to determine grid order.
 * Times are entered in milliseconds; display as mm:ss.mmm.
 */
export function Qualifying({ participants, onChange }: QualifyingProps): JSX.Element {
  const [times, setTimes] = useState<QualifyingTime[]>(
    participants.map((p) => ({ participantId: p.id, lapTimeMs: null }))
  );

  const updateTime = (id: string, ms: number | null) => {
    const next = times.map((t) => (t.participantId === id ? { ...t, lapTimeMs: ms } : t));
    setTimes(next);
    onChange?.(next);
  };

  return (
    <Stack gap="sm">
      <Group gap="xs" mb="xs">
        <IconStopwatch size={18} />
        <Text fw={600}>Qualifying Lap Times</Text>
      </Group>
      <Text size="xs" c="dimmed">Enter each driver&apos;s best qualifying lap time in seconds (e.g. 92.345 for 1:32.345).</Text>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Driver</Table.Th>
            <Table.Th>Best Lap (s)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {participants.map((p) => {
            const entry = times.find((t) => t.participantId === p.id);
            return (
              <Table.Tr key={p.id}>
                <Table.Td>
                  <Group gap="sm">
                    <Avatar src={p.avatar_url ?? undefined} size="xs" radius="xl">
                      {p.username[0]?.toUpperCase()}
                    </Avatar>
                    <Text size="sm">{p.username}</Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    size="xs"
                    placeholder="e.g. 92.345"
                    value={entry?.lapTimeMs != null ? entry.lapTimeMs / 1000 : ''}
                    onChange={(v) => updateTime(p.id, v !== '' ? Math.round(Number(v) * 1000) : null)}
                    decimalScale={3}
                    step={0.001}
                    min={0}
                    w={120}
                  />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
