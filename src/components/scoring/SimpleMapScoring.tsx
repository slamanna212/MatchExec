'use client'

import { useState, useEffect } from 'react';
import { Stack, Group, Card, Text, Badge, Divider, Alert, Loader, Box, ActionIcon } from '@mantine/core';
import { IconMap, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { MatchResult } from '@/shared/types';
import { logger } from '@/lib/logger/client';
import { MapCard } from '@/components/shared/MapCard';
import { WinnerSelection } from './WinnerSelection';
import { useMatchGamesData } from './hooks/useMatchGamesData';
import { useMapScroll } from './hooks/useMapScroll';

interface SimpleMapScoringProps {
  matchId: string;
  gameType: string;
  onResultSubmit: (result: MatchResult) => Promise<void>;
  submitting: boolean;
  onAllMapsCompleted?: () => void;
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

export function SimpleMapScoring({
  matchId,
  gameType,
  onResultSubmit,
  submitting,
  onAllMapsCompleted
}: SimpleMapScoringProps) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use custom hooks
  const {
    matchGames,
    participants,
    team1Name,
    team2Name,
    loading,
    error: fetchError,
    refetch
  } = useMatchGamesData(matchId);

  const {
    scrollPosition,
    containerRef,
    scrollToMap,
    handleScrollLeft,
    handleScrollRight,
    getMaxScroll
  } = useMapScroll(matchGames.length);

  // Auto-select first pending/ongoing map when games load
  useEffect(() => {
    if (matchGames.length > 0 && !selectedGameId) {
      const firstPendingGame = matchGames.find(g => g.status === 'pending' || g.status === 'ongoing');
      const gameToSelect = firstPendingGame || matchGames[0];
      // Use setTimeout to avoid cascading updates
      setTimeout(() => setSelectedGameId(gameToSelect.id), 0);
      logger.debug('SimpleMapScoring: Auto-selected game:', gameToSelect.id);
    }
  }, [matchGames, selectedGameId]);

  // Scroll to selected game when selection changes
  useEffect(() => {
    if (selectedGameId) {
      const index = matchGames.findIndex((g) => g.id === selectedGameId);
      if (index !== -1) {
        setTimeout(() => scrollToMap(index), 100);
      }
    }
  }, [selectedGameId, matchGames, scrollToMap]);

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

  const handleTeamWin = (winner: 'team1' | 'team2') => handleWinnerSubmit(winner);
  const handleParticipantWin = (participantId: string) => handleWinnerSubmit('team1', participantId);

  // Early returns for different states
  if (loading) return <LoadingState />;
  if (fetchError || error) return <ErrorState error={fetchError || error || ''} />;
  if (matchGames.length === 0) return <EmptyState />;

  const selectedGame = matchGames.find(g => g.id === selectedGameId);

  return (
    <Stack gap="md">
      <MapSelectionCarousel
        matchGames={matchGames}
        gameType={gameType}
        selectedGameId={selectedGameId}
        setSelectedGameId={setSelectedGameId}
        submitting={submitting}
        scrollPosition={scrollPosition}
        containerRef={containerRef}
        handleScrollLeft={handleScrollLeft}
        handleScrollRight={handleScrollRight}
        getMaxScroll={getMaxScroll}
      />

      {selectedGame && (
        <WinnerSelectionCard
          selectedGame={selectedGame}
          participants={participants}
          team1Name={team1Name}
          team2Name={team2Name}
          handleTeamWin={handleTeamWin}
          handleParticipantWin={handleParticipantWin}
          submitting={submitting}
        />
      )}
    </Stack>
  );
}

// Hook for winner submission logic
function useWinnerSubmit(deps: any) {
  const {
    matchId,
    matchGames,
    selectedGameId,
    onResultSubmit,
    refetch,
    setError,
    setSelectedGameId,
    onAllMapsCompleted
  } = deps;

  return async (winner: 'team1' | 'team2', participantId?: string) => {
    const selectedGame = matchGames.find((g: any) => g.id === selectedGameId);
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

      // Navigate to next game
      const nextGame = matchGames.find((g: any) =>
        g.id !== selectedGameId && (g.status === 'pending' || g.status === 'ongoing')
      );

      if (nextGame) {
        setSelectedGameId(nextGame.id);
      } else if (onAllMapsCompleted) {
        onAllMapsCompleted();
      }

      // Background refresh
      setTimeout(() => refetch(), 1000);
    } catch (err) {
      logger.error('Error submitting winner:', err);
      setError(err instanceof Error ? err.message : 'Failed to save result');
    }
  };
}

// Map selection carousel component
function MapSelectionCarousel({ matchGames, gameType, selectedGameId, setSelectedGameId, submitting, scrollPosition, containerRef, handleScrollLeft, handleScrollRight, getMaxScroll }: any) {
  return (
    <Card withBorder p="md">
      <Stack gap="sm">
        <Text fw={600} size="sm">Match Schedule</Text>

        <Box pos="relative">
          <Group gap="xs" align="center">
            <ActionIcon
              variant="light"
              size="lg"
              onClick={handleScrollLeft}
              disabled={scrollPosition <= 0}
              style={{ flexShrink: 0 }}
            >
              <IconChevronLeft size={16} />
            </ActionIcon>

            <Box
              ref={containerRef}
              style={{
                flex: 1,
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              <Group gap="md" style={{ flexWrap: 'nowrap' }}>
                {matchGames.map((game: any) => (
                  <MapCard
                    key={game.id}
                    mapId={game.map_id}
                    mapName={game.map_name}
                    gameType={gameType}
                    round={game.round}
                    status={game.status}
                    selected={selectedGameId === game.id}
                    onClick={() => setSelectedGameId(game.id)}
                    disabled={submitting}
                    imageUrl={game.image_url}
                  />
                ))}
              </Group>
            </Box>

            <ActionIcon
              variant="light"
              size="lg"
              onClick={handleScrollRight}
              disabled={scrollPosition >= getMaxScroll()}
              style={{ flexShrink: 0 }}
            >
              <IconChevronRight size={16} />
            </ActionIcon>
          </Group>
        </Box>

        <Group gap="xs" justify="center">
          <Badge color="gray" size="sm">
            {matchGames.filter((g: any) => g.status === 'pending').length} Pending
          </Badge>
          <Badge color="blue" size="sm">
            {matchGames.filter((g: any) => g.status === 'ongoing').length} Ongoing
          </Badge>
          <Badge color="green" size="sm">
            {matchGames.filter((g: any) => g.status === 'completed').length} Completed
          </Badge>
        </Group>
      </Stack>
    </Card>
  );
}

// Winner selection card component
function WinnerSelectionCard({ selectedGame, participants, team1Name, team2Name, handleTeamWin, handleParticipantWin, submitting }: any) {
  const getWinnerText = () => {
    if (selectedGame.winner_id) {
      const winnerName = selectedGame.winner_id === 'team1' ? (team1Name || 'Blue Team') : (team2Name || 'Red Team');
      return ` Winner: ${winnerName}`;
    }

    if (selectedGame.participant_winner_id) {
      const winner = participants.find((p: any) => p.id === selectedGame.participant_winner_id);
      return winner ? ` Winner: ${winner.username}` : '';
    }

    return '';
  };

  return (
    <Card withBorder p="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>Map {selectedGame.round} - Score</Text>
          <Badge color={selectedGame.status === 'completed' ? 'green' : 'blue'}>
            {selectedGame.status}
          </Badge>
        </Group>

        <Divider />

        {selectedGame.status !== 'completed' && (
          <WinnerSelection
            mode={selectedGame.mode_scoring_type}
            participants={participants}
            team1Name={team1Name}
            team2Name={team2Name}
            onTeamWin={handleTeamWin}
            onParticipantWin={handleParticipantWin}
            submitting={submitting}
          />
        )}

        {selectedGame.status === 'completed' && (
          <Alert color="green" icon={<IconMap size={16} />}>
            This map has been completed.{getWinnerText()}
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
