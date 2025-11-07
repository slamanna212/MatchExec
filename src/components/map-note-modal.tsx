'use client'

import { useState, useEffect } from 'react';
import { Modal, TextInput, Group, Button, Text, Stack } from '@mantine/core';

interface MapNoteModalProps {
  opened: boolean;
  onClose: () => void;
  mapName: string;
  initialNote: string;
  onSave: (note: string) => void;
}

export function MapNoteModal({ 
  opened, 
  onClose, 
  mapName, 
  initialNote, 
  onSave 
}: MapNoteModalProps) {
  const [note, setNote] = useState(initialNote);

  // Reset note when modal opens with new data
  useEffect(() => {
    if (opened) {
      // Use requestAnimationFrame to avoid synchronous setState in effect
      const frame = requestAnimationFrame(() => {
        setNote(initialNote);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [initialNote, opened]);

  const handleSave = () => {
    onSave(note.trim());
    onClose();
  };

  const handleCancel = () => {
    setNote(initialNote); // Reset to original value
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleCancel}
      title={`Map Note - ${mapName}`}
      size="md"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Add a note for this map (optional). This note will appear wherever this map is displayed.
        </Text>
        
        <TextInput
          label="Note"
          placeholder="Enter a note for this map..."
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          maxLength={64}
          description={`${note.length}/64 characters`}
          autoFocus
        />
        
        <Group justify="flex-end" gap="sm">
          <Button 
            variant="outline" 
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}