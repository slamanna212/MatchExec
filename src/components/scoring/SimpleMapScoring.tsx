'use client'

import { useState, useEffect, useRef } from 'react';
import { Text, Badge, Alert, Loader, Group, Stack } from '@mantine/core';
import { IconMap, IconCheck, IconClock, IconTrophy, IconSwords } from '@tabler/icons-react';
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
  disabled
}: {
  teamName: string;
  side: 'blue' | 'red';
  onClick: () => void;
  disabled: boolean;
}) {
  const cardClass = `${styles.teamCard} ${side === 'blue' ? styles.teamCardBlue : styles.teamCardRed}`;
  const iconClass = `${styles.teamCardIcon} ${side === 'blue' ? styles.teamCardIconBlue : styles.teamCardIconRed}`;

  return (
    <button className={cardClass} onClick={onClick} disabled={disabled} type="button">
      <div className={iconClass}>
        <IconTrophy size={18} />
      </div>
      <div className={styles.teamCardName}>{teamName}</div>
      <div className={styles.teamCardLabel}>Wins this map</div>
    </button>
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
  submitting
}: {
  selectedGame: MatchGame;
  gameType: string;
  participants: MatchParticipant[];
  team1Name: string | null;
  team2Name: string | null;
  onTeamWin: (winner: 'team1' | 'team2') => void;
  onParticipantWin: (id: string) => void;
  submitting: boolean;
}) {
  const imageUrl = selectedGame.image_url || getMapImageUrl(gameType, selectedGame.map_id);
  const mapName = formatMapName(selectedGame.map_id, selectedGame.map_name);
  const isCompleted = selectedGame.status === 'completed';
  const mode = selectedGame.mode_scoring_type;

  return (
    <div className={styles.detailPanel}>
      {/* Hero image */}
      <div
        className={styles.mapHero}
        style={{ backgroundImage: `url('${imageUrl}')` }}
      >
        <div className={styles.mapHeroOverlay}>
          <div className={styles.mapHeroRound}>Map {selectedGame.round}</div>
          <div className={styles.mapHeroTitle}>{mapName}</div>
        </div>
      </div>

      {/* Completed state */}
      {isCompleted && (
        <Alert color="green" icon={<IconCheck size={16} />} radius="md">
          <Text fw={600}>Map complete</Text>
          {selectedGame.winner_id && (
            <Text size="sm">
              Winner: {selectedGame.winner_id === 'team1' ? (team1Name || 'Blue Team') : (team2Name || 'Red Team')}
            </Text>
          )}
          {selectedGame.participant_winner_id && (
            <Text size="sm">
              Winner: {participants.find(p => p.id === selectedGame.participant_winner_id)?.username || 'Unknown'}
            </Text>
          )}
        </Alert>
      )}

      {/* Pending / ongoing — winner selection */}
      {!isCompleted && mode !== 'Position' && (
        <Stack gap="md">
          <Group gap="xs">
            <IconSwords size={16} color="var(--mantine-color-dimmed)" />
            <Text size="sm" c="dimmed" fw={500}>Who won this map?</Text>
            <Badge size="sm" color={statusColor(selectedGame.status)} ml="auto">
              {selectedGame.status}
            </Badge>
          </Group>

          {/* Normal mode: two team cards */}
          {(mode === 'Normal' || !mode) && (
            <div className={styles.winnerGrid}>
              <TeamWinCard
                teamName={team1Name || 'Blue Team'}
                side="blue"
                onClick={() => onTeamWin('team1')}
                disabled={submitting}
              />
              <TeamWinCard
                teamName={team2Name || 'Red Team'}
                side="red"
                onClick={() => onTeamWin('team2')}
                disabled={submitting}
              />
            </div>
          )}

          {/* FFA mode: participant list */}
          {mode === 'FFA' && (
            <div className={styles.ffaGrid}>
              {participants.map(p => (
                <button
                  key={p.id}
                  className={styles.ffaCard}
                  onClick={() => onParticipantWin(p.id)}
                  disabled={submitting}
                  type="button"
                >
                  <IconTrophy size={18} color="var(--mantine-color-violet-5)" />
                  <span className={styles.ffaCardName}>{p.username} Wins</span>
                </button>
              ))}
            </div>
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
  onAllMapsCompleted
}: SimpleMapScoringProps) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { matchGames, participants, team1Name, team2Name, loading, error: fetchError, refetch } = useMatchGamesData(matchId);

  // Auto-select first pending/ongoing map
  useEffect(() => {
    if (matchGames.length > 0 && !selectedGameId) {
      const first = matchGames.find(g => g.status === 'pending' || g.status === 'ongoing') || matchGames[0];
      setTimeout(() => setSelectedGameId(first.id), 0);
    }
  }, [matchGames, selectedGameId]);

  const handleWinnerSubmit = useWinnerSubmit({
    matchId,
    matchGames,
    selectedGameId,
    onResultSubmit,
    refetch,
    setError,
    setSelectedGameId,
    onAllMapsCompleted
  });

  if (loading) return <LoadingState />;
  if (fetchError || error) return <ErrorState error={fetchError || error || ''} />;
  if (matchGames.length === 0) return <EmptyState />;

  const selectedGame = matchGames.find(g => g.id === selectedGameId);

  return (
    <div className={styles.container}>
      {/* Desktop sidebar */}
      <MapSidebar
        matchGames={matchGames}
        gameType={gameType}
        selectedGameId={selectedGameId}
        onSelect={setSelectedGameId}
        disabled={submitting}
      />

      {/* Mobile horizontal list */}
      <MobileMapList
        matchGames={matchGames}
        gameType={gameType}
        selectedGameId={selectedGameId}
        onSelect={setSelectedGameId}
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
          onTeamWin={winner => handleWinnerSubmit(winner)}
          onParticipantWin={id => handleWinnerSubmit('team1', id)}
          submitting={submitting}
        />
      ) : (
        <div className={styles.detailPanel}>
          <Alert color="blue" icon={<IconMap size={16} />}>
            Select a map from the list to begin scoring.
          </Alert>
        </div>
      )}
    </div>
  );
}
