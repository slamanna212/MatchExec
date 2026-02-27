'use client'

import { Card, Group, Badge, Text, Stack } from '@mantine/core';
import { getReminderStatusColor, formatReminderStatus } from './helpers';

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: '2-digit', hour12: true
};

function formatReminderTs(
  parseDbTimestamp: (ts: string | null | undefined) => Date | null,
  ts: string | null | undefined
): string {
  const date = parseDbTimestamp(ts);
  if (!date) return 'N/A';
  return date.toLocaleString('en-US', DATE_FORMAT);
}

interface ReminderTimeSectionProps {
  reminder: ReminderData;
  parseDbTimestamp: (ts: string | null | undefined) => Date | null;
  showDescription: boolean;
}

function ReminderTimeSection({ reminder, parseDbTimestamp, showDescription }: ReminderTimeSectionProps) {
  const isTimedAnnouncement = reminder.type === 'timed_announcement';
  const timeLabel = showDescription && isTimedAnnouncement ? 'Announcement Time' : 'Reminder Time';
  const showReminderTime = reminder.reminder_time && reminder.reminder_time !== 'N/A';
  const sentTimestamp = reminder.sent_at || reminder.processed_at || '';

  return (
    <>
      {showReminderTime && (
        <Text size="xs" c="dimmed">
          {timeLabel}:{' '}
          {formatReminderTs(parseDbTimestamp, reminder.reminder_time)}
        </Text>
      )}
      {(reminder.sent_at || reminder.processed_at) && (
        <Text size="xs" c="dimmed">
          Sent:{' '}
          {formatReminderTs(parseDbTimestamp, sentTimestamp)}
        </Text>
      )}
    </>
  );
}

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

interface ReminderCardProps {
  reminder: ReminderData;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
  showDescription: boolean;
}

export function ReminderCard({ reminder, parseDbTimestamp, showDescription }: ReminderCardProps) {
  const isTimedAnnouncement = reminder.type === 'timed_announcement';
  const showAnnouncementDescription = showDescription && isTimedAnnouncement && Boolean(reminder.description);
  const textTransform = showDescription ? ('none' as const) : undefined;

  return (
    <Card key={reminder.id} shadow="sm" padding="sm" radius="md" withBorder w="100%" maw={500}>
      <Group justify="space-between" align="flex-start">
        <Stack gap="xs" style={{ flex: 1 }}>
          <Group gap="xs">
            <Badge
              size="xs"
              variant="light"
              color={getReminderStatusColor(reminder.status)}
              style={{ textTransform }}
            >
              {formatReminderStatus(reminder.status)}
            </Badge>
          </Group>

          {showAnnouncementDescription && (
            <Text size="sm" fw={500}>
              {reminder.description}
            </Text>
          )}

          <ReminderTimeSection
            reminder={reminder}
            parseDbTimestamp={parseDbTimestamp}
            showDescription={showDescription}
          />

          {reminder.error_message && (
            <Text size="xs" c="red">
              Error: {reminder.error_message}
            </Text>
          )}
        </Stack>
      </Group>
    </Card>
  );
}
