import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Avatar, Button, FileButton, Group } from '@mantine/core';
import { IconTrash, IconUpload } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';

interface TeamMarkProps {
  logoUrl?: string | null;
  /** Any CSS colour; used for the dot and as the logo's frame. */
  color: string;
  /** Logo edge length in px (the dot stays 10px). */
  size?: number;
}

/** A team's logo (rounded square) when it has one, the coloured dot otherwise. */
export function TeamMark({ logoUrl, color, size = 24 }: TeamMarkProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);

  if (!logoUrl || failed) {
    return <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, backgroundColor: color }} />;
  }
  return (
    <img
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{
        width: size, height: size, borderRadius: Math.round(size / 4), flexShrink: 0, objectFit: 'contain',
      }}
    />
  );
}

/** Uploads an image through the shared event-image endpoint and returns its `/uploads/...` URL. */
export async function uploadTeamLogoFile(file: File): Promise<string> {
  const body = new FormData();
  body.append('image', file);
  const res = await fetch('/api/upload/event-image', { method: 'POST', body });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || !result.imageUrl) throw new Error(result.error || 'Failed to upload logo');
  return result.imageUrl as string;
}

interface TeamLogoControlProps {
  logoUrl: string | null | undefined;
  /** Called with the new URL (or null when removed); should persist it and may throw. */
  onChange: (logoUrl: string | null) => Promise<void>;
  onError?: (message: string) => void;
  size?: 'xs' | 'sm';
}

/** Avatar + Upload / Remove buttons for a team's own logo. */
export function TeamLogoControl({ logoUrl, onChange, onError, size = 'xs' }: TeamLogoControlProps): JSX.Element {
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    try {
      await onChange(await fn());
    } catch (err) {
      logger.error('Error updating team logo:', err);
      onError?.(err instanceof Error ? err.message : 'Failed to update logo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group gap="xs" wrap="nowrap">
      <Avatar src={logoUrl || null} size="md" radius="md" />
      <FileButton onChange={(f) => f && run(() => uploadTeamLogoFile(f))} accept="image/png,image/jpeg,image/webp,image/gif">
        {(props) => (
          <Button {...props} variant="light" size={size} leftSection={<IconUpload size={14} />} loading={busy}>
            {logoUrl ? 'Replace logo' : 'Upload logo'}
          </Button>
        )}
      </FileButton>
      {logoUrl && (
        <Button variant="subtle" color="red" size={size} leftSection={<IconTrash size={14} />} disabled={busy} onClick={() => run(async () => null)}>
          Remove
        </Button>
      )}
    </Group>
  );
}
