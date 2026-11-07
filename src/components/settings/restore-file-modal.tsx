import { Alert, Button, FileInput, Group, Modal, PasswordInput, Stack } from '@mantine/core';
import { IconAlertTriangle, IconFile } from '@tabler/icons-react';
import { useState } from 'react';
import { notificationHelper } from '@/lib/notifications';
import { logger } from '@/lib/logger/client';

interface RestoreFileModalProps {
  opened: boolean;
  onClose: () => void;
  /** Called after the server reports a successful restore. */
  onRestored: () => void;
  /** Alert text; override for contexts with no existing data to replace. */
  warning?: string;
}

const DEFAULT_WARNING =
  'Replaces all matches, tournaments, participants and settings. Your current data is saved as a Pre-restore backup first, and MatchExec is unavailable for a moment.';

export function RestoreFileModal({ opened, onClose, onRestored, warning = DEFAULT_WARNING }: RestoreFileModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const isEncrypted = file?.name.endsWith('.enc') ?? false;
  const invalid = !file || (isEncrypted && !password);

  const close = () => {
    if (busy) return;
    setFile(null);
    setPassword('');
    onClose();
  };

  const submit = async () => {
    if (!file) return;

    setBusy(true);
    const notifId = 'restore-progress';
    notificationHelper.loading({ id: notifId, title: 'Restoring backup…', message: 'Replacing database, please wait.' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (password) formData.append('password', password);

      const response = await fetch('/api/settings/restore', { method: 'POST', body: formData });
      const data = await response.json().catch(() => ({})) as { error?: string };

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
        message: 'Database restored. The previous data was saved as a "Pre-restore" backup.',
        autoClose: 6000,
      });
      setFile(null);
      setPassword('');
      onRestored();
    } catch (error) {
      logger.error('Restore error:', error);
      notificationHelper.update(notifId, {
        type: 'error',
        title: 'Restore Failed',
        message: 'Could not connect to the server.',
        autoClose: 6000,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={close} title="Restore from file" centered size="sm">
      <Stack gap="md">
        <FileInput
          label="Backup file"
          description=".dump or .dump.enc from MatchExec. Older SQLite .db backups work too."
          placeholder="Choose a backup file"
          accept=".dump,.db,.enc"
          value={file}
          onChange={setFile}
          leftSection={<IconFile size="1rem" />}
          clearable
        />
        {file && (
          <PasswordInput
            label="Password"
            description={isEncrypted ? 'Required: this file is encrypted' : 'Only needed if this backup was encrypted'}
            placeholder={isEncrypted ? 'This file is encrypted' : 'Leave blank if not encrypted'}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required={isEncrypted}
          />
        )}
        <Alert icon={<IconAlertTriangle size="1rem" />} color="red" variant="light">
          {warning}
        </Alert>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={close} disabled={busy}>Cancel</Button>
          <Button color="red" onClick={() => { void submit(); }} disabled={invalid} loading={busy}>
            Replace data and restore
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
