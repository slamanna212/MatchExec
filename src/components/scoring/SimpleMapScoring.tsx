'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useHotkeys } from '@mantine/hooks';
import { Text, Badge, Alert, Loader, Group, Stack, Button, Modal, Tooltip, Divider } from '@mantine/core';
import { IconMap, IconCheck, IconClock, IconTrophy, IconSwords } from '@tabler/icons-react';
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

// ── Map status helpers ─────────────────────────────────────────────────────────

function statusIcon(status: string) {
  if (status === 'completed') return <IconCheck size={12} />;
  if (status === 'ongoing') return <IconClock size={12} />;
  return null;
}

function statusColor(status: string): string {
  if (status === 'completed') return 'green';
  if (status === 'ongoing') return 'blue';
  return 'gray';
}

// ── Sidebar map list (desktop) ─────────────────────────────────────────────────

function MapSidebar({
  matchGames,
  gameType,
  selectedGameId,
  onSelect,
  disabled
}: {
  matchGames: MatchGame[];
  gameType: string;
  selectedGameId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const completed = matchGames.filter(g => g.status === 'completed').length;

  return (
    <div className={styles.sidebarWrapper}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          Maps — {completed}/{matchGames.length} done
        </div>

        {matchGames.map(game => {
          const imageUrl = game.image_url || getMapImageUrl(gameType, game.map_id);
          const isSelected = selectedGameId === game.id;
          const itemClass = [
            styles.mapItem,
            isSelected ? styles.mapItemSelected : '',
            game.status === 'ongoing' ? styles.mapItemOngoing : '',
            game.status === 'completed' ? styles.mapItemCompleted : '',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={game.id}
              className={itemClass}
              onClick={() => !disabled && onSelect(game.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && !disabled && onSelect(game.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={formatMapName(game.map_id, game.map_name)}
                className={styles.mapThumb}
              />
              <div className={styles.mapInfo}>
                <div className={styles.mapRound}>Map {game.round}</div>
                <div className={styles.mapName}>
                  {formatMapName(game.map_id, game.map_name)}
                </div>
                <Badge
                  size="xs"
                  color={statusColor(game.status)}
                  leftSection={statusIcon(game.status)}
                >
                  {game.status}
                </Badge>
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
}

// ── Mobile horizontal map list ─────────────────────────────────────────────────

function MobileMapList({
  matchGames,
  gameType,
  selectedGameId,
  onSelect,
  disabled
}: {
  matchGames: MatchGame[];
  gameType: string;
  selectedGameId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragScrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const [listDragging, setListDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = listRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    dragStartXRef.current = e.pageX - el.offsetLeft;
    dragScrollLeftRef.current = el.scrollLeft;
    setListDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const el = listRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = x - dragStartXRef.current;
    if (Math.abs(walk) > 5) hasDraggedRef.current = true;
    el.scrollLeft = dragScrollLeftRef.current - walk;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setListDragging(false);
  };

  return (
    <div
      ref={listRef}
      className={listDragging ? `${styles.mobileMapList} ${styles.mobileMapListDragging}` : styles.mobileMapList}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {matchGames.map(game => {
        const imageUrl = game.image_url || getMapImageUrl(gameType, game.map_id);
        const isSelected = selectedGameId === game.id;
        const thumbClass = [
          styles.mobileMapThumb,
          isSelected ? styles.mobileMapThumbSelected : '',
          game.status === 'completed' ? styles.mobileMapThumbCompleted : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={game.id}
            className={styles.mobileMapItem}
            onClick={() => { if (!hasDraggedRef.current && !disabled) onSelect(game.id); }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={formatMapName(game.map_id, game.map_name)}
              className={thumbClass}
            />
            <span className={styles.mobileMapName}>
              {formatMapName(game.map_id, game.map_name)}
            </span>
          </div>
        );
      })}
    </div>
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
        <Badge size="sm" color={statusColor(selectedGame.status)} ml="auto">
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

          {/* Scorecard upload — shown when stats enabled and not yet uploaded */}
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

          {/* Scorecard uploaded indicator */}
          {requiresScorecard && scorecardUploaded && (
            <Alert color="green" icon={<IconCheck size={16} />} variant="light">
              Scorecard uploaded — ready to confirm
            </Alert>
          )}

          {/* Confirm button — shown once a winner is selected */}
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

// ── Winner submit hook ─────────────────────────────────────────────────────────

function useWinnerSubmit(deps: {
  matchId: string;
  matchGames: MatchGame[];
  selectedGameId: string | null;
  onResultSubmit: (result: MatchResult) => Promise<void>;
  refetch: () => Promise<void>;
  setError: (e: string) => void;
  setSelectedGameId: (id: string) => void;
  onAllMapsCompleted?: () => void;
}) {
  const { matchId, matchGames, selectedGameId, onResultSubmit, refetch, setError, setSelectedGameId, onAllMapsCompleted } = deps;

  return async (winner: 'team1' | 'team2', participantId?: string) => {
    const selectedGame = matchGames.find(g => g.id === selectedGameId);
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

      // Move to next pending/ongoing map
      const nextGame = matchGames.find(g =>
        g.id !== selectedGameId && (g.status === 'pending' || g.status === 'ongoing')
      );

      if (nextGame) {
        setSelectedGameId(nextGame.id);
      } else if (onAllMapsCompleted) {
        onAllMapsCompleted();
      }

      setTimeout(() => refetch(), 1000);
    } catch (err) {
      logger.error('Error submitting winner:', err);
      setError(err instanceof Error ? err.message : 'Failed to save result');
    }
  };
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SimpleMapScoring({
  matchId,
  gameType,
  onResultSubmit,
  submitting,
  onAllMapsCompleted,
  matchStatsEnabled = false
}: SimpleMapScoringProps) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasStatDefs, setHasStatDefs] = useState(false);

  // Pending confirmation state
  const [pendingWinner, setPendingWinner] = useState<'team1' | 'team2' | null>(null);
  const [pendingParticipantId, setPendingParticipantId] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [scorecardUploaded, setScorecardUploaded] = useState(false);

  // Fetch whether this game type has stat definitions
  useEffect(() => {
    fetch(`/api/games/${encodeURIComponent(gameType)}/stats`)
      .then(r => r.json())
      .catch(() => [])
      .then((defs: unknown[]) => {
        setHasStatDefs(Array.isArray(defs) && defs.length > 0);
      });
  }, [gameType]);

  const { matchGames, participants, team1Name, team2Name, loading, error: fetchError, refetch } = useMatchGamesData(matchId);

  // Auto-select first pending/ongoing map (only when no map is selected yet)
  useEffect(() => {
    if (matchGames.length > 0 && !selectedGameId) {
      const first = matchGames.find(g => g.status === 'pending' || g.status === 'ongoing') || matchGames[0];
      setTimeout(() => setSelectedGameId(first.id), 0);
    }
  // selectGame intentionally omitted — only runs on initial load, no pending state to reset
   
  }, [matchGames, selectedGameId]);

  // Wrap map selection so switching maps clears pending state
  const selectGame = useCallback((id: string) => {
    setSelectedGameId(id);
    setPendingWinner(null);
    setPendingParticipantId(null);
    setScorecardUploaded(false);
  }, []);

  const handleWinnerSubmit = useWinnerSubmit({
    matchId,
    matchGames,
    selectedGameId,
    onResultSubmit,
    refetch,
    setError,
    setSelectedGameId: selectGame,
    onAllMapsCompleted
  });

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
    const game = matchGames.find(g => g.id === selectedGameId);
    if (!game || game.status === 'completed' || submitting) return;
    setPendingWinner(winner);
    setPendingParticipantId(null);
  };

  const handleParticipantWin = (id: string) => {
    const game = matchGames.find(g => g.id === selectedGameId);
    if (!game || game.status === 'completed' || submitting) return;
    setPendingParticipantId(id);
    setPendingWinner(null);
  };

  const cycleMap = useCallback((direction: 'prev' | 'next') => {
    if (matchGames.length === 0) return;
    const currentIndex = matchGames.findIndex(g => g.id === selectedGameId);
    const base = currentIndex === -1 ? 0 : currentIndex;
    const next = direction === 'next'
      ? (base + 1) % matchGames.length
      : (base - 1 + matchGames.length) % matchGames.length;
    selectGame(matchGames[next].id);
  }, [matchGames, selectedGameId, selectGame]);

  // Hotkeys: arrow keys navigate maps, 1/2 set pending winner (not immediate submit)
  const setPendingTeam1 = useCallback(() => {
    const game = matchGames.find(g => g.id === selectedGameId);
    if (!game || game.status === 'completed' || submitting) return;
    const mode = game.mode_scoring_type;
    if (mode === 'Position' || mode === 'FFA') return;
    setPendingWinner('team1');
    setPendingParticipantId(null);
  }, [matchGames, selectedGameId, submitting]);

  const setPendingTeam2 = useCallback(() => {
    const game = matchGames.find(g => g.id === selectedGameId);
    if (!game || game.status === 'completed' || submitting) return;
    const mode = game.mode_scoring_type;
    if (mode === 'Position' || mode === 'FFA') return;
    setPendingWinner('team2');
    setPendingParticipantId(null);
  }, [matchGames, selectedGameId, submitting]);

  useHotkeys([
    ['ArrowUp', () => cycleMap('prev')],
    ['ArrowDown', () => cycleMap('next')],
    ['1', () => setPendingTeam1()],
    ['2', () => setPendingTeam2()],
  ]);

  if (loading) return <LoadingState />;
  if (fetchError || error) return <ErrorState error={fetchError || error || ''} />;
  if (matchGames.length === 0) return <EmptyState />;

  const selectedGame = matchGames.find(g => g.id === selectedGameId);

  let pendingTeamName = 'Selected player';
  if (pendingWinner === 'team1') pendingTeamName = team1Name || 'Blue Team';
  else if (pendingWinner === 'team2') pendingTeamName = team2Name || 'Red Team';
  else if (pendingParticipantId) {
    pendingTeamName = participants.find(p => p.id === pendingParticipantId)?.username ?? 'Selected player';
  }

  return (
    <div className={styles.container}>
      {/* Desktop sidebar */}
      <MapSidebar
        matchGames={matchGames}
        gameType={gameType}
        selectedGameId={selectedGameId}
        onSelect={selectGame}
        disabled={submitting}
      />

      {/* Mobile horizontal list */}
      <MobileMapList
        matchGames={matchGames}
        gameType={gameType}
        selectedGameId={selectedGameId}
        onSelect={selectGame}
        disabled={submitting}
      />

      {/* Right detail panel */}
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
        <div className={styles.detailPanel}>
          <Alert color="blue" icon={<IconMap size={16} />}>
            Select a map from the list to begin scoring.
          </Alert>
        </div>
      )}

      {/* Confirmation modal */}
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
