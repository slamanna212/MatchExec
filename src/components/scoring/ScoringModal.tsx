'use client'

import { useState, useEffect } from 'react';
import { Modal, Stack, Group, Text, Button, Loader } from '@mantine/core';
import { IconTrophy } from '@tabler/icons-react';
import {
  MatchFormat,
  MatchResult
} from '@/shared/types';
import { FormatBadge } from './shared/FormatBadge';
import { SimpleMapScoring } from './SimpleMapScoring';
import { PositionScoring } from './PositionScoring';

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
  const [scoringType, setScoringType] = useState<'Normal' | 'FFA' | 'Position' | null>(null);
  const [loading, setLoading] = useState(true);

  // Detect scoring type by checking the first game's mode
  useEffect(() => {
    if (!matchId || !opened) return;

    const detectScoringType = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/matches/${matchId}/games`);
        if (!response.ok) throw new Error('Failed to fetch match games');

        const data = await response.json();
        if (data.games && data.games.length > 0) {
          // Check the first game's mode scoring type
          const firstGame = data.games[0];
          setScoringType(firstGame.mode_scoring_type || 'Normal');
        } else {
          setScoringType('Normal'); // Default to Normal
        }
      } catch (error) {
        console.error('Error detecting scoring type:', error);
        setScoringType('Normal'); // Default to Normal on error
      } finally {
        setLoading(false);
      }
    };

    detectScoringType();
  }, [matchId, opened]);

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
        {loading ? (
          <Group justify="center" p="xl">
            <Loader size="md" />
            <Text>Loading scoring interface...</Text>
          </Group>
        ) : scoringType === 'Position' ? (
          <PositionScoring
            matchId={matchId}
            gameType={gameId}
            onResultSubmit={handleResultSubmit}
            submitting={submitting}
          />
        ) : (
          <SimpleMapScoring
            matchId={matchId}
            gameType={gameId}
            onResultSubmit={handleResultSubmit}
            submitting={submitting}
            onAllMapsCompleted={onClose}
          />
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose} disabled={submitting || loading}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}