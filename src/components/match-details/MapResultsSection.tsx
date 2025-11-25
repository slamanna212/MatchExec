'use client'

import { Grid } from '@mantine/core';
import { cleanMapId, getMapWinner } from './helpers';
import { MapCard } from './MapCard';

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
            <MapCard
              mapId={cleanId}
              mapDetail={mapDetail}
              mapNote={mapNote}
              formatMapName={formatMapName}
              winner={winner}
            >
              {children && children(mapId, mapDetail, mapNote)}
            </MapCard>
          </Grid.Col>
        );
      })}
    </Grid>
  );
}
