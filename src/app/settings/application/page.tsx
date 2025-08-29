'use client'

import { Card, Text, Stack, Button, Group, Alert, NumberInput, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';

interface ApplicationSettings {
  event_duration_minutes?: number;
  match_reminder_minutes?: number;
  player_reminder_minutes?: number;
}

export default function ApplicationSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [playerReminderValue, setPlayerReminderValue] = useState(2);
  const [playerReminderUnit, setPlayerReminderUnit] = useState('hours');

  // Helper functions for player reminder conversion
  const minutesToValueUnit = (minutes: number) => {
    if (minutes >= 1440 && minutes % 1440 === 0) {
      return { value: minutes / 1440, unit: 'days' };
    }
    if (minutes >= 60 && minutes % 60 === 0) {
      return { value: minutes / 60, unit: 'hours' };
    }
    return { value: minutes, unit: 'minutes' };
  };

  const valueUnitToMinutes = (value: number, unit: string) => {
    switch (unit) {
      case 'days': return value * 1440;
      case 'hours': return value * 60;
      case 'minutes': return value;
      default: return value;
    }
  };

  const form = useForm<ApplicationSettings>({
    initialValues: {
      event_duration_minutes: 45,
      match_reminder_minutes: 10,
      player_reminder_minutes: 120,
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const response = await fetch('/api/settings');
        
        if (response.ok) {
          const data = await response.json();
          
          // Set Application form values
          form.setValues({
            event_duration_minutes: data.discord.event_duration_minutes || 45,
            match_reminder_minutes: data.discord.match_reminder_minutes || 10,
            player_reminder_minutes: data.discord.player_reminder_minutes || 120,
          });
          
          // Set player reminder display values
          const playerReminderDisplay = minutesToValueUnit(data.discord.player_reminder_minutes || 120);
          setPlayerReminderValue(playerReminderDisplay.value);
          setPlayerReminderUnit(playerReminderDisplay.unit);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (values: ApplicationSettings) => {
    setSaving(true);
    setMessage(null);
    
    try {
      // Convert player reminder display values to minutes
      const playerReminderMinutes = valueUnitToMinutes(playerReminderValue, playerReminderUnit);
      const payload = {
        ...values,
        player_reminder_minutes: playerReminderMinutes
      };

      const response = await fetch('/api/settings/discord', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Application settings saved successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save application settings.' });
      }
    } catch (error) {
      console.error('Error saving application settings:', error);
      setMessage({ type: 'error', text: 'An error occurred while saving application settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="lg">
        <div>
          <Text size="xl" fw={700} mb="xs">Application Settings</Text>
          <Text size="sm" c="dimmed">Configure general application behavior and timing</Text>
        </div>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          {message && (
            <Alert color={message.type === 'success' ? 'green' : 'red'} mb="md">
              {message.text}
            </Alert>
          )}

          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              <NumberInput
                label="Event Duration (per round/map)"
                placeholder="45"
                description="Duration in minutes for Discord events"
                min={5}
                max={720}
                {...form.getInputProps('event_duration_minutes')}
                disabled={loading}
              />
              <NumberInput
                label="Match Reminder"
                placeholder="10"
                description="Minutes before match start to send reminder"
                min={1}
                max={1440}
                {...form.getInputProps('match_reminder_minutes')}
                disabled={loading}
              />
              <Stack gap="xs">
                <Text size="sm" fw={500}>Player Reminder</Text>
                <Text size="xs" c="dimmed">Time before match to send reminders to signed up players</Text>
                
                <Group gap="xs" align="flex-end">
                  <NumberInput
                    size="sm"
                    placeholder="2"
                    value={playerReminderValue}
                    onChange={(value) => setPlayerReminderValue(Number(value) || 1)}
                    min={1}
                    max={playerReminderUnit === 'minutes' ? 1440 : playerReminderUnit === 'hours' ? 168 : 7}
                    disabled={loading}
                    style={{ width: 80 }}
                  />
                  <Select
                    size="sm"
                    placeholder="Unit"
                    data={[
                      { value: 'minutes', label: 'Minutes' },
                      { value: 'hours', label: 'Hours' },
                      { value: 'days', label: 'Days' }
                    ]}
                    value={playerReminderUnit}
                    onChange={(selectedUnit) => {
                      if (selectedUnit) {
                        setPlayerReminderUnit(selectedUnit);
                      }
                    }}
                    disabled={loading}
                    style={{ minWidth: 100 }}
                  />
                </Group>
              </Stack>

              <Group justify="flex-end" mt="lg">
                <Button type="submit" loading={saving} disabled={loading}>
                  Save Application Settings
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>
      </Stack>
    </div>
  );
}