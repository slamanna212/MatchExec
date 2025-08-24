'use client'

import { useState, useEffect } from 'react';
import { 
  Card, 
  Stack, 
  Group, 
  Text, 
  Badge, 
  Divider,
  Grid,
  Alert,
  Loader,
  Progress
} from '@mantine/core';
import { IconTrophy, IconUsers, IconTarget } from '@tabler/icons-react';

interface OverallMatchScoreProps {
  matchId: string;
}

interface OverallScore {
  team1Wins: number;
  team2Wins: number;
  totalNormalGames: number;
  overallWinner: 'team1' | 'team2' | 'tie' | null;
}

interface GameResult {
  id: string;
  round: number;
  map_name: string;
  mode_scoring_type: string;
  status: string;
  winner_id?: string;
  participant_winner_id?: string;
  participant_winner_name?: string;
  is_ffa_mode: boolean;
}

export function OverallMatchScore({ matchId }: OverallMatchScoreProps) {
  const [score, setScore] = useState<OverallScore | null>(null);
  const [games, setGames] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOverallScore = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch overall score
        const scoreResponse = await fetch(`/api/matches/${matchId}/overall-score`);
        if (!scoreResponse.ok) {
          throw new Error('Failed to fetch overall score');
        }
        const scoreData = await scoreResponse.json();
        setScore(scoreData);

        // Fetch game results
        const gamesResponse = await fetch(`/api/matches/${matchId}/games-with-results`);
        if (!gamesResponse.ok) {
          throw new Error('Failed to fetch game results');
        }
        const gamesData = await gamesResponse.json();
        setGames(gamesData.games || []);

      } catch (err) {
        console.error('Error fetching overall match score:', err);
        setError(err instanceof Error ? err.message : 'Failed to load match score');
      } finally {
        setLoading(false);
      }
    };

    if (matchId) {
      fetchOverallScore();
    }
  }, [matchId]);

  if (loading) {
    return (
      <Card withBorder p="md">
        <Group justify="center">
          <Loader size="sm" />
          <Text size="sm">Loading match score...</Text>
        </Group>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert color="red">
        {error}
      </Alert>
    );
  }

  if (!score) {
    return (
      <Card withBorder p="md">
        <Text size="sm" c="dimmed" ta="center">No score data available</Text>
      </Card>
    );
  }

  const getOverallWinnerDisplay = () => {
    if (!score.overallWinner) return null;
    
    switch (score.overallWinner) {
      case 'team1':
        return { text: 'Blue Team Wins Overall', color: 'blue' };
      case 'team2':
        return { text: 'Red Team Wins Overall', color: 'red' };
      case 'tie':
        return { text: 'Match Tied', color: 'gray' };
      default:
        return null;
    }
  };

  const overallWinner = getOverallWinnerDisplay();
  const totalGames = games.length;
  const normalGames = games.filter(g => !g.is_ffa_mode).length;
  const ffaGames = games.filter(g => g.is_ffa_mode).length;

  return (
    <Card withBorder p="md">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="sm">
            <IconTrophy size={20} color="gold" />
            <Text fw={600} size="lg">Overall Match Score</Text>
          </Group>
          {overallWinner && (
            <Badge size="lg" color={overallWinner.color} variant="filled">
              {overallWinner.text}
            </Badge>
          )}
        </Group>

        {/* Team Scores */}
        {score.totalNormalGames > 0 && (
          <>
            <Grid grow>
              <Grid.Col span={6}>
                <Card withBorder p="sm" style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
                  <Stack gap="xs" align="center">
                    <Text fw={600} size="sm" c="blue">Blue Team</Text>
                    <Text size="xl" fw={700} c="blue">{score.team1Wins}</Text>
                    <Text size="xs" c="dimmed">Maps Won</Text>
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={6}>
                <Card withBorder p="sm" style={{ backgroundColor: 'var(--mantine-color-red-0)' }}>
                  <Stack gap="xs" align="center">
                    <Text fw={600} size="sm" c="red">Red Team</Text>
                    <Text size="xl" fw={700} c="red">{score.team2Wins}</Text>
                    <Text size="xs" c="dimmed">Maps Won</Text>
                  </Stack>
                </Card>
              </Grid.Col>
            </Grid>

            {/* Progress Bar */}
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" fw={500}>Team Map Progress</Text>
                <Text size="xs" c="dimmed">
                  {score.team1Wins + score.team2Wins} of {score.totalNormalGames} team maps completed
                </Text>
              </Group>
              <Progress.Root size="lg">
                <Progress.Section 
                  value={(score.team1Wins / score.totalNormalGames) * 100} 
                  color="blue"
                />
                <Progress.Section 
                  value={(score.team2Wins / score.totalNormalGames) * 100} 
                  color="red"
                />
              </Progress.Root>
            </Stack>
          </>
        )}

        <Divider />

        {/* Match Stats */}
        <Grid grow>
          <Grid.Col span={4}>
            <Group gap="xs">
              <IconTarget size={16} color="gray" />
              <div>
                <Text size="sm" fw={500}>{totalGames}</Text>
                <Text size="xs" c="dimmed">Total Maps</Text>
              </div>
            </Group>
          </Grid.Col>
          <Grid.Col span={4}>
            <Group gap="xs">
              <IconUsers size={16} color="blue" />
              <div>
                <Text size="sm" fw={500}>{normalGames}</Text>
                <Text size="xs" c="dimmed">Team Maps</Text>
              </div>
            </Group>
          </Grid.Col>
          <Grid.Col span={4}>
            <Group gap="xs">
              <IconTrophy size={16} color="violet" />
              <div>
                <Text size="sm" fw={500}>{ffaGames}</Text>
                <Text size="xs" c="dimmed">FFA Maps</Text>
              </div>
            </Group>
          </Grid.Col>
        </Grid>

        {/* Game Results Summary */}
        {games.length > 0 && (
          <>
            <Divider />
            <Stack gap="xs">
              <Text size="sm" fw={500}>Map Results</Text>
              {games.map((game) => (
                <Group key={game.id} justify="space-between" p="xs" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 4 }}>
                  <Group gap="sm">
                    <Text size="sm" fw={500}>Map {game.round}</Text>
                    <Text size="xs" c="dimmed">{game.map_name}</Text>
                    {game.is_ffa_mode && (
                      <Badge size="xs" color="violet" variant="outline">FFA</Badge>
                    )}
                  </Group>
                  {game.status === 'completed' ? (
                    game.is_ffa_mode ? (
                      <Badge size="sm" color="violet">
                        {game.participant_winner_name || 'Unknown'} Wins
                      </Badge>
                    ) : (
                      <Badge size="sm" color={game.winner_id === 'team1' ? 'blue' : 'red'}>
                        {game.winner_id === 'team1' ? 'Blue' : 'Red'} Team
                      </Badge>
                    )
                  ) : (
                    <Badge size="sm" color="gray" variant="outline">
                      {game.status}
                    </Badge>
                  )}
                </Group>
              ))}
            </Stack>
          </>
        )}

        {/* No games message */}
        {games.length === 0 && (
          <Text size="sm" c="dimmed" ta="center">
            No games configured for this match
          </Text>
        )}
      </Stack>
    </Card>
  );
}