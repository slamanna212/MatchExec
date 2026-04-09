'use client'

import { Card, Stack, Group, Button, NumberInput, Skeleton } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { IconSettings } from '@tabler/icons-react';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';
import { PageLayout } from '@/components/PageLayout';
import { PageHeader } from '@/components/PageHeader';

interface UISettings {
  auto_refresh_interval_seconds: number;
}

export default function UISettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
        logger.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (values: UISettings) => {
    setSaving(true);

    try {
      const response = await fetch('/api/settings/ui', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        notificationHelper.success({
          title: 'Settings Saved',
          message: 'UI settings saved successfully!'
        });
      } else {
        const errorData = await response.json();
        notificationHelper.error({
          title: 'Save Failed',
          message: errorData.error || 'Failed to save UI settings.'
        });
      }
    } catch (error) {
      logger.error('Error saving UI settings:', error);
      notificationHelper.error({
        title: 'Connection Error',
        message: 'An error occurred while saving UI settings.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout narrow>
      <Stack gap="lg">
        <PageHeader
          icon={IconSettings}
          title="UI Settings"
          subtitle="Configure user interface behavior and appearance"
        />

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          {loading ? (
            <Stack gap="md">
              <Stack gap={4}>
                <Skeleton height={14} width={120} />
                <Skeleton height={36} />
              </Stack>
              <Group justify="flex-end"><Skeleton height={36} width={120} /></Group>
            </Stack>
          ) : (
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
          )}
        </Card>
      </Stack>
    </PageLayout>
  );
}