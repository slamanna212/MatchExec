'use client'

import { Text, Stack, TextInput, Textarea, Group, Select, Checkbox, Button } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
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

      <DateTimePicker
        label="Date & Time"
        placeholder="Pick date and time"
        required
        value={formData.dateTime ?? null}
        onChange={(val) => updateFormData('dateTime', val)}
        minDate={new Date()}
        timePickerProps={{ format: '12h' }}
      />

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
          disabled={!formData.name || !formData.dateTime}
        >
          Next
        </Button>
      </Group>
    </Stack>
  );
}
