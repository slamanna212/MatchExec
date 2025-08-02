'use client'

import { useState, useEffect } from 'react';
import { 
  Card, 
  CardBody, 
  CardHeader, 
  Button, 
  Chip,
  Avatar,
  Divider,
  Spinner
} from '@heroui/react';
import { Tournament, Game } from '@/shared/types';
import { CreateTournamentModal } from './create-tournament-modal';

interface TournamentWithGame extends Tournament {
  game_name?: string;
  game_icon?: string;
}

export function TournamentDashboard() {
  const [tournaments, setTournaments] = useState<TournamentWithGame[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    fetchTournaments();
    fetchGames();
  }, []);

  const fetchTournaments = async () => {
    try {
      const response = await fetch('/api/tournaments');
      if (response.ok) {
        const data = await response.json();
        setTournaments(data);
      }
    } catch (error) {
      console.error('Error fetching tournaments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async () => {
    try {
      const response = await fetch('/api/games');
      if (response.ok) {
        const data = await response.json();
        setGames(data);
      }
    } catch (error) {
      console.error('Error fetching games:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'created': return 'default';
      case 'registration': return 'primary';
      case 'ongoing': return 'warning';
      case 'completed': return 'success';
      case 'cancelled': return 'danger';
      default: return 'default';
    }
  };

  const handleTournamentCreated = (tournament: Tournament) => {
    setTournaments(prev => [tournament, ...prev]);
    setCreateModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Tournament Dashboard</h1>
          <p className="text-default-500 mt-2">Manage and view all tournaments</p>
        </div>
        <Button 
          color="primary" 
          size="lg"
          onPress={() => setCreateModalOpen(true)}
        >
          Create Tournament
        </Button>
      </div>

      <Divider className="mb-8" />

      {tournaments.length === 0 ? (
        <Card className="p-8">
          <CardBody className="text-center">
            <h3 className="text-xl font-semibold mb-2">No tournaments yet</h3>
            <p className="text-default-500 mb-4">
              Create your first tournament to get started
            </p>
            <Button 
              color="primary"
              onPress={() => setCreateModalOpen(true)}
            >
              Create Tournament
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament) => (
            <Card key={tournament.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex gap-3">
                <Avatar
                  src={tournament.game_icon}
                  name={tournament.game_name}
                  size="md"
                />
                <div className="flex flex-col flex-1">
                  <p className="text-md font-semibold">{tournament.name}</p>
                  <p className="text-small text-default-500">{tournament.game_name}</p>
                </div>
                <Chip 
                  color={getStatusColor(tournament.status)} 
                  size="sm"
                  variant="flat"
                >
                  {tournament.status}
                </Chip>
              </CardHeader>
              <Divider />
              <CardBody>
                <div className="space-y-2">
                  {tournament.description && (
                    <p className="text-small text-default-600">{tournament.description}</p>
                  )}
                  <div className="flex justify-between text-small">
                    <span className="text-default-500">Max Participants:</span>
                    <span>{tournament.max_participants}</span>
                  </div>
                  <div className="flex justify-between text-small">
                    <span className="text-default-500">Created:</span>
                    <span>{new Date(tournament.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="flat" className="flex-1">
                    View Details
                  </Button>
                  {tournament.status === 'created' && (
                    <Button size="sm" color="primary" variant="flat">
                      Start Registration
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <CreateTournamentModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onTournamentCreated={handleTournamentCreated}
        games={games}
      />
    </div>
  );
}