'use client'

import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import { Text, Badge, Alert, Loader, Group, Stack, Button, Modal, Tooltip, Divider } from '@mantine/core';
import { IconMap, IconCheck, IconTrophy } from '@tabler/icons-react';
import { ScorecardUpload } from './ScorecardUpload';
import type { MatchResult } from '@/shared/types';
import { logger } from '@/lib/logger/client';
import { getMapImageUrl, formatMapName } from '@/lib/utils/map-utils';
import { useMatchGamesData, type MatchGame, type MatchParticipant } from './hooks/useMatchGamesData';
import styles from './MapScoring.module.css';

interface FfaMapScoringProps {
  matchId: string;
  gameType: string;
  onResultSubmit: (result: MatchResult) => Promise<void>;
  submitting: boolean;
  onAllMapsCompleted?: () => void;
  matchStatsEnabled?: boolean;
  initialGameId?: string;
}

function LoadingState() {
  return (
    <Group justify="center" p="xl">
      <Loader size="md" />
      <Text>Loading match maps...</Text>
    </Group>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <Alert color="red" icon={<IconMap size={16} />}>
      {error}
    </Alert>
  );
}

function EmptyState() {
  return (
    <Alert color="yellow" icon={<IconMap size={16} />}>
      No maps found for this match. Please check the match configuration.
    </Alert>
  );
}

function MapDetailPanel({
  selectedGame,
  gameType,
  participants,
  onParticipantWin,
  submitting,
  pendingParticipantId,
  matchStatsEnabled,
  hasStatDefs,
  scorecardUploaded,
  onScorecardUploaded,
  matchId,
  onConfirm
}: {
  selectedGame: MatchGame;
  gameType: string;
  participants: MatchParticipant[];
  onParticipantWin: (id: string) => void;
  submitting: boolean;
  pendingParticipantId: string | null;
  matchStatsEnabled: boolean;
  hasStatDefs: boolean;
  scorecardUploaded: boolean;
  onScorecardUploaded: () => void;
  matchId: string;
  onConfirm: () => void;
}) {
  const imageUrl = selectedGame.image_url || getMapImageUrl(gameType, selectedGame.map_id);
  const mapName = formatMapName(selectedGame.map_id, selectedGame.map_name);
  const isCompleted = selectedGame.status === 'completed';
  const requiresScorecard = matchStatsEnabled && hasStatDefs;
  const confirmBlocked = requiresScorecard && !scorecardUploaded;
  const pendingName = participants.find(p => p.id === pendingParticipantId)?.username ?? 'Selected player';

  return (
    <div className={styles.detailPanel}>
      <div className={styles.mapHero} style={{ backgroundImage: `url('${imageUrl}')` }}>
        <div className={styles.mapHeroOverlay}>
          <div className={styles.mapHeroRound}>Map {selectedGame.round}</div>
          <div className={styles.mapHeroTitle}>{mapName}</div>
        </div>
      </div>

      {isCompleted ? (
        <Alert color="green" icon={<IconCheck size={16} />} radius="md">
          <Text fw={600}>Map complete</Text>
          {selectedGame.participant_winner_id && (
            <Text size="sm">
              Winner: {participants.find(p => p.id === selectedGame.participant_winner_id)?.username || 'Unknown'}
            </Text>
          )}
        </Alert>
      ) : (
        <Stack gap="md">
          <Group gap="xs">
            <Text size="sm" c="dimmed" fw={500}>Who won this map?</Text>
            <Badge size="sm" color={selectedGame.status === 'ongoing' ? 'blue' : 'gray'} ml="auto">
              {selectedGame.status}
            </Badge>
          </Group>

          <div className={styles.ffaGrid}>
            {participants.map(p => (
              <button
                key={p.id}
                className={styles.ffaCard}
                onClick={() => onParticipantWin(p.id)}
                disabled={submitting}
                type="button"
                style={pendingParticipantId === p.id ? {
                  outline: '3px solid var(--mantine-color-violet-4)',
                  outlineOffset: '2px',
                  filter: 'brightness(1.15)',
                } : {}}
              >
                <IconTrophy size={18} color="var(--mantine-color-violet-5)" />
                <span className={styles.ffaCardName}>{p.username} Wins</span>
              </button>
            ))}
          </div>

          {requiresScorecard && selectedGame.status === 'ongoing' && !scorecardUploaded && (
            <>
              <Divider label="Scorecard" labelPosition="center" />
              <ScorecardUpload
                matchId={matchId}
                matchGameId={selectedGame.id}
                onUploadComplete={() => {}}
                onUploadSuccess={onScorecardUploaded}
              />
            </>
          )}

          {requiresScorecard && scorecardUploaded && (
            <Alert color="green" icon={<IconCheck size={16} />} variant="light">
              Scorecard uploaded — ready to confirm
            </Alert>
          )}

          {pendingParticipantId && (
            <Tooltip
              label="Upload a scorecard before confirming"
              disabled={!confirmBlocked}
              position="top"
              withArrow
            >
              <div>
                <Button
                  fullWidth
                  color="green"
                  leftSection={<IconCheck size={16} />}
                  disabled={confirmBlocked || submitting}
                  loading={submitting}
                  onClick={onConfirm}
                >
                  Confirm: {pendingName} wins Map {selectedGame.round}
                </Button>
              </div>
            </Tooltip>
          )}
        </Stack>
      )}
    </div>
  );
}

/**
 * Scoring component for FFA (free-for-all) matches — each map declares one
 * winning participant.
 */
export function FfaMapScoring({
  matchId,
  gameType,
  onResultSubmit,
  submitting,
  onAllMapsCompleted,
  matchStatsEnabled = false,
  initialGameId,
}: FfaMapScoringProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [hasStatDefs, setHasStatDefs] = useState(false);

  const [pendingParticipantId, setPendingParticipantId] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [scorecardUploaded, setScorecardUploaded] = useState(false);

  useEffect(() => {
    fetch(`/api/games/${encodeURIComponent(gameType)}/stats`)
      .then(r => r.json())
      .catch(() => [])
      .then((defs: unknown[]) => {
        setHasStatDefs(Array.isArray(defs) && defs.length > 0);
      });
  }, [gameType]);

  const { matchGames, participants, loading, error: fetchError, refetch } = useMatchGamesData(matchId);

  const selectedGame = initialGameId
    ? matchGames.find(g => g.id === initialGameId)
    : matchGames.find(g => g.status === 'ongoing') || matchGames[0];

  const handleWinnerSubmit = async (participantId: string) => {
    if (!selectedGame) return;
    try {
      const result: MatchResult = {
        matchId,
        gameId: selectedGame.id,
        winner: 'team1',
        participantWinnerId: participantId,
        isFfaMode: true,
        completedAt: new Date()
      };
      await onResultSubmit(result);
      await refetch();
      if (onAllMapsCompleted) onAllMapsCompleted();
    } catch (err) {
      logger.error('Error submitting winner:', err);
      setError(err instanceof Error ? err.message : 'Failed to save result');
    }
  };

  const handleConfirmResult = async () => {
    if (pendingParticipantId) {
      await handleWinnerSubmit(pendingParticipantId);
    }
    setPendingParticipantId(null);
    setScorecardUploaded(false);
    setConfirmModalOpen(false);
  };

  const handleParticipantWin = (id: string) => {
    if (!selectedGame || selectedGame.status === 'completed' || submitting) return;
    setPendingParticipantId(id);
  };

  if (loading) return <LoadingState />;
  if (fetchError || error) return <ErrorState error={fetchError || error || ''} />;
  if (matchGames.length === 0) return <EmptyState />;

  const pendingName = participants.find(p => p.id === pendingParticipantId)?.username ?? 'Selected player';

  return (
    <div className={styles.container}>
      {selectedGame ? (
        <MapDetailPanel
          selectedGame={selectedGame}
          gameType={gameType}
          participants={participants}
          onParticipantWin={handleParticipantWin}
          submitting={submitting}
          pendingParticipantId={pendingParticipantId}
          matchStatsEnabled={matchStatsEnabled}
          hasStatDefs={hasStatDefs}
          scorecardUploaded={scorecardUploaded}
          onScorecardUploaded={() => setScorecardUploaded(true)}
          matchId={matchId}
          onConfirm={() => setConfirmModalOpen(true)}
        />
      ) : (
        <Alert color="blue" icon={<IconMap size={16} />}>
          Map not found.
        </Alert>
      )}

      <Modal
        opened={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Confirm Map Result"
        size="sm"
        centered
      >
        <Stack gap="lg">
          <Text>
            Confirm <Text span fw={700}>{pendingName}</Text> wins{' '}
            <Text span fw={700}>Map {selectedGame?.round}</Text>? This cannot be undone.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="outline" onClick={() => setConfirmModalOpen(false)}>
              Cancel
            </Button>
            <Button
              color="green"
              leftSection={<IconCheck size={16} />}
              loading={submitting}
              onClick={handleConfirmResult}
            >
              Confirm Result
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
