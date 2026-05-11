'use client'

import type { JSX } from 'react';
import { Text, Stack, TextInput, Textarea, Group, Select, Checkbox, Button, Divider } from '@mantine/core';
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
  hasStatDefs: boolean;
  aiProvidersConfigured: boolean;
}

export function EventInfoStep({
  formData,
  imagePreview,
  updateFormData,
  onBack,
  onNext,
  onImageUpload,
  onRemoveImage,
  uploadingImage,
  hasStatDefs,
  aiProvidersConfigured,
}: EventInfoStepProps): JSX.Element {
  return (
    <Stack gap="xl">

      {/* Core event details */}
      <Stack gap="md">
        <TextInput
          label="Event Name"
          placeholder="Enter match name"
          required
          value={formData.name || ''}
          onChange={(e) => updateFormData('name', e.target.value)}
        />

        <Group grow align="flex-start">
          <DateTimePicker
            label="Date & Time"
            placeholder="Pick date and time"
            required
            value={formData.dateTime ?? null}
            onChange={(val) => updateFormData('dateTime', val)}
            minDate={new Date()}
            timePickerProps={{ format: '12h' }}
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
        </Group>
      </Stack>

      {/* Optional details */}
      <Stack gap="md">
        <Divider
          label={
            <Text size="xs" fw={500} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              Optional Details
            </Text>
          }
          labelPosition="left"
        />

        <Textarea
          label="Description"
          placeholder="Enter match description"
          value={formData.description || ''}
          onChange={(e) => updateFormData('description', e.target.value)}
          rows={3}
        />

        <TextInput
          label="Livestream Link"
          placeholder="https://twitch.tv/..."
          value={formData.livestreamLink || ''}
          onChange={(e) => updateFormData('livestreamLink', e.target.value)}
        />
      </Stack>

      {/* Match options */}
      <Stack gap="md">
        <Divider
          label={
            <Text size="xs" fw={500} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              Options
            </Text>
          }
          labelPosition="left"
        />

        <Stack gap="sm">
          <Checkbox
            label="Player Notifications"
            description="Send Discord DMs to registered players before match starts"
            checked={formData.playerNotifications ?? true}
            onChange={(event) => updateFormData('playerNotifications', event.currentTarget.checked)}
          />

          {hasStatDefs && (
            <Checkbox
              label="Enable Stats Collection"
              description="Upload scorecards after each map to extract player stats with AI"
              checked={formData.statsEnabled ?? false}
              onChange={(event) => updateFormData('statsEnabled', event.currentTarget.checked)}
              disabled={!aiProvidersConfigured}
            />
          )}
        </Stack>
      </Stack>

      {/* Event image */}
      <Stack gap="md">
        <Divider
          label={
            <Text size="xs" fw={500} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
              Media
            </Text>
          }
          labelPosition="left"
        />

        <EventImageUpload
          imagePreview={imagePreview}
          uploadingImage={uploadingImage}
          onImageUpload={onImageUpload}
          onRemoveImage={onRemoveImage}
        />
      </Stack>

      <Group justify="space-between" gap="xs">
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
