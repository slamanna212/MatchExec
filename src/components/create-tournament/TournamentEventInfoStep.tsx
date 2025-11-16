'use client'

import { Text, Stack, TextInput, Textarea, Group, Select, NumberInput, Switch, Button } from '@mantine/core';
import type { TournamentFormData } from '../create-tournament/useTournamentForm';
import { EventImageUpload } from '../create-match/EventImageUpload';

interface TournamentEventInfoStepProps {
  formData: Partial<TournamentFormData>;
  imagePreview: string | null;
  uploadingImage: boolean;
  updateFormData: (key: keyof TournamentFormData, value: unknown) => void;
  onImageUpload: (file: File | null) => Promise<void>;
  onRemoveImage: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
  canProceed: boolean;
}

export function TournamentEventInfoStep({
  formData,
  imagePreview,
  uploadingImage,
  updateFormData,
  onImageUpload,
  onRemoveImage,
  onBack,
  onNext,
  canProceed
}: TournamentEventInfoStepProps) {
  return (
    <Stack>
      <Text mb="md">Enter tournament information:</Text>

      <TextInput
        label="Tournament Name"
        placeholder="Enter tournament name"
        required
        value={formData.name || ''}
        onChange={(e) => updateFormData('name', e.target.value)}
      />

      <Textarea
        label="Description"
        placeholder="Tournament description (optional)"
        minRows={3}
        value={formData.description || ''}
        onChange={(e) => updateFormData('description', e.target.value)}
      />

      <Group grow>
        <TextInput
          label="Start Date"
          type="date"
          value={formData.date || ''}
          onChange={(e) => updateFormData('date', e.target.value)}
        />
        <TextInput
          label="Start Time"
          type="time"
          value={formData.time || ''}
          onChange={(e) => updateFormData('time', e.target.value)}
        />
      </Group>

      <NumberInput
        label="Rounds per Match"
        description="Number of rounds to play in each tournament match"
        required
        min={1}
        max={9}
        value={formData.roundsPerMatch || 3}
        onChange={(value) => updateFormData('roundsPerMatch', value || 3)}
      />

      <Select
        label="Ruleset"
        description="Tournament ruleset that will apply to all matches"
        required
        data={[
          { value: 'casual', label: 'Casual' },
          { value: 'competitive', label: 'Competitive' }
        ]}
        value={formData.ruleset || 'casual'}
        onChange={(value) => updateFormData('ruleset', value || 'casual')}
      />

      <Switch
        label="Allow Players to Select Teams"
        description="When enabled, players can choose their team during signup (only works if teams are pre-created in Step 3)"
        checked={formData.allowPlayerTeamSelection || false}
        onChange={(e) => updateFormData('allowPlayerTeamSelection', e.currentTarget.checked)}
      />

      <EventImageUpload
        imagePreview={imagePreview}
        uploadingImage={uploadingImage}
        onImageUpload={onImageUpload}
        onRemoveImage={onRemoveImage}
      />

      <Group justify="space-between" mt="md">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!canProceed}>
          Next: Tournament Format
        </Button>
      </Group>
    </Stack>
  );
}
