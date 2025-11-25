'use client'

import { Box, Text, Card, Group, ActionIcon, Image, FileButton, Stack } from '@mantine/core';
import { IconUpload, IconTrash } from '@tabler/icons-react';

interface EventImageUploadProps {
  imagePreview: string | null;
  uploadingImage: boolean;
  onImageUpload: (file: File | null) => Promise<void>;
  onRemoveImage: () => Promise<void>;
}

export function EventImageUpload({
  imagePreview,
  uploadingImage,
  onImageUpload,
  onRemoveImage
}: EventImageUploadProps) {
  return (
    <Box>
      <Text size="sm" fw={500} mb="xs">Event Image (Optional)</Text>
      {imagePreview ? (
        <Card withBorder padding="md">
          <Group justify="space-between" mb="md">
            <Text size="sm" c="dimmed">Current Image:</Text>
            <ActionIcon
              color="red"
              variant="light"
              onClick={onRemoveImage}
              disabled={uploadingImage}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
          <Image
            src={imagePreview}
            alt="Event preview"
            height={200}
            radius="md"
            fit="cover"
          />
        </Card>
      ) : (
        <FileButton
          onChange={onImageUpload}
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={uploadingImage}
        >
          {(props) => (
            <Card
              {...props}
              withBorder
              padding="md"
              className="cursor-pointer hover:shadow-md transition-shadow"
              style={{
                borderStyle: 'dashed',
                borderColor: 'var(--mantine-color-default-border)',
                backgroundColor: 'var(--mantine-color-body)'
              }}
            >
              <Stack align="center" justify="center" style={{ minHeight: 100 }}>
                <ActionIcon size="xl" variant="light" disabled={uploadingImage}>
                  <IconUpload />
                </ActionIcon>
                <Text size="sm" c="dimmed" ta="center">
                  {uploadingImage ? 'Uploading...' : 'Click to upload event image'}
                </Text>
                <Text size="xs" c="dimmed" ta="center">
                  PNG, JPEG, WebP, GIF up to 5MB
                </Text>
              </Stack>
            </Card>
          )}
        </FileButton>
      )}
    </Box>
  );
}
