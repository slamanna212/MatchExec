'use client'

import { useState } from 'react';
import { Modal, Stack, Group, Text, Button } from '@mantine/core';
import { IconTrophy } from '@tabler/icons-react';
import { 
  MatchFormat, 
  MatchResult
} from '@/shared/types';
import { FormatBadge } from './shared/FormatBadge';
import { SimpleMapScoring } from './SimpleMapScoring';

interface ScoringModalProps {
  opened: boolean;
  onClose: () => void;
  matchId: string;
  gameId: string; // This is the game type (e.g., "overwatch2", "valorant")
  matchFormat: MatchFormat;
  onResultSubmit: (result: MatchResult) => Promise<void>;
}

export function ScoringModal({
  opened,
  onClose,
  matchId,
  gameId,
  matchFormat,
  onResultSubmit
}: ScoringModalProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleResultSubmit = async (result: MatchResult) => {
    setSubmitting(true);
    try {
      await onResultSubmit(result);
    } catch (err) {
      console.error('Failed to submit result:', err);
      // Don't close the modal on error - let the user try again
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <IconTrophy size={20} />
          <Text fw={600}>Match Scoring</Text>
          <FormatBadge format={matchFormat} />
        </Group>
      }
      size="xl"
      centered
    >
      <Stack gap="md">
        <SimpleMapScoring
          matchId={matchId}
          gameType={gameId}
          onResultSubmit={handleResultSubmit}
          submitting={submitting}
          onAllMapsCompleted={onClose}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}