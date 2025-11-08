'use client'

import { Stack, Card, Group, Badge, Text, Loader } from '@mantine/core';
import { getReminderStatusColor, formatReminderStatus } from './helpers';

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
        <Card key={reminder.id} shadow="sm" padding="sm" radius="md" withBorder>
          <Group justify="space-between" align="flex-start">
            <Stack gap="xs" style={{ flex: 1 }}>
              <Group gap="xs">
                <Badge
                  size="xs"
                  variant="light"
                  color={getReminderStatusColor(reminder.status)}
                  style={{ textTransform: showDescription ? 'none' : undefined }}
                >
                  {formatReminderStatus(reminder.status)}
                </Badge>
              </Group>

              {showDescription && reminder.type === 'timed_announcement' && reminder.description && (
                <Text size="sm" fw={500}>
                  {reminder.description}
                </Text>
              )}

              {reminder.reminder_time && reminder.reminder_time !== 'N/A' && (
                <Text size="xs" c="dimmed">
                  {showDescription && reminder.type === 'timed_announcement' ? 'Announcement Time' : 'Reminder Time'}:{' '}
                  {parseDbTimestamp(reminder.reminder_time)?.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  }) || 'N/A'}
                </Text>
              )}

              {(reminder.sent_at || reminder.processed_at) && (
                <Text size="xs" c="dimmed">
                  Sent:{' '}
                  {parseDbTimestamp(reminder.sent_at || reminder.processed_at || '')?.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  }) || 'N/A'}
                </Text>
              )}

              {reminder.error_message && (
                <Text size="xs" c="red">
                  Error: {reminder.error_message}
                </Text>
              )}
            </Stack>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
