'use client'

import { Modal, Button, Text } from '@mantine/core';
import { Match, Game } from '../../shared/types';

interface CreateMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMatchCreated: (match: Match) => void;
  games: Game[];
}

export function CreateMatchModal({
  isOpen,
  onClose,
  onMatchCreated,
  games
}: CreateMatchModalProps) {
  return (
    <Modal opened={isOpen} onClose={onClose} title="Create Match">
      <Text mb="md">
        Match creation feature is being updated to work with the new UI library.
        This will be implemented soon.
      </Text>
      <Button onClick={onClose}>Close</Button>
    </Modal>
  );
}