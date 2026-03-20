'use client'

import { useState, useRef } from 'react';
import { Button, Group, Text, Stack, SegmentedControl, Paper, Alert, Loader } from '@mantine/core';
import { IconUpload, IconPhoto, IconCheck, IconX } from '@tabler/icons-react';
import { showSuccess, showError } from '@/lib/notifications';

interface ScorecardUploadProps {
  matchId: string;
  matchGameId: string;
  onUploadComplete: (submissionId: string) => void;
  onCancel?: () => void;
}

export function ScorecardUpload({ matchId, matchGameId, onUploadComplete, onCancel }: ScorecardUploadProps) {
  const [teamSide, setTeamSide] = useState<'blue' | 'red'>('blue');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('screenshot', selectedFile);
      formData.append('matchGameId', matchGameId);
      formData.append('teamSide', teamSide);

      const res = await fetch(`/api/matches/${matchId}/scorecard`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Upload failed');
      }

      const data = await res.json() as { submissionId: string };
      showSuccess('Scorecard uploaded! Processing stats...');
      onUploadComplete(data.submissionId);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Stack gap="md">
      <Text fw={600}>Upload Scorecard</Text>

      <div>
        <Text size="sm" mb={6}>Team Side</Text>
        <SegmentedControl
          value={teamSide}
          onChange={(v) => setTeamSide(v as 'blue' | 'red')}
          data={[
            { label: 'Blue Team', value: 'blue' },
            { label: 'Red Team', value: 'red' },
          ]}
          color={teamSide === 'blue' ? 'blue' : 'red'}
        />
      </div>

      {/* Drop zone */}
      <Paper
        withBorder
        p="xl"
        style={{
          cursor: 'pointer',
          borderStyle: 'dashed',
          textAlign: 'center',
          borderColor: selectedFile ? 'var(--mantine-color-green-5)' : undefined,
        }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />

        {selectedFile ? (
          <Stack align="center" gap="xs">
            <IconCheck size={32} color="var(--mantine-color-green-6)" />
            <Text size="sm" fw={500}>{selectedFile.name}</Text>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginTop: 8 }}
              />
            )}
          </Stack>
        ) : (
          <Stack align="center" gap="xs">
            <IconPhoto size={32} color="var(--mantine-color-dimmed)" />
            <Text size="sm" c="dimmed">Drag & drop or click to select a scorecard screenshot</Text>
            <IconUpload size={16} color="var(--mantine-color-dimmed)" />
          </Stack>
        )}
      </Paper>

      {selectedFile && (
        <Alert color="blue" variant="light">
          Screenshot selected. Click Upload to submit for AI analysis.
        </Alert>
      )}

      <Group justify="flex-end">
        {onCancel && (
          <Button variant="subtle" onClick={onCancel} leftSection={<IconX size={14} />}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          loading={uploading}
          leftSection={uploading ? <Loader size={14} /> : <IconUpload size={14} />}
        >
          Upload Scorecard
        </Button>
      </Group>
    </Stack>
  );
}
