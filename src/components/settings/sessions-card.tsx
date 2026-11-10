import { useEffect, useState, type JSX } from 'react';
import { Button, Card, Stack, Text } from '@mantine/core';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';

/** "Log out other sessions" (revokes every session cookie, keeps this browser signed in). Only shown when login is enabled. */
export function SessionsCard(): JSX.Element | null {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { enabled?: boolean } | null) => setEnabled(!!data?.enabled))
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  const logoutOthers = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/logout-all', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      notificationHelper.success({ title: 'Sessions Revoked', message: 'Every other browser and device has been logged out.' });
    } catch (error) {
      logger.error('Error revoking sessions:', error);
      notificationHelper.error({ title: 'Failed', message: 'Could not log out other sessions.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <div>
          <Text size="md" fw={600} mb="xs">Sessions</Text>
          <Text size="sm" c="dimmed">
            Log out every other browser and device signed in with the admin password. This browser stays signed in.
            Changing ADMIN_PASSWORD also logs every session out.
          </Text>
        </div>
        <div>
          <Button type="button" variant="outline" color="red" size="sm" loading={busy} onClick={logoutOthers}>
            Log out other sessions
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
