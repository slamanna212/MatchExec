'use client'

import { useState } from 'react';
import { Stack, Group, Card, Button, Text, Divider } from '@mantine/core';
import { IconCheck, IconTarget } from '@tabler/icons-react';
import { 
  ModeDataJsonWithScoring, 
  ScoringConfig, 
  MatchScore,
  ObjectiveScore,
  PointsScore,
  DeathmatchScore,
  VehicleScore,
  CustomScore
} from '@/shared/types';
import { WinnerSelector } from '../shared/WinnerSelector';
import { FormatAwareScoreInput } from '../shared/FormatAwareScoreInput';

interface EndGameScoringProps {
  matchId: string;
  gameId: string;
  modeData: ModeDataJsonWithScoring;
  scoringConfig: ScoringConfig;
  onScoreSubmit: (score: MatchScore) => Promise<void>;
  submitting: boolean;
}

export function EndGameScoring({
  matchId,
  gameId,
  modeData,
  scoringConfig,
  onScoreSubmit,
  submitting
}: EndGameScoringProps) {
  
  // Common state
  const [winner, setWinner] = useState<'team1' | 'team2' | 'draw' | null>(null);
  
  // Objective-based scoring (Escort, Push, Hybrid)
  const [objectiveScores, setObjectiveScores] = useState({
    team1Distance: 0,
    team2Distance: 0,
    team1Time: 0,
    team2Time: 0,
    team1Checkpoints: 0,
    team2Checkpoints: 0
  });

  // Points-based scoring (Flashpoint, Clash, Escalation)
  const [pointScores, setPointScores] = useState({
    team1Points: 0,
    team2Points: 0
  });

  // Deathmatch scoring (Doom Match, Conquest, Valorant DM)
  const [deathmatchScores, setDeathmatchScores] = useState({
    team1Eliminations: 0,
    team2Eliminations: 0
  });

  // Vehicle scoring (Convoy, Convergence)
  const [vehicleScores, setVehicleScores] = useState({
    team1Progress: 0,
    team2Progress: 0,
    team1Time: 0,
    team2Time: 0,
    team1Checkpoints: 0,
    team2Checkpoints: 0
  });

  // Custom scoring data
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  const handleSubmitScore = async () => {
    if (!winner) return;

    let finalScore: MatchScore;

    switch (scoringConfig.scoringType) {
      case 'objective':
        finalScore = {
          matchId,
          gameId,
          format: scoringConfig.format,
          scoringType: 'objective',
          winner,
          completedAt: new Date(),
          team1Distance: objectiveScores.team1Distance,
          team2Distance: objectiveScores.team2Distance,
          team1Time: objectiveScores.team1Time,
          team2Time: objectiveScores.team2Time,
          checkpointsReached: {
            team1: objectiveScores.team1Checkpoints,
            team2: objectiveScores.team2Checkpoints
          }
        } as ObjectiveScore;
        break;

      case 'points':
        finalScore = {
          matchId,
          gameId,
          format: scoringConfig.format,
          scoringType: 'points',
          winner,
          completedAt: new Date(),
          team1Points: pointScores.team1Points,
          team2Points: pointScores.team2Points,
          targetPoints: scoringConfig.validation.targetPoints || 100,
          pointsHistory: []
        } as PointsScore;
        break;

      case 'deathmatch':
        finalScore = {
          matchId,
          gameId,
          format: scoringConfig.format,
          scoringType: 'deathmatch',
          winner,
          completedAt: new Date(),
          team1Eliminations: deathmatchScores.team1Eliminations,
          team2Eliminations: deathmatchScores.team2Eliminations,
          targetEliminations: scoringConfig.validation.targetEliminations || 100,
          timeLimit: scoringConfig.validation.timeLimit
        } as DeathmatchScore;
        break;

      case 'vehicle':
        finalScore = {
          matchId,
          gameId,
          format: scoringConfig.format,
          scoringType: 'vehicle',
          winner,
          completedAt: new Date(),
          team1Progress: vehicleScores.team1Progress,
          team2Progress: vehicleScores.team2Progress,
          team1Time: vehicleScores.team1Time,
          team2Time: vehicleScores.team2Time,
          checkpointsReached: {
            team1: vehicleScores.team1Checkpoints,
            team2: vehicleScores.team2Checkpoints
          }
        } as VehicleScore;
        break;

      case 'custom':
        finalScore = {
          matchId,
          gameId,
          format: scoringConfig.format,
          scoringType: 'custom',
          winner,
          completedAt: new Date(),
          customData
        } as CustomScore;
        break;

      default:
        throw new Error(`Unsupported scoring type: ${scoringConfig.scoringType}`);
    }

    await onScoreSubmit(finalScore);
  };

  const canSubmit = winner !== null && !submitting;

  return (
    <Stack gap="md">
      <Card withBorder p="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <IconTarget size={20} />
              <Text fw={600} size="lg">Final Match Score</Text>
            </Group>
            <Text size="sm" c="dimmed">
              {scoringConfig.format === 'competitive' ? 'Competitive' : 'Casual'} Format
            </Text>
          </Group>

          <Text size="sm" c="dimmed">
            {modeData.description}
          </Text>

          <Divider />

          {/* Scoring inputs based on scoring type */}
          {scoringConfig.scoringType === 'objective' && (
            <Stack gap="md">
              <Text fw={600} size="sm">Objective Progress</Text>
              
              <FormatAwareScoreInput
                team1Score={objectiveScores.team1Distance}
                team2Score={objectiveScores.team2Distance}
                onTeam1ScoreChange={(value) => setObjectiveScores(prev => ({ ...prev, team1Distance: value }))}
                onTeam2ScoreChange={(value) => setObjectiveScores(prev => ({ ...prev, team2Distance: value }))}
                scoringConfig={scoringConfig}
                label="Distance Progress"
                description="How far each team pushed the objective"
              />

              <Group grow>
                <FormatAwareScoreInput
                  team1Score={objectiveScores.team1Checkpoints}
                  team2Score={objectiveScores.team2Checkpoints}
                  onTeam1ScoreChange={(value) => setObjectiveScores(prev => ({ ...prev, team1Checkpoints: value }))}
                  onTeam2ScoreChange={(value) => setObjectiveScores(prev => ({ ...prev, team2Checkpoints: value }))}
                  scoringConfig={scoringConfig}
                  label="Checkpoints"
                  description="Number of checkpoints reached"
                />
              </Group>
            </Stack>
          )}

          {scoringConfig.scoringType === 'points' && (
            <FormatAwareScoreInput
              team1Score={pointScores.team1Points}
              team2Score={pointScores.team2Points}
              onTeam1ScoreChange={(value) => setPointScores(prev => ({ ...prev, team1Points: value }))}
              onTeam2ScoreChange={(value) => setPointScores(prev => ({ ...prev, team2Points: value }))}
              scoringConfig={scoringConfig}
              label="Points Scored"
              description="Total points captured by each team"
            />
          )}

          {scoringConfig.scoringType === 'deathmatch' && (
            <FormatAwareScoreInput
              team1Score={deathmatchScores.team1Eliminations}
              team2Score={deathmatchScores.team2Eliminations}
              onTeam1ScoreChange={(value) => setDeathmatchScores(prev => ({ ...prev, team1Eliminations: value }))}
              onTeam2ScoreChange={(value) => setDeathmatchScores(prev => ({ ...prev, team2Eliminations: value }))}
              scoringConfig={scoringConfig}
              label="Eliminations"
              description="Total eliminations by each team"
            />
          )}

          {scoringConfig.scoringType === 'vehicle' && (
            <Stack gap="md">
              <Text fw={600} size="sm">Vehicle Escort Progress</Text>
              
              <FormatAwareScoreInput
                team1Score={vehicleScores.team1Progress}
                team2Score={vehicleScores.team2Progress}
                onTeam1ScoreChange={(value) => setVehicleScores(prev => ({ ...prev, team1Progress: value }))}
                onTeam2ScoreChange={(value) => setVehicleScores(prev => ({ ...prev, team2Progress: value }))}
                scoringConfig={scoringConfig}
                label="Vehicle Progress"
                description="How far each team escorted the vehicle"
              />

              <FormatAwareScoreInput
                team1Score={vehicleScores.team1Checkpoints}
                team2Score={vehicleScores.team2Checkpoints}
                onTeam1ScoreChange={(value) => setVehicleScores(prev => ({ ...prev, team1Checkpoints: value }))}
                onTeam2ScoreChange={(value) => setVehicleScores(prev => ({ ...prev, team2Checkpoints: value }))}
                scoringConfig={scoringConfig}
                label="Checkpoints"
                description="Number of checkpoints reached"
              />
            </Stack>
          )}

          {scoringConfig.scoringType === 'custom' && (
            <Stack gap="md">
              <Text fw={600} size="sm">Custom Scoring</Text>
              <Text size="sm" c="dimmed">
                This mode uses custom scoring rules. Please determine the winner based on the match results.
              </Text>
            </Stack>
          )}

          <Divider />

          {/* Winner Selection */}
          <WinnerSelector
            value={winner}
            onChange={setWinner}
            allowDraw={true}
            disabled={submitting}
          />
        </Stack>
      </Card>

      {/* Submit Button */}
      <Group justify="flex-end">
        <Button
          size="md"
          color="green"
          leftSection={<IconCheck size={16} />}
          onClick={handleSubmitScore}
          disabled={!canSubmit}
          loading={submitting}
        >
          Submit Match Score
        </Button>
      </Group>
    </Stack>
  );
}