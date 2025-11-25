'use client'

import { Text, Stack, NumberInput, Card, Group, TextInput, Button } from '@mantine/core';
import type { TournamentFormData } from './useTournamentForm';
import { TeamList } from './TeamList';

interface TournamentTeamSettingsStepProps {
  formData: Partial<TournamentFormData>;
  newTeamName: string;
  updateFormData: (key: keyof TournamentFormData, value: unknown) => void;
  onAddTeam: (teamName: string) => void;
  onRemoveTeam: (teamName: string) => void;
  onBack: () => void;
  onNext: () => void;
  setNewTeamName: (name: string) => void;
}

export function TournamentTeamSettingsStep({
  formData,
  newTeamName,
  updateFormData,
  onAddTeam,
  onRemoveTeam,
  onBack,
  onNext,
  setNewTeamName
}: TournamentTeamSettingsStepProps) {
  const handleAddTeamClick = () => {
    if (newTeamName.trim()) {
      onAddTeam(newTeamName);
    }
  };

  return (
    <Stack>
      <Text mb="md">Configure team settings:</Text>

      <NumberInput
        label="Max Participants (Optional)"
        description="Maximum number of players that can register (leave empty for unlimited)"
        min={4}
        max={256}
        value={formData.maxParticipants || ''}
        onChange={(value) => updateFormData('maxParticipants', value || undefined)}
      />

      <Card withBorder p="md" mt="md">
        <Text fw={500} mb="md">Pre-Create Teams (Optional)</Text>
        <Text size="sm" c="dimmed" mb="md">
          Create team names ahead of time. Players can be assigned to these teams during the signup phase.
        </Text>

        <Group mb="md">
          <TextInput
            placeholder="Enter team name"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTeamName.trim()) {
                handleAddTeamClick();
              }
            }}
            style={{ flex: 1 }}
          />
          <Button
            onClick={handleAddTeamClick}
            disabled={!newTeamName.trim()}
          >
            Add Team
          </Button>
        </Group>

        <TeamList
          teams={formData.preCreatedTeams || []}
          onRemoveTeam={onRemoveTeam}
        />
      </Card>

      <Text size="sm" c="dimmed" mt="md">
        <strong>Note:</strong> Maps and modes will be automatically assigned when tournament matches are generated.
        Participants can be assigned to teams during or after the signup phase.
      </Text>

      <Group justify="space-between" mt="md">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>
          Next: Review
        </Button>
      </Group>
    </Stack>
  );
}
