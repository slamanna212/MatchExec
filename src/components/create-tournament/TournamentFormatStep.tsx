'use client'

import { Text, Stack, Group, Select, Button } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { TournamentFormData } from '../create-tournament/useTournamentForm';
import type { TournamentFormat } from '@/shared/types';

interface GameMode {
  id: string;
  name: string;
  team_size: number | null;
  max_players: number;
}

interface TournamentFormatStepProps {
  formData: Partial<TournamentFormData>;
  updateFormData: (key: keyof TournamentFormData, value: unknown) => void;
  onBack: () => void;
  onNext: () => void;
  canProceed: boolean;
}

export function TournamentFormatStep({
  formData,
  updateFormData,
  onBack,
  onNext,
  canProceed
}: TournamentFormatStepProps) {
  const [gameModes, setGameModes] = useState<GameMode[]>([]);
  const [loadingModes, setLoadingModes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch game modes when the component mounts or gameId changes
  useEffect(() => {
    if (!formData.gameId) {
      return;
    }

    const fetchGameModes = async () => {
      setLoadingModes(true);
      setError(null);

      try {
        const response = await fetch(`/api/games/${formData.gameId}/modes`);
        if (!response.ok) {
          throw new Error('Failed to fetch game modes');
        }

        const modes = await response.json();
        setGameModes(modes);

        // If there's only one mode, auto-select it
        if (modes.length === 1 && !formData.gameModeId) {
          updateFormData('gameModeId', modes[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game modes');
      } finally {
        setLoadingModes(false);
      }
    };

    void fetchGameModes();
  }, [formData.gameId, formData.gameModeId, updateFormData]);

  const formatTeamSizeLabel = (teamSize: number | null, maxPlayers?: number): string => {
    if (teamSize === null) {
      // FFA mode - show player count
      return maxPlayers ? `${maxPlayers} players (FFA)` : 'FFA';
    }
    // Team-based mode - show XvX format only
    return `${teamSize}v${teamSize}`;
  };

  const getModeSelectData = () => {
    // Special handling for Overwatch 2 - manually create 5v5 and 6v6 options
    if (formData.gameId === 'overwatch2') {
      const nonWorkshopModes = gameModes.filter(m => m.id !== 'workshop');
      if (nonWorkshopModes.length > 0) {
        const firstMode = nonWorkshopModes[0];
        return [
          { value: 'ow2-5v5', label: '5v5', modeId: firstMode.id },
          { value: 'ow2-6v6', label: '6v6', modeId: firstMode.id }
        ];
      }
      return [];
    }

    // For other games, group modes by team_size
    const grouped: Record<string, GameMode> = {};

    gameModes.forEach((mode) => {
      const key = mode.team_size !== null ? `team_${mode.team_size}` : `ffa_${mode.max_players || 'unknown'}`;
      if (!grouped[key]) {
        grouped[key] = mode;
      }
    });

    return Object.values(grouped).map((mode) => ({
      value: mode.id,
      label: formatTeamSizeLabel(mode.team_size, mode.max_players),
      modeId: mode.id
    }));
  };

  const modeSelectData = getModeSelectData();

  return (
    <Stack>
      <Text mb="md">Select tournament format and game mode:</Text>

      <Select
        label="Tournament Format"
        description="Choose between single elimination or double elimination bracket"
        required
        data={[
          { value: 'single-elimination', label: 'Single Elimination' },
          { value: 'double-elimination', label: 'Double Elimination' }
        ]}
        value={formData.format || 'single-elimination'}
        onChange={(value) => updateFormData('format', (value as TournamentFormat) || 'single-elimination')}
      />

      <Select
        label="Game Mode"
        description="All tournament matches will use this team size"
        required
        data={modeSelectData}
        value={formData.gameModeId || ''}
        onChange={(value) => updateFormData('gameModeId', value || '')}
        disabled={loadingModes || gameModes.length === 0}
        placeholder={loadingModes ? 'Loading modes...' : 'Select a game mode'}
        error={error}
        searchable
      />

      <Group justify="space-between" mt="md">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!canProceed}>
          Next: Team Settings
        </Button>
      </Group>
    </Stack>
  );
}
