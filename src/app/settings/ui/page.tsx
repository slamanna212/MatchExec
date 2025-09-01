'use client'

import { Card, Text, Stack, Button, Group, Alert, NumberInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconSettings } from '@tabler/icons-react';

interface UISettings {
  auto_refresh_interval_seconds: number;
}

export default function UISettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const form = useForm<UISettings>({
    initialValues: {
      auto_refresh_interval_seconds: 10,
    },
  });

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const response = await fetch('/api/settings');
        
        if (response.ok) {
          const data = await response.json();
          
          // Set UI settings
          form.setValues(data.ui);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (values: UISettings) => {
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/settings/ui', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'UI settings saved successfully!' });
      } else {
        const errorData = await response.json();
        setMessage({ type: 'error', text: errorData.error || 'Failed to save UI settings.' });
      }
    } catch (error) {
      console.error('Error saving UI settings:', error);
      setMessage({ type: 'error', text: 'An error occurred while saving UI settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="lg">
        <div>
          <Group>
            <IconSettings size="1.5rem" />
            <div>
              <Text size="xl" fw={700}>UI Settings</Text>
              <Text size="sm" c="dimmed">Configure user interface behavior and appearance</Text>
            </div>
          </Group>
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
                label="Auto Refresh Interval"
                placeholder="30"
                description="How often (in seconds) the match dashboard should automatically refresh"
                min={5}
                max={300}
                {...form.getInputProps('auto_refresh_interval_seconds')}
                disabled={loading}
              />

              <Group justify="flex-end" mt="lg">
                <Button type="submit" loading={saving} disabled={loading}>
                  Save UI Settings
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>
      </Stack>
    </div>
  );
}