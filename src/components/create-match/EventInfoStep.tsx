'use client'

import { Text, Stack, TextInput, Textarea, Group, Select, Checkbox, Button, Tooltip, Box, Group as MGroup } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconSparkles } from '@tabler/icons-react';
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

      {hasStatDefs && (
        <Box
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid color-mix(in srgb, var(--mantine-color-violet-5) 30%, transparent)',
            background: 'color-mix(in srgb, var(--mantine-color-violet-5) 5%, transparent)',
            padding: 'var(--mantine-spacing-sm) var(--mantine-spacing-md)',
          }}
        >
          <MGroup gap="xs" mb={6}>
            <IconSparkles
              size={13}
              style={{ color: 'var(--mantine-color-violet-4)', flexShrink: 0 }}
            />
            <Text size="xs" c="violet.4" fw={600} tt="uppercase" style={{ letterSpacing: '0.05em' }}>
              AI Feature
            </Text>
          </MGroup>

          <Tooltip
            label="Configure AI providers in Settings → Stats to enable this"
            disabled={aiProvidersConfigured}
            position="top-start"
            withArrow
          >
            <div style={{ display: 'inline-block', width: '100%' }}>
              <Checkbox
                label="Enable Stats Collection"
                description="Upload scorecards after each map to extract player stats with AI"
                checked={formData.statsEnabled ?? false}
                onChange={(event) => updateFormData('statsEnabled', event.currentTarget.checked)}
                disabled={!aiProvidersConfigured}
              />
            </div>
          </Tooltip>
        </Box>
      )}

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
