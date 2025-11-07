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

  // Unified winner handler
  const handleWinnerSubmit = async (winner: 'team1' | 'team2', participantId?: string) => {
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

      // Optimistic local state update
      await refetch();

      // Move to next pending game
      const nextGame = matchGames.find(g =>
        g.id !== selectedGameId && (g.status === 'pending' || g.status === 'ongoing')
      );

      if (nextGame) {
        setSelectedGameId(nextGame.id);
      } else if (onAllMapsCompleted) {
        onAllMapsCompleted();
      }

      // Background refresh to sync with server
      setTimeout(() => refetch(), 1000);
    } catch (err) {
      logger.error('Error submitting winner:', err);
      setError(err instanceof Error ? err.message : 'Failed to save result');
    }
  };

  const handleTeamWin = (winner: 'team1' | 'team2') => handleWinnerSubmit(winner);
  const handleParticipantWin = (participantId: string) => handleWinnerSubmit('team1', participantId);

  // Loading state
  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader size="md" />
        <Text>Loading match maps...</Text>
      </Group>
    );
  }

  // Error state
  if (fetchError || error) {
    return (
      <Alert color="red" icon={<IconMap size={16} />}>
        {fetchError || error}
      </Alert>
    );
  }

  // Empty state
  if (matchGames.length === 0) {
    return (
      <Alert color="yellow" icon={<IconMap size={16} />}>
        No maps found for this match. Please check the match configuration.
      </Alert>
    );
  }

  const selectedGame = matchGames.find(g => g.id === selectedGameId);

  return (
    <Stack gap="md">
      {/* Map Selection Carousel */}
      <Card withBorder p="md">
        <Stack gap="sm">
          <Text fw={600} size="sm">Match Schedule</Text>

          <Box pos="relative">
            <Group gap="xs" align="center">
              {/* Left Arrow */}
              <ActionIcon
                variant="light"
                size="lg"
                onClick={handleScrollLeft}
                disabled={scrollPosition <= 0}
                style={{ flexShrink: 0 }}
              >
                <IconChevronLeft size={16} />
              </ActionIcon>

              {/* Scrollable Map Container */}
              <Box
                ref={containerRef}
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  position: 'relative'
                }}
              >
                <Group
                  gap="md"
                  style={{
                    flexWrap: 'nowrap'
                  }}
                >
                  {matchGames.map((game) => (
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

              {/* Right Arrow */}
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

          {/* Status Summary */}
          <Group gap="xs" justify="center">
            <Badge color="gray" size="sm">
              {matchGames.filter(g => g.status === 'pending').length} Pending
            </Badge>
            <Badge color="blue" size="sm">
              {matchGames.filter(g => g.status === 'ongoing').length} Ongoing
            </Badge>
            <Badge color="green" size="sm">
              {matchGames.filter(g => g.status === 'completed').length} Completed
            </Badge>
          </Group>
        </Stack>
      </Card>

      {/* Winner Selection */}
      {selectedGame && (
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
                This map has been completed.
                {selectedGame.winner_id && ` Winner: ${selectedGame.winner_id === 'team1' ? (team1Name || 'Blue Team') : (team2Name || 'Red Team')}`}
                {selectedGame.participant_winner_id && participants.find(p => p.id === selectedGame.participant_winner_id) && ` Winner: ${participants.find(p => p.id === selectedGame.participant_winner_id)?.username}`}
              </Alert>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
