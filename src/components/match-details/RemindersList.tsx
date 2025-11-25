'use client'

import { Stack, Text, Loader, Group } from '@mantine/core';
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
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
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
    <Stack gap="xs">
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
