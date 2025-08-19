'use client'

import { Stack, Text, Card, Group, Badge } from '@mantine/core';
import { IconClock, IconZap, IconTarget } from '@tabler/icons-react';
import { 
  ModeDataJsonWithScoring, 
  ScoringConfig, 
  MatchScore,
  ScoringTiming 
} from '@/shared/types';
import { TimingDetector } from './TimingDetector';

interface FormatDetectorProps {
  matchId: string;
  gameId: string;
  modeData: ModeDataJsonWithScoring;
  scoringConfig: ScoringConfig;
  onScoreSubmit: (score: MatchScore) => Promise<void>;
  submitting: boolean;
}

export function FormatDetector({
  matchId,
  gameId,
  modeData,
  scoringConfig,
  onScoreSubmit,
  submitting
}: FormatDetectorProps) {
  
  const { format, scoringType, scoringTiming, formatVariant } = scoringConfig;

  // Get scoring timing icon and description
  const getTimingInfo = (timing: ScoringTiming) => {
    switch (timing) {
      case 'realtime':
        return {
          icon: <IconZap size={16} />,
          color: 'orange',
          label: 'Real-time',
          description: 'Score rounds as they complete during the match'
        };
      case 'endgame':
        return {
          icon: <IconClock size={16} />,
          color: 'blue',
          label: 'End-game',
          description: 'Enter final scores when the match is complete'
        };
    }
  };

  const timingInfo = getTimingInfo(scoringTiming);

  // Get scoring type icon and description
  const getScoringTypeInfo = (type: typeof scoringType) => {
    switch (type) {
      case 'rounds':
        return {
          icon: <IconTarget size={16} />,
          color: 'green',
          label: 'Round-based',
          description: 'Teams compete in multiple rounds'
        };
      case 'objective':
        return {
          icon: <IconTarget size={16} />,
          color: 'blue',
          label: 'Objective-based',
          description: 'Teams push objectives for distance/time'
        };
      case 'points':
        return {
          icon: <IconTarget size={16} />,
          color: 'purple',
          label: 'Point capture',
          description: 'Teams capture points to win'
        };
      case 'deathmatch':
        return {
          icon: <IconTarget size={16} />,
          color: 'red',
          label: 'Deathmatch',
          description: 'Teams compete for eliminations'
        };
      case 'vehicle':
        return {
          icon: <IconTarget size={16} />,
          color: 'yellow',
          label: 'Vehicle escort',
          description: 'Teams escort vehicles to destinations'
        };
      case 'custom':
        return {
          icon: <IconTarget size={16} />,
          color: 'gray',
          label: 'Custom',
          description: 'Custom scoring rules'
        };
    }
  };

  const scoringTypeInfo = getScoringTypeInfo(scoringType);

  return (
    <Stack gap="md">
      {/* Scoring Configuration Info */}
      <Card withBorder p="sm">
        <Stack gap="sm">
          <Text fw={600} size="sm">Scoring Configuration</Text>
          
          <Group gap="md">
            <Badge
              color={timingInfo.color}
              variant="light"
              leftSection={timingInfo.icon}
            >
              {timingInfo.label}
            </Badge>
            
            <Badge
              color={scoringTypeInfo.color}
              variant="light"
              leftSection={scoringTypeInfo.icon}
            >
              {scoringTypeInfo.label}
            </Badge>
          </Group>

          <Group gap="xl">
            <div>
              <Text size="xs" fw={600} c="dimmed">Timing</Text>
              <Text size="xs">{timingInfo.description}</Text>
            </div>
            
            <div>
              <Text size="xs" fw={600} c="dimmed">Scoring</Text>
              <Text size="xs">{scoringTypeInfo.description}</Text>
            </div>
          </Group>

          <div>
            <Text size="xs" fw={600} c="dimmed">Format Rules</Text>
            <Text size="xs">{formatVariant.description}</Text>
          </div>
        </Stack>
      </Card>

      {/* Pass to TimingDetector for actual scoring UI */}
      <TimingDetector
        matchId={matchId}
        gameId={gameId}
        modeData={modeData}
        scoringConfig={scoringConfig}
        onScoreSubmit={onScoreSubmit}
        submitting={submitting}
      />
    </Stack>
  );
}