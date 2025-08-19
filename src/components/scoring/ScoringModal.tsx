'use client'

import { useState, useEffect } from 'react';
import { Modal, Stack, Group, Text, Loader, Alert, Button } from '@mantine/core';
import { IconAlertCircle, IconTrophy } from '@tabler/icons-react';
import { 
  MatchFormat, 
  ScoringType, 
  ScoringTiming, 
  ScoringConfig,
  MatchScore,
  ModeDataJsonWithScoring 
} from '@/shared/types';
import { FormatBadge } from './shared/FormatBadge';
import { FormatDetector } from './FormatDetector';
import { MapBasedScoring } from './MapBasedScoring';

interface ScoringModalProps {
  opened: boolean;
  onClose: () => void;
  matchId: string;
  gameId: string; // This is the game type (e.g., "overwatch2", "valorant")
  modeId: string;
  matchFormat: MatchFormat;
  onScoreSubmit: (score: MatchScore) => Promise<void>;
}

export function ScoringModal({
  opened,
  onClose,
  matchId,
  gameId,
  modeId,
  matchFormat,
  onScoreSubmit
}: ScoringModalProps) {
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

        // Create scoring configuration based on format, adjusted for match-specific data
        const configResponse = await fetch(`/api/games/${gameId}/modes/${modeId}/config?format=${matchFormat}&matchId=${matchId}`);
        if (!configResponse.ok) {
          throw new Error('Failed to load scoring configuration');
        }
        const config = await configResponse.json();
        
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
  }, [opened, gameId, modeId, matchFormat]);

  const handleScoreSubmit = async (score: MatchScore) => {
    setSubmitting(true);
    try {
      await onScoreSubmit(score);
      onClose();
    } catch (err) {
      console.error('Failed to submit score:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit score');
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
          {scoringConfig && (
            <FormatBadge format={scoringConfig.format} />
          )}
        </Group>
      }
      size="xl"
      centered
    >
      <Stack gap="md">
        {loading && (
          <Group justify="center" p="xl">
            <Loader size="md" />
            <Text>Loading scoring configuration...</Text>
          </Group>
        )}

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error}
          </Alert>
        )}

        {!loading && !error && modeData && scoringConfig && (
          <>
            <Text size="sm" c="dimmed">
              {modeData.description}
            </Text>
            
            <MapBasedScoring
              matchId={matchId}
              gameType={gameId} // Pass the actual game type for API calls
              modeData={modeData}
              scoringConfig={scoringConfig}
              onScoreSubmit={handleScoreSubmit}
              submitting={submitting}
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