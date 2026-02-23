'use client'

import { Stack, Group, Text, Loader } from '@mantine/core';
import { MapResultsSection } from './MapResultsSection';
import { formatTimestamp } from './helpers';

interface MatchGameResult {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  winner_id?: string;
  status: 'pending' | 'ongoing' | 'completed';
}

interface MatchInfoSectionProps {
  selectedMatch: {
    description?: string;
    rules?: string;
    rounds?: number;
    maps?: string[];
    livestream_link?: string;
    max_participants: number;
    start_date?: string;
    created_at: string;
    updated_at: string;
    status: string;
    map_codes_supported?: boolean;
  };
  mapDetails: {[key: string]: {name: string; imageUrl?: string; modeName?: string; location?: string; note?: string}};
  mapNotes: {[key: string]: string};
  formatMapName: (mapId: string) => string;
  matchGames: MatchGameResult[];
  gamesLoading: boolean;
  parseDbTimestamp: (timestamp: string | null | undefined) => Date | null;
}

export function MatchInfoSection({
  selectedMatch,
  mapDetails,
  mapNotes,
  formatMapName,
  matchGames,
  gamesLoading,
  parseDbTimestamp
}: MatchInfoSectionProps) {
  return (
    <Stack gap="sm">
      {selectedMatch.description && (
        <div>
          <Text size="sm" fw={500} c="dimmed">Description:</Text>
          <Text size="sm">{selectedMatch.description}</Text>
        </div>
      )}

      {selectedMatch.rules && (
        <Group justify="space-between">
          <Text size="sm" fw={500} c="dimmed">Rules:</Text>
          <Text size="sm" tt="capitalize">{selectedMatch.rules}</Text>
        </Group>
      )}

      {selectedMatch.rounds && (
        <Group justify="space-between">
          <Text size="sm" fw={500} c="dimmed">Rounds:</Text>
          <Text size="sm">{selectedMatch.rounds}</Text>
        </Group>
      )}

      {selectedMatch.maps && selectedMatch.maps.length > 0 && (
        <div>
          <Group justify="space-between" mb="md">
            <Text size="sm" fw={500} c="dimmed">Maps:</Text>
            {gamesLoading && (selectedMatch.status === 'battle' || selectedMatch.status === 'complete') && (
              <Loader size="xs" />
            )}
          </Group>
          <MapResultsSection
            maps={selectedMatch.maps}
            mapDetails={mapDetails}
            mapNotes={mapNotes}
            formatMapName={formatMapName}
            matchGames={matchGames}
            showWinner={selectedMatch.status === 'battle' || selectedMatch.status === 'complete'}
          />
        </div>
      )}

      {selectedMatch.livestream_link && (
        <Group justify="space-between">
          <Text size="sm" fw={500} c="dimmed">Livestream:</Text>
          <Text size="sm" component="a" href={selectedMatch.livestream_link} target="_blank">
            View Stream
          </Text>
        </Group>
      )}

      <Group justify="space-between">
        <Text size="sm" fw={500} c="dimmed">Max Participants:</Text>
        <Text size="sm">{selectedMatch.max_participants}</Text>
      </Group>

      {selectedMatch.start_date && (
        <Group justify="space-between">
          <Text size="sm" fw={500} c="dimmed">Start Date:</Text>
          <Text size="sm">{formatTimestamp(selectedMatch.start_date, parseDbTimestamp)}</Text>
        </Group>
      )}

      <Group justify="space-between">
        <Text size="sm" fw={500} c="dimmed">Created:</Text>
        <Text size="sm">{formatTimestamp(selectedMatch.created_at, parseDbTimestamp)}</Text>
      </Group>

      {selectedMatch.status === 'complete' && (
        <Group justify="space-between">
          <Text size="sm" fw={500} c="dimmed">Completed:</Text>
          <Text size="sm">{formatTimestamp(selectedMatch.updated_at, parseDbTimestamp)}</Text>
        </Group>
      )}
    </Stack>
  );
}
