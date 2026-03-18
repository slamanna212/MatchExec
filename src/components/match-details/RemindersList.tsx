'use client'

import { Stack, Card, Text, Skeleton } from '@mantine/core';
import { ReminderCard } from './ReminderCard';

interface ReminderData {
  id: string;
  match_id: string;
  reminder_time: string;
  status: 'pending' | 'sent' | 'failed' | 'processed' | 'completed' | 'scheduled';
  error_message?: string;
  created_at: string;
  sent_at?: string;
  processed_at?: string;
  type: 'discord_general' | 'discord_match' | 'discord_player' | 'timed_announcement';
  description?: string;
}

interface RemindersListProps {
  reminders: ReminderData[];
  loading: boolean;
  matchStatus?: string;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
  showDescription?: boolean;
}

export function RemindersList({
  reminders,
  loading,
  matchStatus,
  parseDbTimestamp,
  showDescription = true
}: RemindersListProps) {
  if (loading) {
    return (
      <Stack gap="md" align="center" py="md">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} shadow="sm" padding="md" radius="md" withBorder style={{ width: '100%', maxWidth: 400 }}>
            <Stack gap="xs">
              <Skeleton height={16} width="50%" />
              <Skeleton height={12} width="70%" />
              <Skeleton height={20} width={60} radius="xl" />
            </Stack>
          </Card>
        ))}
      </Stack>
    );
  }

  if (reminders.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        {matchStatus === 'complete'
          ? 'No reminders were sent for this match'
          : 'No scheduled announcements for this match'}
      </Text>
    );
  }

  return (
    <Stack gap="md" align="center" py="md">
      {reminders.map((reminder) => (
        <ReminderCard
          key={reminder.id}
          reminder={reminder}
          parseDbTimestamp={parseDbTimestamp}
          showDescription={showDescription}
        />
      ))}
    </Stack>
  );
}
