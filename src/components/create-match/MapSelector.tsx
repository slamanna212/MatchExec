'use client'

import { useState } from 'react';
import { Card, Text, Select, Grid, Group, Button } from '@mantine/core';
import type { GameMode, GameMapWithMode } from './useMatchForm';
import { MapCard } from './MapCard';
import { FlexibleMapCard } from './FlexibleMapCard';

interface MapSelectorProps {
  availableModes: GameMode[];
  currentGameSupportsAllModes: boolean;
  allMaps: GameMapWithMode[];
  mapsForMode: GameMapWithMode[];
  selectedMode: string;
  loadingMaps: boolean;
  onModeSelect: (modeId: string) => Promise<void>;
  onMapSelect: (map: GameMapWithMode) => void;
  onFlexibleMapSelect: (map: GameMapWithMode, modeId: string) => void;
  onCancel: () => void;
}

export function MapSelector({
  availableModes,
  currentGameSupportsAllModes,
  allMaps,
  mapsForMode,
  selectedMode,
  loadingMaps,
  onModeSelect,
  onMapSelect,
  onFlexibleMapSelect,
  onCancel
}: MapSelectorProps) {
  const [flexibleModeSelects, setFlexibleModeSelects] = useState<Record<string, string>>({});

  const handleFlexibleModeChange = (mapId: string, modeId: string | null) => {
    if (!modeId) return;
    setFlexibleModeSelects(prev => ({
      ...prev,
      [mapId]: modeId
    }));
  };

  return (
    <Card withBorder padding="md" mt="md">
      <Text fw={500} mb="md">Select a Map</Text>

      {!currentGameSupportsAllModes ? (
        // Traditional mode: select mode first, then maps for that mode
        <>
          <Select
            label="Game Mode"
            placeholder="Choose a game mode"
            data={availableModes.map(mode => ({ value: mode.id, label: mode.name }))}
            value={selectedMode}
            onChange={(value) => value && onModeSelect(value)}
            mb="md"
            disabled={availableModes.length === 0}
          />

          {selectedMode && (
            <>
              {loadingMaps ? (
                <Text size="sm" c="dimmed">Loading maps...</Text>
              ) : (
                <Grid>
                  {mapsForMode.map((map) => (
                    <Grid.Col key={map.id} span={{ base: 12, sm: 6, md: 4 }}>
                      <MapCard map={map} onClick={() => onMapSelect(map)} />
                    </Grid.Col>
                  ))}
                </Grid>
              )}
            </>
          )}
        </>
      ) : (
        // Flexible mode: show all maps with mode selection for each
        <>
          <Text size="sm" c="dimmed" mb="md">
            Select any map and choose which mode to play on it.
          </Text>
          <Grid>
            {allMaps.map((map, index) => (
              <Grid.Col key={`${map.id}-${index}`} span={{ base: 12, sm: 6, md: 4 }}>
                <FlexibleMapCard
                  map={map}
                  availableModes={availableModes}
                  selectedModeId={flexibleModeSelects[map.id]}
                  onModeChange={(modeId) => handleFlexibleModeChange(map.id, modeId)}
                  onAddMap={(modeId) => onFlexibleMapSelect(map, modeId)}
                />
              </Grid.Col>
            ))}
          </Grid>
        </>
      )}

      <Group justify="end" mt="md">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </Group>
    </Card>
  );
}
