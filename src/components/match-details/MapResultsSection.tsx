'use client'

import { Grid, Card, Group, Image, Stack, Text, Badge } from '@mantine/core';
import { IconTrophy } from '@tabler/icons-react';
import { cleanMapId, extractModeNameFromMapId, getMapWinner } from './helpers';
import responsiveTextClasses from '../responsive-text.module.css';

interface MatchGameResult {
  id: string;
  match_id: string;
  round: number;
  map_id: string;
  map_name: string;
  winner_id?: string;
  status: 'pending' | 'ongoing' | 'completed';
}

interface MapDetail {
  name: string;
  imageUrl?: string;
  modeName?: string;
  location?: string;
  note?: string;
}

interface MapResultsSectionProps {
  maps: string[];
  mapDetails: {[key: string]: MapDetail};
  mapNotes: {[key: string]: string};
  formatMapName: (mapId: string) => string;
  matchGames?: MatchGameResult[];
  showWinner?: boolean;
  children?: (mapId: string, mapDetail: MapDetail | undefined, mapNote: string | undefined) => React.ReactNode;
}

export function MapResultsSection({
  maps,
  mapDetails,
  mapNotes,
  formatMapName,
  matchGames = [],
  showWinner = false,
  children
}: MapResultsSectionProps) {
  return (
    <Grid>
      {maps.map((mapId, index) => {
        const cleanId = cleanMapId(mapId);
        const mapDetail = mapDetails[cleanId] || mapDetails[mapId];
        const mapNote = mapNotes[mapId];
        const winner = showWinner ? getMapWinner(mapId, matchGames) : null;

        return (
          <Grid.Col key={`${mapId}-${index}`} span={12}>
            <Card shadow="sm" padding={0} radius="md" withBorder style={{ overflow: 'hidden' }}>
              <Group wrap="nowrap" align="stretch" gap={0}>
                <div style={{ width: children ? '40%' : '50%', position: 'relative' }}>
                  <Image
                    src={mapDetail?.imageUrl}
                    alt={mapDetail?.name || formatMapName(cleanId)}
                    height={80}
                    radius={0}
                    style={{
                      borderTopLeftRadius: 'var(--mantine-radius-md)',
                      borderBottomLeftRadius: 'var(--mantine-radius-md)',
                      objectFit: 'cover',
                      width: '100%',
                      height: '100%'
                    }}
                    fallbackSrc="data:image/svg+xml,%3csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100' height='100' fill='%23f1f3f4'/%3e%3c/svg%3e"
                  />
                </div>
                <div style={{
                  width: children ? '60%' : '50%',
                  padding: children ? 'var(--mantine-spacing-md)' : 'var(--mantine-spacing-sm)'
                }}>
                  <Stack gap="xs" justify="center" style={{ height: '100%' }}>
                    <div>
                      <Text fw={500} lineClamp={1} className={responsiveTextClasses.mapNameResponsive}>
                        {mapDetail?.name || formatMapName(cleanId)}
                      </Text>
                      {mapDetail?.location && (
                        <Text c="dimmed" lineClamp={1} className={responsiveTextClasses.locationResponsive}>
                          {mapDetail.location}
                        </Text>
                      )}
                      {(mapDetail?.modeName || cleanId.includes('-')) && (
                        <Badge size="xs" variant="light" mt={2}>
                          {mapDetail?.modeName || extractModeNameFromMapId(cleanId)}
                        </Badge>
                      )}
                      {mapNote && (
                        <Text size="xs" c="dimmed" lineClamp={1} mt="xs" title={mapNote}>
                          📝 {mapNote}
                        </Text>
                      )}
                    </div>
                    {winner && (
                      <Group gap={4} justify="flex-start">
                        <IconTrophy size={14} color="gold" />
                        <Badge size="xs" color={winner.color} variant="filled">
                          {winner.team}
                        </Badge>
                      </Group>
                    )}
                    {children && children(mapId, mapDetail, mapNote)}
                  </Stack>
                </div>
              </Group>
            </Card>
          </Grid.Col>
        );
      })}
    </Grid>
  );
}
