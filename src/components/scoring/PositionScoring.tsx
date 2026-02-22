'use client'

import { useState, useEffect, useCallback } from 'react';
import { Text, Badge, Alert, Loader, Group, Stack, Select, Button } from '@mantine/core';
import { IconFlag, IconCheck, IconTrophy } from '@tabler/icons-react';
import type { MatchResult } from '@/shared/types';
import { logger } from '@/lib/logger/client';
import { getMapImageUrl, formatMapName } from '@/lib/utils/map-utils';
import styles from './PositionScoring.module.css';

interface MatchGame {
  id: string;
  round: number;
  map_id: string;
  map_name: string;
  image_url?: string;
  status: 'pending' | 'ongoing' | 'completed';
  position_results?: string;
}

interface MatchParticipant {
  id: string;
  username: string;
}

interface PositionScoringProps {
  matchId: string;
  gameType: string;
  onResultSubmit: (result: MatchResult) => Promise<void>;
  submitting: boolean;
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── Race sidebar (desktop) ────────────────────────────────────────────────────

function RaceSidebar({
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
          Races — {completed}/{matchGames.length} done
        </div>

        {matchGames.map(game => {
          const imageUrl = game.image_url || getMapImageUrl(gameType, game.map_id);
          const isSelected = selectedGameId === game.id;
          const itemClass = [
            styles.raceItem,
            isSelected ? styles.raceItemSelected : '',
            game.status === 'completed' ? styles.raceItemCompleted : '',
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
                className={styles.raceThumb}
              />
              <div className={styles.raceInfo}>
                <div className={styles.raceRound}>Race {game.round}</div>
                <div className={styles.raceName}>
                  {formatMapName(game.map_id, game.map_name)}
                </div>
                <Badge
                  size="xs"
                  color={game.status === 'completed' ? 'green' : 'gray'}
                  leftSection={game.status === 'completed' ? <IconCheck size={10} /> : undefined}
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

// ── Mobile horizontal race list ───────────────────────────────────────────────

function MobileRaceList({
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
  return (
    <div className={styles.mobileRaceList}>
      {matchGames.map(game => {
        const imageUrl = game.image_url || getMapImageUrl(gameType, game.map_id);
        const isSelected = selectedGameId === game.id;
        const thumbClass = [
          styles.mobileRaceThumb,
          isSelected ? styles.mobileRaceThumbSelected : '',
          game.status === 'completed' ? styles.mobileRaceThumbCompleted : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={game.id}
            className={styles.mobileRaceItem}
            onClick={() => !disabled && onSelect(game.id)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={formatMapName(game.map_id, game.map_name)}
              className={thumbClass}
            />
            <span className={styles.mobileRaceName}>
              {formatMapName(game.map_id, game.map_name)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Race detail panel ─────────────────────────────────────────────────────────

function RaceDetailPanel({
  selectedGame,
  gameType,
  participants,
  positionAssignments,
  onPositionChange,
  onSubmit,
  submitting,
  isValid
}: {
  selectedGame: MatchGame;
  gameType: string;
  participants: MatchParticipant[];
  positionAssignments: Record<string, number | null>;
  onPositionChange: (participantId: string, position: string | null) => void;
  onSubmit: () => void;
  submitting: boolean;
  isValid: boolean;
}) {
  const imageUrl = selectedGame.image_url || getMapImageUrl(gameType, selectedGame.map_id);
  const raceName = formatMapName(selectedGame.map_id, selectedGame.map_name);
  const isCompleted = selectedGame.status === 'completed';

  const positionOptions = Array.from({ length: participants.length }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}${getOrdinalSuffix(i + 1)} Place`
  }));

  const allAssigned = participants.every(p => positionAssignments[p.id] !== null);
  const hasDuplicates = (() => {
    const vals = participants.map(p => positionAssignments[p.id]).filter(v => v !== null);
    return new Set(vals).size !== vals.length;
  })();

  return (
    <div className={styles.detailPanel}>
      {/* Hero */}
      <div
        className={styles.raceHero}
        style={{ backgroundImage: `url('${imageUrl}')` }}
      >
        <div className={styles.raceHeroOverlay}>
          <div className={styles.raceHeroRound}>Race {selectedGame.round}</div>
          <div className={styles.raceHeroTitle}>{raceName}</div>
        </div>
      </div>

      {/* Completed */}
      {isCompleted && (
        <Alert color="green" icon={<IconCheck size={16} />} radius="md">
          <Text fw={600}>Race complete — results recorded.</Text>
        </Alert>
      )}

      {/* Position entry */}
      {!isCompleted && (
        <Stack gap="md">
          <Group gap="xs">
            <IconTrophy size={16} color="var(--mantine-color-dimmed)" />
            <Text size="sm" c="dimmed" fw={500}>Assign finishing positions</Text>
            <Badge size="sm" color="blue" ml="auto">Position Scoring</Badge>
          </Group>

          <div className={styles.participantList}>
            {participants.map(participant => {
              const assigned = positionAssignments[participant.id] !== null;
              const rowClass = `${styles.participantRow} ${assigned ? styles.participantRowAssigned : ''}`;
              const initial = participant.username.charAt(0).toUpperCase();

              return (
                <div key={participant.id} className={rowClass}>
                  <div className={styles.participantAvatar}>{initial}</div>
                  <span className={styles.participantName}>{participant.username}</span>
                  <div className={styles.participantSelect}>
                    <Select
                      placeholder="Position"
                      data={positionOptions}
                      value={positionAssignments[participant.id]?.toString() ?? null}
                      onChange={value => onPositionChange(participant.id, value)}
                      disabled={submitting}
                      clearable
                      size="sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {hasDuplicates && (
            <Text size="xs" c="red" ta="center">Two participants cannot share the same position.</Text>
          )}
          {!allAssigned && !hasDuplicates && (
            <Text size="xs" c="dimmed" ta="center">Assign a position to every participant to submit.</Text>
          )}

          <Button
            fullWidth
            size="md"
            color="blue"
            onClick={onSubmit}
            disabled={!isValid || submitting}
            loading={submitting}
            leftSection={<IconCheck size={18} />}
          >
            Submit Race Results
          </Button>
        </Stack>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PositionScoring({
  matchId,
  gameType,
  onResultSubmit,
  submitting
}: PositionScoringProps) {
  const [matchGames, setMatchGames] = useState<MatchGame[]>([]);
  const [participants, setParticipants] = useState<MatchParticipant[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [positionAssignments, setPositionAssignments] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatchData = useCallback(async () => {
    try {
      setError(null);
      const [gamesRes, participantsRes] = await Promise.all([
        fetch(`/api/matches/${matchId}/games?t=${Date.now()}`),
        fetch(`/api/matches/${matchId}/participants`)
      ]);

      if (!gamesRes.ok) throw new Error('Failed to load races');
      if (!participantsRes.ok) throw new Error('Failed to load participants');

      const gamesData = await gamesRes.json();
      const participantsData = await participantsRes.json();

      const games: MatchGame[] = gamesData.games || [];
      const parts: MatchParticipant[] = participantsData.participants || [];

      setMatchGames(games);
      setParticipants(parts);

      // Auto-select first pending/ongoing race
      if (!selectedGameId) {
        const active = games.find(g => g.status === 'pending' || g.status === 'ongoing');
        if (active) setSelectedGameId(active.id);
      }
    } catch (err) {
      logger.error('Error fetching position scoring data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load match data');
    } finally {
      setLoading(false);
    }
  }, [matchId, selectedGameId]);

  useEffect(() => {
    if (matchId?.trim()) fetchMatchData();
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset assignments when participants load or selected game changes
  useEffect(() => {
    if (participants.length > 0) {
      const initial: Record<string, number | null> = {};
      participants.forEach(p => { initial[p.id] = null; });
      setPositionAssignments(initial);
    }
  }, [participants, selectedGameId]);

  const handlePositionChange = (participantId: string, value: string | null) => {
    setPositionAssignments(prev => ({
      ...prev,
      [participantId]: value ? parseInt(value) : null
    }));
  };

  const isValid = (): boolean => {
    const vals = Object.values(positionAssignments);
    if (vals.some(v => v === null)) return false;
    return new Set(vals).size === vals.length;
  };

  const handleSubmit = async () => {
    const selectedGame = matchGames.find(g => g.id === selectedGameId);
    if (!selectedGame || !isValid()) return;

    try {
      const positionResults: Record<string, number> = {};
      for (const [id, pos] of Object.entries(positionAssignments)) {
        if (pos !== null) positionResults[id] = pos;
      }

      const result: MatchResult = {
        matchId,
        gameId: selectedGame.id,
        winner: 'team1',
        positionResults,
        isPositionMode: true,
        completedAt: new Date()
      };

      await onResultSubmit(result);
      await fetchMatchData();

      // Move to next pending race
      const nextGame = matchGames.find(g =>
        g.id !== selectedGameId && (g.status === 'pending' || g.status === 'ongoing')
      );
      if (nextGame) setSelectedGameId(nextGame.id);
    } catch (err) {
      logger.error('Error submitting position results:', err);
      setError(err instanceof Error ? err.message : 'Failed to save results');
    }
  };

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader size="md" />
        <Text>Loading race data...</Text>
      </Group>
    );
  }

  if (error) {
    return <Alert color="red" icon={<IconFlag size={16} />}>{error}</Alert>;
  }

  if (matchGames.length === 0 || participants.length === 0) {
    return (
      <Alert color="yellow" icon={<IconFlag size={16} />}>
        No races or participants found for this match.
      </Alert>
    );
  }

  const selectedGame = matchGames.find(g => g.id === selectedGameId);

  return (
    <div className={styles.container}>
      <RaceSidebar
        matchGames={matchGames}
        gameType={gameType}
        selectedGameId={selectedGameId}
        onSelect={setSelectedGameId}
        disabled={submitting}
      />

      <MobileRaceList
        matchGames={matchGames}
        gameType={gameType}
        selectedGameId={selectedGameId}
        onSelect={setSelectedGameId}
        disabled={submitting}
      />

      {selectedGame ? (
        <RaceDetailPanel
          selectedGame={selectedGame}
          gameType={gameType}
          participants={participants}
          positionAssignments={positionAssignments}
          onPositionChange={handlePositionChange}
          onSubmit={handleSubmit}
          submitting={submitting}
          isValid={isValid()}
        />
      ) : (
        <div className={styles.detailPanel}>
          <Alert color="blue" icon={<IconFlag size={16} />}>
            Select a race from the list to enter results.
          </Alert>
        </div>
      )}
    </div>
  );
}
