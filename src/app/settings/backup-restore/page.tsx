'use client'

import {
  Card,
  Text,
  Stack,
  Button,
  Group,
  PasswordInput,
  Alert,
  Modal,
  FileInput,
  Divider,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useRef } from 'react';
import { IconAlertTriangle, IconDownload, IconUpload, IconLock, IconShieldOff, IconDatabaseImport } from '@tabler/icons-react';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';

export default function BackupRestorePage() {
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const fileInputRef = useRef<HTMLButtonElement>(null);

  const handleBackup = async () => {
    setBackupLoading(true);
    const notifId = 'backup-progress';

    notificationHelper.loading({
      id: notifId,
      title: 'Creating backup…',
      message: 'Exporting database, please wait.',
    });

    try {
      const response = await fetch('/api/settings/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: backupPassword || undefined }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        notificationHelper.update(notifId, {
          type: 'error',
          title: 'Backup Failed',
          message: data.error || 'An unexpected error occurred.',
          autoClose: 6000,
        });
        return;
      }

      // Pull filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'matchexec-backup.db';

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);

      notificationHelper.update(notifId, {
        type: 'success',
        title: 'Backup Downloaded',
        message: `Saved as ${filename}`,
        autoClose: 5000,
      });
    } catch (error) {
      logger.error('Backup error:', error);
      notificationHelper.update(notifId, {
        type: 'error',
        title: 'Backup Failed',
        message: 'Could not connect to the server.',
        autoClose: 6000,
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreConfirmed = async () => {
    closeConfirm();

    if (!restoreFile) return;

    setRestoreLoading(true);
    const notifId = 'restore-progress';

    notificationHelper.loading({
      id: notifId,
      title: 'Restoring backup…',
      message: 'Replacing database, please wait.',
    });

    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      if (restorePassword) formData.append('password', restorePassword);

      const response = await fetch('/api/settings/restore', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json() as { error?: string };

      if (!response.ok) {
        notificationHelper.update(notifId, {
          type: 'error',
          title: 'Restore Failed',
          message: data.error || 'An unexpected error occurred.',
          autoClose: 8000,
        });
        return;
      }

      notificationHelper.update(notifId, {
        type: 'success',
        title: 'Restore Complete',
        message: 'Database restored. Bot and scheduler have been restarted.',
        autoClose: 6000,
      });

      // Clear form
      setRestoreFile(null);
      setRestorePassword('');
    } catch (error) {
      logger.error('Restore error:', error);
      notificationHelper.update(notifId, {
        type: 'error',
        title: 'Restore Failed',
        message: 'Could not connect to the server.',
        autoClose: 6000,
      });
    } finally {
      setRestoreLoading(false);
    }
  };

  const isEncryptedFile = restoreFile?.name.endsWith('.enc') ?? false;

  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="lg">
        <Group>
          <IconDatabaseImport size="2rem" />
          <div>
            <Text size="xl" fw={700}>Backup & Restore</Text>
            <Text size="sm" c="dimmed">
              Export or import the entire database. All matches, tournaments, settings, and configuration are included.
            </Text>
          </div>
        </Group>

        {/* Backup */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <div>
              <Text size="lg" fw={600} mb={4}>Create Backup</Text>
              <Text size="sm" c="dimmed">
                Downloads a snapshot of the database. The bot and scheduler continue running during backup.
              </Text>
            </div>

            <Divider />

            <PasswordInput
              label="Encryption Password"
              description="Optional. Leave blank to download an unencrypted .db file."
              placeholder="Leave blank for no encryption"
              value={backupPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBackupPassword(e.currentTarget.value)}
              leftSection={<IconLock size="1rem" />}
            />

            {!backupPassword && (
              <Alert
                icon={<IconShieldOff size="1rem" />}
                color="yellow"
                variant="light"
              >
                Without a password, the backup contains all data in plaintext — including bot tokens and API keys. Store it somewhere private.
              </Alert>
            )}

            <Group justify="flex-end">
              <Button
                leftSection={<IconDownload size="1rem" />}
                onClick={handleBackup}
                loading={backupLoading}
              >
                Download Backup
              </Button>
            </Group>
          </Stack>
        </Card>

        {/* Restore */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <div>
              <Text size="lg" fw={600} mb={4}>Restore Backup</Text>
              <Text size="sm" c="dimmed">
                Upload a backup file to replace the current database. The bot and scheduler will restart automatically.
              </Text>
            </div>

            <Divider />

            <Alert
              icon={<IconAlertTriangle size="1rem" />}
              color="red"
              variant="light"
            >
              <Text size="sm" fw={600}>This will overwrite all current data.</Text>
              <Text size="sm">
                All matches, tournaments, participants, and settings will be replaced with the contents of the backup file.
                This cannot be undone.
              </Text>
            </Alert>

            <FileInput
              ref={fileInputRef}
              label="Backup File"
              description="Select a .db or .db.enc file exported from MatchExec"
              placeholder="Click to select backup file"
              accept=".db,.enc"
              value={restoreFile}
              onChange={setRestoreFile}
              leftSection={<IconUpload size="1rem" />}
              clearable
            />

            {isEncryptedFile && (
              <PasswordInput
                label="Decryption Password"
                description="Required — this file is encrypted"
                placeholder="Enter the backup password"
                value={restorePassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRestorePassword(e.currentTarget.value)}
                leftSection={<IconLock size="1rem" />}
                required
              />
            )}

            {restoreFile && !isEncryptedFile && (
              <PasswordInput
                label="Decryption Password"
                description="Only needed if this backup was encrypted"
                placeholder="Leave blank if not encrypted"
                value={restorePassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRestorePassword(e.currentTarget.value)}
                leftSection={<IconLock size="1rem" />}
              />
            )}

            <Group justify="flex-end">
              <Button
                color="red"
                leftSection={<IconUpload size="1rem" />}
                onClick={openConfirm}
                disabled={!restoreFile || (isEncryptedFile && !restorePassword)}
                loading={restoreLoading}
              >
                Restore Backup
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>

      {/* Confirmation modal */}
      <Modal
        opened={confirmOpened}
        onClose={closeConfirm}
        title="Confirm Restore"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to restore from <strong>{restoreFile?.name}</strong>?
          </Text>
          <Text size="sm" c="red">
            All current data will be permanently replaced. The bot and scheduler will restart.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeConfirm}>Cancel</Button>
            <Button color="red" onClick={handleRestoreConfirmed}>Yes, Restore</Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
