'use client'

import { Modal, Button, Text } from '@mantine/core';
import { Tournament, Game } from '@/shared/types';

interface CreateTournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTournamentCreated: (tournament: Tournament) => void;
  games: Game[];
}

export function CreateTournamentModal({
  isOpen,
  onClose,
  onTournamentCreated,
  games
}: CreateTournamentModalProps) {
  return (
    <Modal opened={isOpen} onClose={onClose} title="Create Tournament">
      <Text mb="md">
        Tournament creation feature is being updated to work with the new UI library.
        This will be implemented soon.
      </Text>
      <Button onClick={onClose}>Close</Button>
    </Modal>
  );
}