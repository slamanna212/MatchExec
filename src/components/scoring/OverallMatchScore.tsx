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
  position_results?: string;
  points_awarded?: string;
}

interface PositionScore {
  participantScores: Record<string, { username: string; totalPoints: number; races: number }>;
  winner: string | null;
}

export function OverallMatchScore({ matchId }: OverallMatchScoreProps) {
  const [score, setScore] = useState<OverallScore | null>(null);
  const [positionScore, setPositionScore] = useState<PositionScore | null>(null);
  const [games, setGames] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scoringMode, setScoringMode] = useState<'Normal' | 'FFA' | 'Position'>('Normal');

  useEffect(() => {
    const fetchOverallScore = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch game results first to determine scoring mode
        const gamesResponse = await fetch(`/api/matches/${matchId}/games-with-results`);
        if (!gamesResponse.ok) {
          throw new Error('Failed to fetch game results');
        }
        const gamesData = await gamesResponse.json();
        const fetchedGames = gamesData.games || [];
        setGames(fetchedGames);

        // Determine scoring mode from first game
        const hasPositionGames = fetchedGames.some((g: GameResult) => g.position_results);
        if (hasPositionGames) {
          setScoringMode('Position');
          // For position-based, we need a different API endpoint
          // For now, calculate from the games data
          const participantScores: Record<string, { username: string; totalPoints: number; races: number }> = {};

          for (const game of fetchedGames) {
            if (game.points_awarded && game.position_results) {
              const points = JSON.parse(game.points_awarded) as Record<string, number>;
              const positions = JSON.parse(game.position_results) as Record<string, number>;

              for (const [participantId, pointsEarned] of Object.entries(points)) {
                if (!participantScores[participantId]) {
                  participantScores[participantId] = {
                    username: participantId, // We'd need to fetch this
                    totalPoints: 0,
                    races: 0
                  };
                }
                participantScores[participantId].totalPoints += pointsEarned;
                participantScores[participantId].races += 1;
              }
            }
          }

          // Determine winner
          let winner: string | null = null;
          let highestPoints = -1;
          for (const [participantId, data] of Object.entries(participantScores)) {
            if (data.totalPoints > highestPoints) {
              highestPoints = data.totalPoints;
              winner = participantId;
            } else if (data.totalPoints === highestPoints) {
              winner = null; // Tie
            }
          }

          setPositionScore({ participantScores, winner });
        } else {
          setScoringMode('Normal');
          // Fetch overall team score
          const scoreResponse = await fetch(`/api/matches/${matchId}/overall-score`);
          if (!scoreResponse.ok) {
            throw new Error('Failed to fetch overall score');
          }
          const scoreData = await scoreResponse.json();
          setScore(scoreData);
        }

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
  const normalGames = games.filter(g => !g.is_ffa_mode && !g.position_results).length;
  const ffaGames = games.filter(g => g.is_ffa_mode).length;
  const positionGames = games.filter(g => g.position_results).length;

  // For Position scoring mode, render leaderboard
  if (scoringMode === 'Position' && positionScore) {
    const sortedParticipants = Object.entries(positionScore.participantScores)
      .sort(([, a], [, b]) => b.totalPoints - a.totalPoints);

    return (
      <Card withBorder p="md">
        <Stack gap="md">
          {/* Header */}
          <Group justify="space-between">
            <Group gap="sm">
              <IconTrophy size={20} color="gold" />
              <Text fw={600} size="lg">Race Leaderboard</Text>
            </Group>
            <Badge size="lg" color="blue" variant="filled">
              Position-Based Scoring
            </Badge>
          </Group>

          {/* Leaderboard */}
          <Stack gap="xs">
            {sortedParticipants.map(([participantId, data], index) => (
              <Card
                key={participantId}
                withBorder
                p="sm"
                style={{
                  backgroundColor: index === 0 ? 'var(--mantine-color-yellow-0)' : undefined
                }}
              >
                <Group justify="space-between">
                  <Group gap="sm">
                    <Badge
                      size="lg"
                      color={index === 0 ? 'yellow' : index === 1 ? 'gray' : index === 2 ? 'orange' : 'blue'}
                      variant={index < 3 ? 'filled' : 'outline'}
                    >
                      {index + 1}
                    </Badge>
                    <Text fw={600}>{data.username}</Text>
                  </Group>
                  <Group gap="md">
                    <div>
                      <Text size="xl" fw={700} ta="right">{data.totalPoints}</Text>
                      <Text size="xs" c="dimmed" ta="right">points</Text>
                    </div>
                    <div>
                      <Text size="sm" fw={500} ta="right">{data.races}</Text>
                      <Text size="xs" c="dimmed" ta="right">races</Text>
                    </div>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>

          <Divider />

          {/* Stats */}
          <Group justify="center">
            <div>
              <Text size="sm" fw={500} ta="center">{positionGames}</Text>
              <Text size="xs" c="dimmed" ta="center">Races Completed</Text>
            </div>
          </Group>
        </Stack>
      </Card>
    );
  }

  // Normal/FFA scoring mode
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