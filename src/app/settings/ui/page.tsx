'use client'

import { Card, Stack, Skeleton, NumberInput } from '@mantine/core';
import { SettingsSaveButton } from '@/components/SettingsSaveButton';
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
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="lg">
          <PageHeader
            icon={IconSettings}
            title="UI Settings"
            subtitle="Configure user interface behavior and appearance"
            breadcrumbs={[{ title: 'Settings', href: '/settings' }]}
          />

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            {loading ? (
              <Stack gap="md">
                <Stack gap={4}>
                  <Skeleton height={14} width={120} />
                  <Skeleton height={36} />
                </Stack>
              </Stack>
            ) : (
              <NumberInput
                label="Auto Refresh Interval"
                placeholder="30"
                description="How often (in seconds) the match dashboard should automatically refresh"
                min={5}
                max={300}
                {...form.getInputProps('auto_refresh_interval_seconds')}
                disabled={loading}
              />
            )}
          </Card>

          <SettingsSaveButton loading={saving} disabled={loading} />
        </Stack>
      </form>
    </PageLayout>
  );
}
