'use client'

import { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
  Select,
  SelectItem,
  Avatar
} from '@heroui/react';
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
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    gameId: '',
    guildId: 'demo_guild_123', // For demo purposes
    channelId: 'demo_channel_456', // For demo purposes
    maxParticipants: 16
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Tournament name is required';
    }

    if (!formData.gameId) {
      newErrors.gameId = 'Please select a game';
    }

    if (formData.maxParticipants < 2 || formData.maxParticipants > 64) {
      newErrors.maxParticipants = 'Participants must be between 2 and 64';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const tournament = await response.json();
        onTournamentCreated(tournament);
        resetForm();
      } else {
        const error = await response.json();
        setErrors({ submit: error.error || 'Failed to create tournament' });
      }
    } catch (error) {
      setErrors({ submit: 'Network error occurred' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      gameId: '',
      guildId: 'demo_guild_123',
      channelId: 'demo_channel_456',
      maxParticipants: 16
    });
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleClose}
      size="2xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          Create New Tournament
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Tournament Name"
              placeholder="Enter tournament name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              isInvalid={!!errors.name}
              errorMessage={errors.name}
              isRequired
            />

            <Textarea
              label="Description"
              placeholder="Enter tournament description (optional)"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              maxRows={3}
            />

            <Select
              label="Game"
              placeholder="Select a game"
              selectedKeys={formData.gameId ? [formData.gameId] : []}
              onSelectionChange={(keys) => {
                const selectedKey = Array.from(keys)[0] as string;
                setFormData(prev => ({ ...prev, gameId: selectedKey || '' }));
              }}
              isInvalid={!!errors.gameId}
              errorMessage={errors.gameId}
              isRequired
            >
              {games.map((game) => (
                <SelectItem key={game.id} value={game.id}>
                  <div className="flex items-center gap-2">
                    <Avatar
                      src={game.icon_url}
                      name={game.name}
                      size="sm"
                    />
                    <div>
                      <div className="font-semibold">{game.name}</div>
                      <div className="text-small text-default-500">{game.genre}</div>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </Select>

            <Input
              label="Max Participants"
              type="number"
              min={2}
              max={64}
              value={formData.maxParticipants.toString()}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                maxParticipants: parseInt(e.target.value) || 16 
              }))}
              isInvalid={!!errors.maxParticipants}
              errorMessage={errors.maxParticipants}
            />

            <div className="text-small text-default-500 bg-default-100 p-3 rounded-lg">
              <p className="font-semibold mb-1">Demo Mode</p>
              <p>Guild ID: {formData.guildId}</p>
              <p>Channel ID: {formData.channelId}</p>
            </div>

            {errors.submit && (
              <div className="text-danger text-small p-2 bg-danger-50 rounded">
                {errors.submit}
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button 
            color="danger" 
            variant="light" 
            onPress={handleClose}
            isDisabled={loading}
          >
            Cancel
          </Button>
          <Button 
            color="primary" 
            onPress={handleSubmit}
            isLoading={loading}
          >
            Create Tournament
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}