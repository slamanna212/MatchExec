'use client'

import { Text, Stack, TextInput, Textarea, Group, Select, Checkbox, Button } from '@mantine/core';
import type { MatchFormData } from './useMatchForm';
import { EventImageUpload } from './EventImageUpload';

interface EventInfoStepProps {
  formData: Partial<MatchFormData>;
  imagePreview: string | null;
  updateFormData: (field: keyof MatchFormData, value: unknown) => void;
  onBack: () => void;
  onNext: () => void;
  onImageUpload: (file: File | null) => Promise<void>;
  onRemoveImage: () => Promise<void>;
  uploadingImage: boolean;
}

export function EventInfoStep({
  formData,
  imagePreview,
  updateFormData,
  onBack,
  onNext,
  onImageUpload,
  onRemoveImage,
  uploadingImage
}: EventInfoStepProps) {
  return (
    <Stack>
      <Text mb="md">Enter event information:</Text>

      <TextInput
        label="Event Name"
        placeholder="Enter match name"
        required
        value={formData.name || ''}
        onChange={(e) => updateFormData('name', e.target.value)}
      />

      <Textarea
        label="Description"
        placeholder="Enter match description (optional)"
        value={formData.description || ''}
        onChange={(e) => updateFormData('description', e.target.value)}
        rows={3}
      />

      <Group grow>
        <TextInput
          label="Date"
          type="date"
          required
          value={formData.date || ''}
          onChange={(e) => updateFormData('date', e.target.value)}
          min={new Date().toISOString().split('T')[0]}
        />
        <TextInput
          label="Time"
          type="time"
          required
          value={formData.time || ''}
          onChange={(e) => updateFormData('time', e.target.value)}
          step="60"
        />
      </Group>

      <TextInput
        label="Livestream Link"
        placeholder="https://twitch.tv/... (optional)"
        value={formData.livestreamLink || ''}
        onChange={(e) => updateFormData('livestreamLink', e.target.value)}
      />

      <Select
        label="Rules Type"
        placeholder="Select rules type"
        required
        value={formData.rules}
        onChange={(value) => updateFormData('rules', value)}
        data={[
          { value: 'casual', label: 'Casual' },
          { value: 'competitive', label: 'Competitive' }
        ]}
      />

      <Checkbox
        label="Player Notifications"
        description="Send Discord DMs to registered players before match starts"
        checked={formData.playerNotifications ?? true}
        onChange={(event) => updateFormData('playerNotifications', event.currentTarget.checked)}
      />

      <EventImageUpload
        imagePreview={imagePreview}
        uploadingImage={uploadingImage}
        onImageUpload={onImageUpload}
        onRemoveImage={onRemoveImage}
      />

      <Group justify="space-between" mt="md" gap="xs">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!formData.name || !formData.date || !formData.time}
        >
          Next
        </Button>
      </Group>
    </Stack>
  );
}
