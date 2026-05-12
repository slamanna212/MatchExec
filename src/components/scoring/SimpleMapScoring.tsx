'use client'

import { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
import { useHotkeys } from '@mantine/hooks';
import { Text, Badge, Alert, Loader, Group, Stack, Button, Modal, Tooltip, Divider } from '@mantine/core';
import { IconMap, IconCheck, IconSwords, IconTrophy } from '@tabler/icons-react';
import { ScorecardUpload } from './ScorecardUpload';
import type { MatchResult } from '@/shared/types';
import { logger } from '@/lib/logger/client';
import { getMapImageUrl, formatMapName } from '@/lib/utils/map-utils';
import { useMatchGamesData, type MatchGame, type MatchParticipant } from './hooks/useMatchGamesData';
import styles from './SimpleMapScoring.module.css';

interface SimpleMapScoringProps {
  matchId: string;
  gameType: string;
  onResultSubmit: (result: MatchResult) => Promise<void>;
  submitting: boolean;
  onAllMapsCompleted?: () => void;
  matchStatsEnabled?: boolean;
  initialGameId?: string;
}

// ── Loading / error / empty states ────────────────────────────────────────────

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

// ── Team win card ──────────────────────────────────────────────────────────────

function TeamWinCard({
  teamName,
  side,
  onClick,
  disabled,
  isPending
}: {
  teamName: string;
  side: 'blue' | 'red';
  onClick: () => void;
  disabled: boolean;
  isPending?: boolean;
}) {
  const cardClass = `${styles.teamCard} ${side === 'blue' ? styles.teamCardBlue : styles.teamCardRed}`;
  const iconClass = `${styles.teamCardIcon} ${side === 'blue' ? styles.teamCardIconBlue : styles.teamCardIconRed}`;

  const pendingStyle: React.CSSProperties = isPending ? {
    outline: `3px solid ${side === 'blue' ? 'var(--mantine-color-blue-4)' : 'var(--mantine-color-red-4)'}`,
    outlineOffset: '2px',
    filter: 'brightness(1.15)',
  } : {};

  return (
    <button className={cardClass} onClick={onClick} disabled={disabled} type="button" style={pendingStyle}>
      <div className={iconClass}>
        {isPending ? <IconCheck size={18} /> : <IconTrophy size={18} />}
      </div>
      <div className={styles.teamCardName}>{teamName}</div>
      <div className={styles.teamCardLabel}>{isPending ? 'Selected — confirm below' : 'Wins this map'}</div>
    </button>
  );
}

// ── Map detail panel helpers ────────────────────────────────────────────────────

function MapCompletedAlert({
  selectedGame,
  team1Name,
  team2Name,
  participants
}: {
  selectedGame: MatchGame;
  team1Name: string | null;
  team2Name: string | null;
  participants: MatchParticipant[];
}) {
  const teamWinner = selectedGame.winner_id === 'team1' ? (team1Name || 'Blue Team') : (team2Name || 'Red Team');
  const participantWinner = participants.find(p => p.id === selectedGame.participant_winner_id)?.username || 'Unknown';

  return (
    <Alert color="green" icon={<IconCheck size={16} />} radius="md">
      <Text fw={600}>Map complete</Text>
      {selectedGame.winner_id && <Text size="sm">Winner: {teamWinner}</Text>}
      {selectedGame.participant_winner_id && <Text size="sm">Winner: {participantWinner}</Text>}
    </Alert>
  );
}

function MapWinnerSelection({
  selectedGame,
  team1Name,
  team2Name,
  participants,
  onTeamWin,
  onParticipantWin,
  submitting,
  pendingWinner,
  pendingParticipantId
}: {
  selectedGame: MatchGame;
  team1Name: string | null;
  team2Name: string | null;
  participants: MatchParticipant[];
  onTeamWin: (winner: 'team1' | 'team2') => void;
  onParticipantWin: (id: string) => void;
  submitting: boolean;
  pendingWinner: 'team1' | 'team2' | null;
  pendingParticipantId: string | null;
}) {
  const mode = selectedGame.mode_scoring_type;
  const showTeamCards = mode === 'Normal' || !mode;

  return (
    <Stack gap="md">
      <Group gap="xs">
        <IconSwords size={16} color="var(--mantine-color-dimmed)" />
        <Text size="sm" c="dimmed" fw={500}>Who won this map?</Text>
        <Badge size="sm" color={selectedGame.status === 'completed' ? 'green' : selectedGame.status === 'ongoing' ? 'blue' : 'gray'} ml="auto">
          {selectedGame.status}
        </Badge>
      </Group>
      {showTeamCards && (
        <div className={styles.winnerGrid}>
          <TeamWinCard
            teamName={team1Name || 'Blue Team'}
            side="blue"
            onClick={() => onTeamWin('team1')}
            disabled={submitting}
            isPending={pendingWinner === 'team1'}
          />
          <TeamWinCard
            teamName={team2Name || 'Red Team'}
            side="red"
            onClick={() => onTeamWin('team2')}
            disabled={submitting}
            isPending={pendingWinner === 'team2'}
          />
        </div>
      )}
      {mode === 'FFA' && (
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
      )}
    </Stack>
  );
}

// ── Map detail panel ───────────────────────────────────────────────────────────

function MapDetailPanel({
  selectedGame,
  gameType,
  participants,
  team1Name,
  team2Name,
  onTeamWin,
  onParticipantWin,
  submitting,
  pendingWinner,
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
  team1Name: string | null;
  team2Name: string | null;
  onTeamWin: (winner: 'team1' | 'team2') => void;
  onParticipantWin: (id: string) => void;
  submitting: boolean;
  pendingWinner: 'team1' | 'team2' | null;
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
  const mode = selectedGame.mode_scoring_type;
  const hasPendingSelection = pendingWinner !== null || pendingParticipantId !== null;
  const requiresScorecard = matchStatsEnabled && hasStatDefs;
  const confirmBlocked = requiresScorecard && !scorecardUploaded;

  let pendingTeamName = 'Selected player';
  if (pendingWinner === 'team1') pendingTeamName = team1Name || 'Blue Team';
  else if (pendingWinner === 'team2') pendingTeamName = team2Name || 'Red Team';
  else if (pendingParticipantId) {
    pendingTeamName = participants.find(p => p.id === pendingParticipantId)?.username ?? 'Selected player';
  }

  return (
    <div className={styles.detailPanel}>
      <div className={styles.mapHero} style={{ backgroundImage: `url('${imageUrl}')` }}>
        <div className={styles.mapHeroOverlay}>
          <div className={styles.mapHeroRound}>Map {selectedGame.round}</div>
          <div className={styles.mapHeroTitle}>{mapName}</div>
        </div>
      </div>

      {isCompleted && (
        <MapCompletedAlert
          selectedGame={selectedGame}
          team1Name={team1Name}
          team2Name={team2Name}
          participants={participants}
        />
      )}

      {!isCompleted && mode !== 'Position' && (
        <Stack gap="md">
          <MapWinnerSelection
            selectedGame={selectedGame}
            team1Name={team1Name}
            team2Name={team2Name}
            participants={participants}
            onTeamWin={onTeamWin}
            onParticipantWin={onParticipantWin}
            submitting={submitting}
            pendingWinner={pendingWinner}
            pendingParticipantId={pendingParticipantId}
          />

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

          {hasPendingSelection && (
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
                  Confirm: {pendingTeamName} wins Map {selectedGame.round}
                </Button>
              </div>
            </Tooltip>
          )}
        </Stack>
      )}

      {!isCompleted && mode === 'Position' && (
        <Alert color="blue" icon={<IconTrophy size={16} />}>
          This map uses position-based scoring — use the Position Scoring interface.
        </Alert>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SimpleMapScoring({
  matchId,
  gameType,
  onResultSubmit,
  submitting,
  onAllMapsCompleted,
  matchStatsEnabled = false,
  initialGameId,
}: SimpleMapScoringProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [hasStatDefs, setHasStatDefs] = useState(false);

  const [pendingWinner, setPendingWinner] = useState<'team1' | 'team2' | null>(null);
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

  const { matchGames, participants, team1Name, team2Name, loading, error: fetchError, refetch } = useMatchGamesData(matchId);

  const selectedGame = initialGameId
    ? matchGames.find(g => g.id === initialGameId)
    : matchGames.find(g => g.status === 'ongoing') || matchGames[0];

  const handleWinnerSubmit = async (winner: 'team1' | 'team2', participantId?: string) => {
    if (!selectedGame) return;
    try {
      const result: MatchResult = {
        matchId,
        gameId: selectedGame.id,
        winner,
        participantWinnerId: participantId,
        isFfaMode: !!participantId,
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
    if (pendingWinner) {
      await handleWinnerSubmit(pendingWinner);
    } else if (pendingParticipantId) {
      await handleWinnerSubmit('team1', pendingParticipantId);
    }
    setPendingWinner(null);
    setPendingParticipantId(null);
    setScorecardUploaded(false);
    setConfirmModalOpen(false);
  };

  const handleTeamWin = (winner: 'team1' | 'team2') => {
    if (!selectedGame || selectedGame.status === 'completed' || submitting) return;
    setPendingWinner(winner);
    setPendingParticipantId(null);
  };

  const handleParticipantWin = (id: string) => {
    if (!selectedGame || selectedGame.status === 'completed' || submitting) return;
    setPendingParticipantId(id);
    setPendingWinner(null);
  };

  const setPendingTeam1 = useCallback(() => {
    if (!selectedGame || selectedGame.status === 'completed' || submitting) return;
    const mode = selectedGame.mode_scoring_type;
    if (mode === 'Position' || mode === 'FFA') return;
    setPendingWinner('team1');
    setPendingParticipantId(null);
  }, [selectedGame, submitting]);

  const setPendingTeam2 = useCallback(() => {
    if (!selectedGame || selectedGame.status === 'completed' || submitting) return;
    const mode = selectedGame.mode_scoring_type;
    if (mode === 'Position' || mode === 'FFA') return;
    setPendingWinner('team2');
    setPendingParticipantId(null);
  }, [selectedGame, submitting]);

  useHotkeys([
    ['1', () => setPendingTeam1()],
    ['2', () => setPendingTeam2()],
  ]);

  if (loading) return <LoadingState />;
  if (fetchError || error) return <ErrorState error={fetchError || error || ''} />;
  if (matchGames.length === 0) return <EmptyState />;

  let pendingTeamName = 'Selected player';
  if (pendingWinner === 'team1') pendingTeamName = team1Name || 'Blue Team';
  else if (pendingWinner === 'team2') pendingTeamName = team2Name || 'Red Team';
  else if (pendingParticipantId) {
    pendingTeamName = participants.find(p => p.id === pendingParticipantId)?.username ?? 'Selected player';
  }

  return (
    <div className={styles.container}>
      {selectedGame ? (
        <MapDetailPanel
          selectedGame={selectedGame}
          gameType={gameType}
          participants={participants}
          team1Name={team1Name}
          team2Name={team2Name}
          onTeamWin={handleTeamWin}
          onParticipantWin={handleParticipantWin}
          submitting={submitting}
          pendingWinner={pendingWinner}
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
            Confirm <Text span fw={700}>{pendingTeamName}</Text> wins{' '}
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
