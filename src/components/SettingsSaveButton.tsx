'use client';

import { Button, Group } from '@mantine/core';

interface SettingsSaveButtonProps {
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  type?: 'submit' | 'button';
  onClick?: () => void;
  mt?: string;
}

export function SettingsSaveButton({
  loading = false,
  disabled = false,
  label = 'Save Settings',
  type = 'submit',
  onClick,
  mt,
}: SettingsSaveButtonProps) {
  return (
    <Group justify="flex-end" mt={mt}>
      <Button type={type} onClick={onClick} loading={loading} disabled={disabled}>
        {label}
      </Button>
    </Group>
  );
}
