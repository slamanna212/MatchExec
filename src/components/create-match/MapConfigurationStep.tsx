'use client'

import { Text, Stack, Button, Group, Checkbox } from '@mantine/core';
import type { SelectedMapCard, GameMode, GameMapWithMode } from './useMatchForm';
import { SelectedMapsList } from './SelectedMapsList';
import { MapSelector } from './MapSelector';

interface MapConfigurationStepProps {
  selectedMaps: SelectedMapCard[];
  showMapSelector: boolean;
  availableModes: GameMode[];
  currentGameSupportsAllModes: boolean;
  allMaps: GameMapWithMode[];
  mapsForMode: GameMapWithMode[];
  selectedMode: string;
  loadingMaps: boolean;
  startSignups: boolean;
  onAddMapClick: () => void;
  onRemoveMap: (mapId: string) => void;
  onOpenNoteModal: (map: SelectedMapCard) => void;
  onModeSelect: (modeId: string) => Promise<void>;
  onMapSelect: (map: GameMapWithMode) => void;
  onFlexibleMapSelect: (map: GameMapWithMode, modeId: string) => void;
  onCancelMapSelector: () => void;
  onBack: () => void;
  onCreate: () => void;
  setStartSignups: (value: boolean) => void;
}

export function MapConfigurationStep({
  selectedMaps,
  showMapSelector,
  availableModes,
  currentGameSupportsAllModes,
  allMaps,
  mapsForMode,
  selectedMode,
  loadingMaps,
  startSignups,
  onAddMapClick,
  onRemoveMap,
  onOpenNoteModal,
  onModeSelect,
  onMapSelect,
  onFlexibleMapSelect,
  onCancelMapSelector,
  onBack,
  onCreate,
  setStartSignups
}: MapConfigurationStepProps) {
  return (
    <Stack>
      <Text mb="md">Maps Configuration:</Text>

      {selectedMaps.length > 0 && (
        <Text size="sm" c="dimmed" mb="md">
          <strong>Rounds:</strong> {selectedMaps.length} (based on selected maps)
        </Text>
      )}

      <Text size="sm" fw={500} mt="md">Selected Maps:</Text>

      <SelectedMapsList
        selectedMaps={selectedMaps}
        showMapSelector={showMapSelector}
        onRemoveMap={onRemoveMap}
        onOpenNoteModal={onOpenNoteModal}
        onAddMapClick={onAddMapClick}
      />

      {showMapSelector && (
        <MapSelector
          availableModes={availableModes}
          currentGameSupportsAllModes={currentGameSupportsAllModes}
          allMaps={allMaps}
          mapsForMode={mapsForMode}
          selectedMode={selectedMode}
          loadingMaps={loadingMaps}
          onModeSelect={onModeSelect}
          onMapSelect={onMapSelect}
          onFlexibleMapSelect={onFlexibleMapSelect}
          onCancel={onCancelMapSelector}
        />
      )}

      <Group justify="space-between" mt="md" gap="xs" align="center">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Group align="center" gap="xs">
          <Checkbox
            label="Start Signups"
            checked={startSignups}
            onChange={(event) => setStartSignups(event.currentTarget.checked)}
          />
          <Button
            onClick={onCreate}
            disabled={!selectedMaps.length}
          >
            Create Match
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
