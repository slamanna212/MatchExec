'use client'

import { Group, Button } from '@mantine/core';

interface MatchActionsFooterProps<T extends { status: string }> {
  selectedMatch: T;
  showDeleteButton?: boolean;
  onDelete?: (match: T) => void;
  onClose: () => void;
  onAssign?: (match: T) => void;
}

export function MatchActionsFooter<T extends { status: string }>({
  selectedMatch,
  showDeleteButton,
  onDelete,
  onClose,
  onAssign
}: MatchActionsFooterProps<T>) {
  const showAssign = selectedMatch.status === 'gather' || selectedMatch.status === 'assign' || selectedMatch.status === 'battle';

  return (
    <Group justify="space-between" mt="md">
      <Group gap="sm">
        {showDeleteButton && (
          <Button
            color="red"
            variant="light"
            onClick={() => onDelete?.(selectedMatch)}
          >
            Delete Match
          </Button>
        )}
        {showAssign && (
          <Button
            variant="light"
            onClick={() => {
              onClose();
              onAssign?.(selectedMatch);
            }}
          >
            Assign Players
          </Button>
        )}
      </Group>
      <Button variant="outline" onClick={onClose}>
        Close
      </Button>
    </Group>
  );
}
