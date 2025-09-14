'use client'

import { useState } from 'react';
import { 
  Stack,
  Group,
  Text,
  Button,
  Card,
  Badge,
  SegmentedControl,
  Grid,
  Select,
  Divider
} from '@mantine/core';
import { IconTrophy, IconNetwork } from '@tabler/icons-react';

interface BracketMatch {
  id: string;
  round: number;
  bracket_type: 'winners' | 'losers' | 'final';
  team1?: {
    id: string;
    name: string;
  };
  team2?: {
    id: string;
    name: string;
  };
  winner?: string;
  status: 'pending' | 'ongoing' | 'completed';
}

interface BracketTeam {
  id: string;
  name: string;
  members: Array<{
    id: string;
    username: string;
  }>;
}

interface TournamentBracketProps {
  tournamentId: string;
  format: 'single-elimination' | 'double-elimination';
  teams: BracketTeam[];
  matches: BracketMatch[];
  onGenerateMatches?: () => void;
  isAssignMode?: boolean;
  onBracketAssignment?: (assignments: BracketAssignment[]) => void;
}

interface BracketAssignment {
  position: number;
  teamId: string;
}

export function TournamentBracket({ 
  format, 
  teams, 
  matches, 
  onGenerateMatches,
  isAssignMode = false,
  onBracketAssignment
}: TournamentBracketProps) {
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('list');
  const [bracketAssignments, setBracketAssignments] = useState<BracketAssignment[]>([]);
  const [draggedTeam, setDraggedTeam] = useState<string | null>(null);

  const getMatchesByRound = (bracketType: 'winners' | 'losers' | 'final') => {
    const filteredMatches = matches.filter(m => m.bracket_type === bracketType);
    const rounds = new Map<number, BracketMatch[]>();
    
    filteredMatches.forEach(match => {
      if (!rounds.has(match.round)) {
        rounds.set(match.round, []);
      }
      rounds.get(match.round)!.push(match);
    });
    
    return Array.from(rounds.entries()).sort(([a], [b]) => a - b);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'green';
      case 'ongoing': return 'blue';
      default: return 'gray';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Complete';
      case 'ongoing': return 'In Progress';
      default: return 'Pending';
    }
  };

  const calculateBracketSlots = () => {
    // Calculate number of first round slots needed
    // For single elimination, we need power of 2 >= teams.length
    const teamCount = teams.length;
    if (teamCount < 2) return 2;
    
    let slots = 2;
    while (slots < teamCount) {
      slots *= 2;
    }
    return slots;
  };

  const getTeamFromAssignment = (position: number) => {
    const assignment = bracketAssignments.find(a => a.position === position);
    return assignment ? teams.find(t => t.id === assignment.teamId) : null;
  };

  const handleBracketAssignment = (position: number, teamId: string | null) => {
    setBracketAssignments(prev => {
      // Remove any existing assignment for this team
      const filtered = prev.filter(a => a.teamId !== teamId && a.position !== position);
      
      // Add new assignment if teamId is provided
      if (teamId) {
        return [...filtered, { position, teamId }];
      }
      return filtered;
    });
  };

  const handleDragStart = (e: React.DragEvent, teamId: string) => {
    setDraggedTeam(teamId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, position: number) => {
    e.preventDefault();
    if (draggedTeam) {
      handleBracketAssignment(position, draggedTeam);
      setDraggedTeam(null);
    }
  };

  const getUnassignedTeams = () => {
    const assignedTeamIds = bracketAssignments.map(a => a.teamId);
    return teams.filter(t => !assignedTeamIds.includes(t.id));
  };

  const handleGenerateMatches = () => {
    if (onBracketAssignment) {
      onBracketAssignment(bracketAssignments);
    }
    if (onGenerateMatches) {
      onGenerateMatches();
    }
  };

  const isAllSlotsAssigned = () => {
    const requiredSlots = Math.min(calculateBracketSlots(), teams.length);
    return bracketAssignments.length >= requiredSlots;
  };

  const renderMatchCard = (match: BracketMatch) => (
    <Card key={match.id} withBorder p="sm" style={{ minWidth: '200px' }}>
      <Stack gap="xs">
        <Group justify="space-between">
          <Badge size="xs" color={getStatusColor(match.status)}>
            {getStatusLabel(match.status)}
          </Badge>
          <Text size="xs" c="dimmed">
            Round {match.round}
          </Text>
        </Group>
        
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" fw={match.winner === match.team1?.id ? 600 : 400}>
              {match.team1?.name || 'TBD'}
            </Text>
            {match.winner === match.team1?.id && (
              <IconTrophy size="1rem" color="gold" />
            )}
          </Group>
          
          <Text size="xs" c="dimmed" ta="center">vs</Text>
          
          <Group justify="space-between">
            <Text size="sm" fw={match.winner === match.team2?.id ? 600 : 400}>
              {match.team2?.name || 'TBD'}
            </Text>
            {match.winner === match.team2?.id && (
              <IconTrophy size="1rem" color="gold" />
            )}
          </Group>
        </Stack>
      </Stack>
    </Card>
  );

  const renderListView = () => {
    const winnersRounds = getMatchesByRound('winners');
    const losersRounds = format === 'double-elimination' ? getMatchesByRound('losers') : [];
    const finalMatches = getMatchesByRound('final');

    return (
      <Stack gap="xl">
        {/* Winner's Bracket */}
        <div>
          <Group mb="md">
            <IconTrophy size="1.2rem" />
            <Text size="lg" fw={600}>Winners Bracket</Text>
          </Group>
          
          {winnersRounds.length > 0 ? (
            winnersRounds.map(([round, roundMatches]) => (
              <div key={`winners-${round}`}>
                <Text size="md" fw={500} mb="sm">Round {round}</Text>
                <Grid mb="lg">
                  {roundMatches.map((match) => (
                    <Grid.Col key={match.id} span={{ base: 12, sm: 6, md: 4 }}>
                      {renderMatchCard(match)}
                    </Grid.Col>
                  ))}
                </Grid>
              </div>
            ))
          ) : (
            <Text c="dimmed" fs="italic">No matches generated yet</Text>
          )}
        </div>

        {/* Loser's Bracket (Double Elimination only) */}
        {format === 'double-elimination' && (
          <div>
            <Group mb="md">
              <Text size="lg" fw={600}>Losers Bracket</Text>
            </Group>
            
            {losersRounds.length > 0 ? (
              losersRounds.map(([round, roundMatches]) => (
                <div key={`losers-${round}`}>
                  <Text size="md" fw={500} mb="sm">Round {round}</Text>
                  <Grid mb="lg">
                    {roundMatches.map((match) => (
                      <Grid.Col key={match.id} span={{ base: 12, sm: 6, md: 4 }}>
                        {renderMatchCard(match)}
                      </Grid.Col>
                    ))}
                  </Grid>
                </div>
              ))
            ) : (
              <Text c="dimmed" fs="italic">No matches generated yet</Text>
            )}
          </div>
        )}

        {/* Finals */}
        {finalMatches.length > 0 && (
          <div>
            <Group mb="md">
              <IconTrophy size="1.2rem" color="gold" />
              <Text size="lg" fw={600}>Finals</Text>
            </Group>
            
            <Grid>
              {finalMatches.flatMap(([, roundMatches]) => roundMatches).map((match) => (
                <Grid.Col key={match.id} span={{ base: 12, sm: 8, md: 6 }}>
                  {renderMatchCard(match)}
                </Grid.Col>
              ))}
            </Grid>
          </div>
        )}
      </Stack>
    );
  };

  const renderTreeView = () => {
    if (isAssignMode) {
      return renderBracketAssignment();
    }
    
    return (
      <Card withBorder p="xl">
        <Stack align="center">
          <IconNetwork size="3rem" color="gray" />
          <Text size="lg" c="dimmed">Tree View</Text>
          <Text size="sm" c="dimmed" ta="center">
            Visual bracket tree will be implemented in a future update.
            <br />
            Use List View to see all matches organized by rounds.
          </Text>
        </Stack>
      </Card>
    );
  };

  const renderBracketSlot = (position: number) => {
    const assignedTeam = getTeamFromAssignment(position);
    const slotNumber = position + 1;
    
    return (
      <Card
        key={position}
        withBorder
        p="md"
        style={{ minHeight: '100px', cursor: 'pointer' }}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, position)}
      >
        <Stack gap="xs">
          <Group justify="space-between">
            <Badge size="sm" variant="light">
              Slot {slotNumber}
            </Badge>
            {assignedTeam && (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => handleBracketAssignment(position, null)}
              >
                ✕
              </Button>
            )}
          </Group>
          
          {assignedTeam ? (
            <Group>
              <Text fw={500}>{assignedTeam.name}</Text>
              <Badge size="xs" color="blue">
                {assignedTeam.members.length} members
              </Badge>
            </Group>
          ) : (
            <Text size="sm" c="dimmed" ta="center">
              Drop team here
            </Text>
          )}
          
          <Select
            placeholder="Select team"
            value={assignedTeam?.id || ''}
            onChange={(value) => handleBracketAssignment(position, value)}
            data={[
              { value: '', label: 'No team' },
              ...getUnassignedTeams().map(team => ({
                value: team.id,
                label: team.name
              })),
              ...(assignedTeam ? [{ value: assignedTeam.id, label: assignedTeam.name }] : [])
            ]}
            size="xs"
          />
        </Stack>
      </Card>
    );
  };

  const renderBracketAssignment = () => {
    const totalSlots = calculateBracketSlots();
    const unassignedTeams = getUnassignedTeams();
    
    return (
      <Stack gap="md">
        {/* Unassigned teams */}
        {unassignedTeams.length > 0 && (
          <Card withBorder p="md">
            <Text size="sm" fw={500} mb="sm">Available Teams (drag to bracket slots)</Text>
            <Grid>
              {unassignedTeams.map((team) => (
                <Grid.Col key={team.id} span={{ base: 6, sm: 4, md: 3 }}>
                  <Card
                    withBorder
                    p="xs"
                    style={{ cursor: 'grab' }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, team.id)}
                  >
                    <Group gap="xs">
                      <Text size="sm" fw={500}>{team.name}</Text>
                      <Badge size="xs" variant="light">
                        {team.members.length}
                      </Badge>
                    </Group>
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
          </Card>
        )}
        
        <Divider />
        
        {/* Bracket slots */}
        <div>
          <Group justify="space-between" mb="md">
            <Text size="lg" fw={600}>First Round Bracket</Text>
            <Badge variant="light">
              {bracketAssignments.length} / {Math.min(totalSlots, teams.length)} assigned
            </Badge>
          </Group>
          
          <Grid>
            {Array.from({ length: Math.min(totalSlots, teams.length) }).map((_, index) => (
              <Grid.Col key={index} span={{ base: 12, sm: 6, md: 4 }}>
                {renderBracketSlot(index)}
              </Grid.Col>
            ))}
          </Grid>
        </div>
        
        <Divider />
        
        {/* Generate matches section */}
        <Group justify="center">
          <Button
            size="lg"
            onClick={handleGenerateMatches}
            disabled={!isAllSlotsAssigned() || teams.length < 2}
            color="green"
          >
            Generate First Round Matches
          </Button>
        </Group>
        
        {!isAllSlotsAssigned() && teams.length >= 2 && (
          <Text size="sm" c="orange" ta="center">
            Please assign all teams to bracket positions before generating matches
          </Text>
        )}
        
        {teams.length < 2 && (
          <Text size="sm" c="red" ta="center">
            At least 2 teams are required to generate matches
          </Text>
        )}
      </Stack>
    );
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group>
          <Text size="lg" fw={600}>Tournament Bracket</Text>
          <Badge variant="light">
            {format === 'single-elimination' ? 'Single Elimination' : 'Double Elimination'}
          </Badge>
        </Group>

        <Group>
          {matches.length === 0 && onGenerateMatches && !isAssignMode && (
            <Button
              onClick={onGenerateMatches}
              disabled={teams.length < 2}
            >
              Generate First Matches
            </Button>
          )}
          
          <SegmentedControl
            value={viewMode}
            onChange={(value) => setViewMode(value as 'tree' | 'list')}
            data={[
              { label: 'List', value: 'list' },
              { label: isAssignMode ? 'Assignment' : 'Tree', value: 'tree' }
            ]}
          />
        </Group>
      </Group>

      {viewMode === 'list' ? renderListView() : renderTreeView()}
    </Stack>
  );
}