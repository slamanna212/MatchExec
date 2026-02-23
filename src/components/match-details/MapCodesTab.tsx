'use client'

import { Stack, Group, Text, Button, TextInput } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { MapResultsSection } from './MapResultsSection';

interface MapCodesTabProps {
  maps: string[] | undefined;
  mapDetails: {[key: string]: {name: string; imageUrl?: string; modeName?: string; location?: string; note?: string}};
  mapNotes: {[key: string]: string};
  formatMapName: (mapId: string) => string;
  mapCodes: Record<string, string>;
  mapCodesSaving: boolean;
  saveMapCodes: () => void;
  updateMapCode: (mapId: string, value: string) => void;
}

export function MapCodesTab({
  maps,
  mapDetails,
  mapNotes,
  formatMapName,
  mapCodes,
  mapCodesSaving,
  saveMapCodes,
  updateMapCode
}: MapCodesTabProps) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Text size="lg" fw={600}>Map Codes</Text>
        <Button
          size="sm"
          loading={mapCodesSaving}
          onClick={saveMapCodes}
          leftSection={<IconDeviceFloppy size={16} />}
        >
          Save Codes
        </Button>
      </Group>

      {maps && maps.length > 0 ? (
        <MapResultsSection
          maps={maps}
          mapDetails={mapDetails}
          mapNotes={mapNotes}
          formatMapName={formatMapName}
        >
          {(mapId) => (
            <TextInput
              placeholder="Enter map code"
              value={mapCodes[mapId] || ''}
              onChange={(event) => updateMapCode(mapId, event.currentTarget.value)}
              maxLength={24}
              size="sm"
              styles={{
                input: {
                  fontFamily: 'monospace',
                  fontSize: '0.9em'
                }
              }}
            />
          )}
        </MapResultsSection>
      ) : (
        <Text size="sm" c="dimmed" ta="center" py="md">
          No maps configured for this match
        </Text>
      )}
    </Stack>
  );
}
