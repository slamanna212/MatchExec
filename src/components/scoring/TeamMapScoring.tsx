'use client'

import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import { useHotkeys } from '@mantine/hooks';
import { Text, Badge, Alert, Loader, Group, Stack, Button, Modal, Tooltip, Divider } from '@mantine/core';
import { IconMap, IconCheck, IconSwords, IconTrophy } from '@tabler/icons-react';
import { ScorecardUpload } from './ScorecardUpload';
import type { MatchResult } from '@/shared/types';
import { logger } from '@/lib/logger/client';
import { getMapImageUrl, formatMapName } from '@/lib/utils/map-utils';
import { useMatchGamesData, type MatchGame, type MatchTeam } from './hooks/useMatchGamesData';
import styles from './MapScoring.module.css';

interface TeamMapScoringProps {
  matchId: string;
  gameType: string;
  onResultSubmit: (result: MatchResult) => Promise<void>;
  submitting: boolean;
  onAllMapsCompleted?: () => void;
  matchStatsEnabled?: boolean;
  initialGameId?: string;
}

const TEAM_ACCENTS = ['blue', 'red', 'green', 'orange', 'grape', 'cyan', 'yellow', 'pink'];

function teamAccent(index: number): string {
  return `var(--mantine-color-${TEAM_ACCENTS[index % TEAM_ACCENTS.length]}-5)`;
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
  accentIndex,
  onClick,
  disabled,
  isPending
}: {
  teamName: string;
  accentIndex: number;
  onClick: () => void;
  disabled: boolean;
  isPending?: boolean;
}) {
  const accent = teamAccent(accentIndex);
  const pendingStyle: React.CSSProperties = isPending ? {
    outline: `3px solid ${accent}`,
    outlineOffset: '2px',
    filter: 'brightness(1.15)',
  } : {};

  return (
    <button
      className={styles.teamCard}
      onClick={onClick}
      disabled={disabled}
      type="button"
      style={{ ...pendingStyle, ['--team-accent' as string]: accent }}
    >
      <div className={styles.teamCardIcon}>
        {isPending ? <IconCheck size={18} /> : <IconTrophy size={18} />}
      </div>
      <div className={styles.teamCardName}>{teamName}</div>
      <div className={styles.teamCardLabel}>{isPending ? 'Selected — confirm below' : 'Wins this map'}</div>
    </button>
  );
}

// ── Map detail panel ───────────────────────────────────────────────────────────

function MapDetailPanel({
  selectedGame,
  gameType,
  teams,
  onTeamWin,
  submitting,
  pendingTeamId,
  matchStatsEnabled,
  hasStatDefs,
  scorecardUploaded,
  onScorecardUploaded,
  matchId,
  onConfirm
}: {
  selectedGame: MatchGame;
  gameType: string;
  teams: MatchTeam[];
  onTeamWin: (teamId: string) => void;
  submitting: boolean;
  pendingTeamId: string | null;
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
  const hasPendingSelection = pendingTeamId !== null;
  const requiresScorecard = matchStatsEnabled && hasStatDefs;
  const confirmBlocked = requiresScorecard && !scorecardUploaded;
  const winningTeam = teams.find(t => t.id === pendingTeamId);

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
        </Alert>
      ) : (
        <Stack gap="md">
          <Group gap="xs">
            <IconSwords size={16} color="var(--mantine-color-dimmed)" />
            <Text size="sm" c="dimmed" fw={500}>Who won this map?</Text>
            <Badge size="sm" color={selectedGame.status === 'ongoing' ? 'blue' : 'gray'} ml="auto">
              {selectedGame.status}
            </Badge>
          </Group>

          <div className={styles.winnerGrid}>
            {teams.map((team, idx) => (
              <TeamWinCard
                key={team.id}
                teamName={team.team_name}
                accentIndex={idx}
                onClick={() => onTeamWin(team.id)}
                disabled={submitting}
                isPending={pendingTeamId === team.id}
              />
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
                  Confirm: {winningTeam?.team_name ?? 'Selected team'} wins Map {selectedGame.round}
                </Button>
              </div>
            </Tooltip>
          )}
        </Stack>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Scoring component for Normal (team vs team) matches. N-team aware: renders
 * one win-card per match_teams row (not hardcoded to two) and submits the
 * real winnerTeamId so 3+ team matches record the correct winner.
 */
export function TeamMapScoring({
  matchId,
  gameType,
  onResultSubmit,
  submitting,
  onAllMapsCompleted,
  matchStatsEnabled = false,
  initialGameId,
}: TeamMapScoringProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [hasStatDefs, setHasStatDefs] = useState(false);

  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
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

  const { matchGames, teams, loading, error: fetchError, refetch } = useMatchGamesData(matchId);

  const selectedGame = initialGameId
    ? matchGames.find(g => g.id === initialGameId)
    : matchGames.find(g => g.status === 'ongoing') || matchGames[0];

  const handleWinnerSubmit = async (teamId: string) => {
    if (!selectedGame) return;
    try {
      const winnerOrder = teams.find(t => t.id === teamId)?.team_order ?? 0;
      const result: MatchResult = {
        matchId,
        gameId: selectedGame.id,
        winner: winnerOrder === 1 ? 'team2' : 'team1',
        winnerTeamId: teamId,
        isFfaMode: false,
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
    if (pendingTeamId) {
      await handleWinnerSubmit(pendingTeamId);
    }
    setPendingTeamId(null);
    setScorecardUploaded(false);
    setConfirmModalOpen(false);
  };

  const handleTeamWin = (teamId: string) => {
    if (!selectedGame || selectedGame.status === 'completed' || submitting) return;
    setPendingTeamId(teamId);
  };

  useHotkeys(
    teams.slice(0, 9).map((team, idx) => [
      String(idx + 1),
      () => handleTeamWin(team.id),
    ]) as [string, () => void][]
  );

  if (loading) return <LoadingState />;
  if (fetchError || error) return <ErrorState error={fetchError || error || ''} />;
  if (matchGames.length === 0) return <EmptyState />;

  const pendingTeamName = teams.find(t => t.id === pendingTeamId)?.team_name ?? 'Selected team';

  return (
    <div className={styles.container}>
      {selectedGame ? (
        <MapDetailPanel
          selectedGame={selectedGame}
          gameType={gameType}
          teams={teams}
          onTeamWin={handleTeamWin}
          submitting={submitting}
          pendingTeamId={pendingTeamId}
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
