'use client'

import { useState, useEffect } from 'react';
import { Modal, Stack, Group, Text, Button, Alert } from '@mantine/core';
import { IconEdit, IconAlertCircle } from '@tabler/icons-react';
import { MatchScore, ModeDataJsonWithScoring, ScoringConfig } from '@/shared/types';
import { FormatBadge } from './shared/FormatBadge';
import { TimingDetector } from './TimingDetector';

interface ScoreEditModalProps {
  opened: boolean;
  onClose: () => void;
  matchId: string;
  gameId: string;
  modeId: string;
  currentScore: MatchScore;
  onScoreUpdate: (score: MatchScore) => Promise<void>;
}

export function ScoreEditModal({
  opened,
  onClose,
  matchId,
  gameId,
  modeId,
  currentScore,
  onScoreUpdate
}: ScoreEditModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modeData, setModeData] = useState<ModeDataJsonWithScoring | null>(null);
  const [scoringConfig, setScoringConfig] = useState<ScoringConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load mode data and determine scoring configuration
  useEffect(() => {
    const loadScoringConfig = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch mode data from API
        const response = await fetch(`/api/games/${gameId}/modes/${modeId}`);
        if (!response.ok) {
          throw new Error('Failed to load game mode data');
        }
        
        const mode: ModeDataJsonWithScoring = await response.json();
        setModeData(mode);

        // Create scoring configuration based on current score format
        const formatVariant = mode.formatVariants[currentScore.format];
        if (!formatVariant) {
          throw new Error(`Format "${currentScore.format}" not supported for mode "${mode.name}"`);
        }

        const config: ScoringConfig = {
          format: currentScore.format,
          scoringType: mode.scoringType,
          scoringTiming: mode.scoringTiming,
          formatVariant,
          validation: {
            // Extract validation rules from format variant
            minRounds: formatVariant.maxRounds ? 1 : undefined,
            maxRounds: formatVariant.maxRounds as number | undefined,
            targetPoints: formatVariant.maxPoints as number | undefined,
            targetEliminations: formatVariant.targetEliminations as number | undefined,
            timeLimit: formatVariant.timeLimit as number | undefined,
          }
        };
        
        setScoringConfig(config);
      } catch (err) {
        console.error('Failed to load scoring config:', err);
        setError(err instanceof Error ? err.message : 'Failed to load scoring configuration');
      } finally {
        setLoading(false);
      }
    };

    if (opened) {
      loadScoringConfig();
    }
  }, [opened, gameId, modeId, currentScore.format]);

  const handleScoreSubmit = async (score: MatchScore) => {
    setSubmitting(true);
    try {
      await onScoreUpdate(score);
      onClose();
    } catch (err) {
      console.error('Failed to update score:', err);
      setError(err instanceof Error ? err.message : 'Failed to update score');
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
          <IconEdit size={20} />
          <Text fw={600}>Edit Match Score</Text>
          {scoringConfig && (
            <FormatBadge format={scoringConfig.format} />
          )}
        </Group>
      }
      size="xl"
      centered
    >
      <Stack gap="md">
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error}
          </Alert>
        )}

        {!loading && !error && modeData && scoringConfig && (
          <>
            <Alert color="yellow" variant="light">
              <Text size="sm">
                You are editing an existing score. Changes will overwrite the current score data.
              </Text>
            </Alert>
            
            <Text size="sm" c="dimmed">
              {modeData.description}
            </Text>
            
            <TimingDetector
              matchId={matchId}
              gameId={gameId}
              modeData={modeData}
              scoringConfig={scoringConfig}
              onScoreSubmit={handleScoreSubmit}
              submitting={submitting}
              initialScore={currentScore}
            />
          </>
        )}

        {!loading && !error && (
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
          </Group>
        )}
      </Stack>
    </Modal>
  );
}