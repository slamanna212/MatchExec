'use client';

import { useCallback } from 'react';
import { Card, Group, Text, Select, NumberInput, Stack, Button, Alert } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';

interface SchedulerConfigProps {
  value: SchedulerSettings;
  onChange: (settings: SchedulerSettings) => void;
  onSubmit: (settings: SchedulerSettings) => void;
  loading?: boolean;
  saving?: boolean;
  message?: { type: 'success' | 'error'; text: string } | null;
}

interface SchedulerSettings {
  match_check_cron: string;
  cleanup_check_cron: string;
  channel_refresh_cron: string;
}

interface HumanReadableSchedule {
  interval: string;
  frequency: number;
  timeOfDay?: string;
  dayOfWeek?: string;
}

// Convert cron expression to human-readable format
function cronToHuman(cronExpression: string): HumanReadableSchedule {
  const parts = parseCronParts(cronExpression);
  if (!parts) {
    return { interval: 'custom', frequency: 1 };
  }

  return (
    matchMinutesPattern(parts) ||
    matchHoursPattern(parts) ||
    matchDailyPattern(parts) ||
    matchWeeklyPattern(parts) ||
    { interval: 'custom', frequency: 1 }
  );
}

function parseCronParts(cronExpression: string) {
  const parts = cronExpression.split(' ');
  if (parts.length !== 6) {
    return null;
  }

  const [, minute, hour, day, month, dayOfWeek] = parts;
  return { minute, hour, day, month, dayOfWeek };
}

function matchMinutesPattern(parts: {
  minute: string;
  hour: string;
  day: string;
  month: string;
  dayOfWeek: string;
}): HumanReadableSchedule | null {
  const { minute, hour, day, month, dayOfWeek } = parts;

  if (minute.includes('*/') && hour === '*' && day === '*' && month === '*' && dayOfWeek === '*') {
    const freq = parseInt(minute.split('*/')[1]);
    return { interval: 'minutes', frequency: freq };
  }

  return null;
}

function matchHoursPattern(parts: {
  minute: string;
  hour: string;
  day: string;
  month: string;
  dayOfWeek: string;
}): HumanReadableSchedule | null {
  const { hour, day, month, dayOfWeek } = parts;

  if (hour.includes('*/') && day === '*' && month === '*' && dayOfWeek === '*') {
    const freq = parseInt(hour.split('*/')[1]);
    return { interval: 'hours', frequency: freq };
  }

  return null;
}

function matchDailyPattern(parts: {
  minute: string;
  hour: string;
  day: string;
  month: string;
  dayOfWeek: string;
}): HumanReadableSchedule | null {
  const { minute, hour, day, month, dayOfWeek } = parts;

  if (!hour.includes('*') && !minute.includes('*') && day === '*' && month === '*' && dayOfWeek === '*') {
    return {
      interval: 'daily',
      frequency: 1,
      timeOfDay: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    };
  }

  return null;
}

function matchWeeklyPattern(parts: {
  minute: string;
  hour: string;
  day: string;
  month: string;
  dayOfWeek: string;
}): HumanReadableSchedule | null {
  const { minute, hour, day, month, dayOfWeek } = parts;

  if (!dayOfWeek.includes('*') && day === '*' && month === '*') {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeOfDay = !hour.includes('*') && !minute.includes('*')
      ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
      : '00:00';

    return {
      interval: 'weekly',
      frequency: 1,
      dayOfWeek: dayNames[parseInt(dayOfWeek)] || 'Sunday',
      timeOfDay
    };
  }

  return null;
}

// Convert human-readable format to cron expression
function humanToCron(schedule: HumanReadableSchedule): string {
  const { interval, frequency, timeOfDay, dayOfWeek } = schedule;

  switch (interval) {
    case 'minutes':
      return `0 */${frequency} * * * *`;
    case 'hours':
      return `0 0 */${frequency} * * *`;
    case 'daily':
      if (timeOfDay) {
        const [hour, minute] = timeOfDay.split(':');
        return `0 ${minute} ${hour} * * *`;
      }
      return '0 0 0 * * *';
    case 'weekly':
      const dayMap: { [key: string]: number } = {
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
        'Thursday': 4, 'Friday': 5, 'Saturday': 6
      };
      const dayNum = dayMap[dayOfWeek || 'Sunday'];
      if (timeOfDay) {
        const [hour, minute] = timeOfDay.split(':');
        return `0 ${minute} ${hour} * * ${dayNum}`;
      }
      return `0 0 0 * * ${dayNum}`;
    default:
      return '0 0 0 * * *';
  }
}

interface ScheduleItemProps {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function ScheduleItem({ label, description, value, onChange, disabled }: ScheduleItemProps) {
  // Parse current value
  const currentSchedule = cronToHuman(value);

  const handleScheduleChange = useCallback((newSchedule: HumanReadableSchedule) => {
    const cronExpression = humanToCron(newSchedule);
    onChange(cronExpression);
  }, [onChange]);



  const intervalOptions = [
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours', label: 'Hours' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
  ];

  const dayOptions = [
    { value: 'Sunday', label: 'Sunday' },
    { value: 'Monday', label: 'Monday' },
    { value: 'Tuesday', label: 'Tuesday' },
    { value: 'Wednesday', label: 'Wednesday' },
    { value: 'Thursday', label: 'Thursday' },
    { value: 'Friday', label: 'Friday' },
    { value: 'Saturday', label: 'Saturday' },
  ];

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>{label}</Text>
      <Text size="xs" c="dimmed">{description}</Text>
      
      <Group gap="xs" align="flex-end">
        {(currentSchedule.interval === 'minutes' || currentSchedule.interval === 'hours') && (
          <NumberInput
            size="sm"
            placeholder="Every"
            value={currentSchedule.frequency}
            onChange={(value) => {
              handleScheduleChange({
                ...currentSchedule,
                frequency: Number(value) || 1
              });
            }}
            min={1}
            max={currentSchedule.interval === 'minutes' ? 60 : 24}
            disabled={disabled}
            style={{ width: 80 }}
          />
        )}

        <Select
          size="sm"
          placeholder="Interval"
          data={intervalOptions}
          value={currentSchedule.interval === 'custom' ? 'daily' : currentSchedule.interval}
          onChange={(selectedInterval) => {
            if (selectedInterval) {
              handleScheduleChange({
                ...currentSchedule,
                interval: selectedInterval,
                frequency: currentSchedule.frequency || 1
              });
            }
          }}
          disabled={disabled}
          style={{ minWidth: 100 }}
        />

        {currentSchedule.interval === 'weekly' && (
          <Select
            size="sm"
            placeholder="Day"
            data={dayOptions}
            value={currentSchedule.dayOfWeek}
            onChange={(selectedDay) => {
              handleScheduleChange({
                ...currentSchedule,
                dayOfWeek: selectedDay || 'Sunday'
              });
            }}
            disabled={disabled}
            style={{ minWidth: 120 }}
          />
        )}

        {(currentSchedule.interval === 'daily' || currentSchedule.interval === 'weekly') && (
          <Group gap="xs" align="center">
            <Text size="xs">at</Text>
            <input
              type="time"
              value={currentSchedule.timeOfDay || '00:00'}
              onChange={(e) => {
                handleScheduleChange({
                  ...currentSchedule,
                  timeOfDay: e.target.value
                });
              }}
              disabled={disabled}
              style={{ 
                padding: '4px 8px', 
                border: '1px solid #ced4da', 
                borderRadius: '4px',
                fontSize: '12px'
              }}
            />
          </Group>
        )}
      </Group>

    </Stack>
  );
}

export default function SchedulerConfig({ 
  value, 
  onChange, 
  onSubmit, 
  loading = false, 
  saving = false, 
  message 
}: SchedulerConfigProps) {

  const handleFieldChange = useCallback((field: keyof SchedulerSettings, newValue: string) => {
    const updated = { ...value, [field]: newValue };
    onChange(updated);
  }, [value, onChange]);

  const handleSubmit = useCallback(() => {
    onSubmit(value);
  }, [value, onSubmit]);

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group mb="md">
        <IconClock size="1.2rem" />
        <Text size="lg" fw={600}>Scheduler Settings</Text>
      </Group>

      {message && (
        <Alert color={message.type === 'success' ? 'green' : 'red'} mb="md">
          {message.text}
        </Alert>
      )}

      <Stack gap="lg">
        <ScheduleItem
          label="Match Check"
          description="How often to check for match start times and send notifications"
          value={value.match_check_cron}
          onChange={(newValue) => handleFieldChange('match_check_cron', newValue)}
          disabled={loading}
        />

        <ScheduleItem
          label="Data Cleanup"
          description="When to clean up old match data"
          value={value.cleanup_check_cron}
          onChange={(newValue) => handleFieldChange('cleanup_check_cron', newValue)}
          disabled={loading}
        />

        <ScheduleItem
          label="Channel Name Refresh"
          description="How often to refresh Discord channel names with current match info"
          value={value.channel_refresh_cron}
          onChange={(newValue) => handleFieldChange('channel_refresh_cron', newValue)}
          disabled={loading}
        />

        <Group justify="flex-end" mt="lg">
          <Button 
            onClick={handleSubmit}
            loading={saving}
            disabled={loading}
          >
            Save Scheduler Settings
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}