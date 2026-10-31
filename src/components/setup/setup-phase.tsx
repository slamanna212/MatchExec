'use client'

import { logger } from '@/lib/logger/client';
import { useState, useEffect, useRef, type JSX } from 'react';
import { Stack, Loader, Center, Text, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { ConfirmParticipants } from './confirm-participants';
import { GridOrder } from './grid-order';
import { Qualifying, type QualifyingTime } from './qualifying';

interface Participant {
  id: string;
  username: string;
  avatar_url?: string | null;
  grid_position?: number | null;
  qualifying_time_ms?: number | null;
}

export interface SetupData {
  gridOrder?: string[];
  qualifyingTimes?: Record<string, number | null>;
}

interface SetupPhaseProps {
  matchId: string;
  /** Forced component list — if omitted, fetched from the match's game mode setup_components. */
  setupComponents?: string[];
  /** Called with the latest grid order / qualifying times whenever they change (and once on load). */
  onSetupChange?: (data: SetupData) => void;
}

/**
 * Dispatcher for the assign-phase setup UI.
 * Reads `game_modes.setup_components` and renders the appropriate sub-components in order.
 * Defaults inferred from scoring_type when setup_components is null.
 */
export function SetupPhase({ matchId, setupComponents: forcedComponents, onSetupChange }: SetupPhaseProps): JSX.Element {
  const [components, setComponents] = useState<string[]>(forcedComponents ?? []);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(!forcedComponents);
  const [error, setError] = useState<string | null>(null);
  const onSetupChangeRef = useRef(onSetupChange);
  useEffect(() => {
    onSetupChangeRef.current = onSetupChange;
  }, [onSetupChange]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [participantsRes, matchRes] = await Promise.all([
          // Includes saved grid_position / qualifying_time_ms, ordered by saved grid
          fetch(`/api/matches/${matchId}/setup`),
          fetch(`/api/matches/${matchId}`),
        ]);

        if (participantsRes.ok) {
          const data = await participantsRes.json();
          const loaded: Participant[] = data.participants ?? [];
          setParticipants(loaded);
          onSetupChangeRef.current?.({
            gridOrder: loaded.map((p) => p.id),
            qualifyingTimes: Object.fromEntries(loaded.map((p) => [p.id, p.qualifying_time_ms ?? null])),
          });
        }

        if (!forcedComponents && matchRes.ok) {
          const match = await matchRes.json();
          // Determine setup components from scoring type when not forced
          const scoringType: string = match.scoring_type ?? 'Normal';
          const defaultComponents: Record<string, string[]> = {
            Normal: ['teams'],
            FFA: ['confirm_participants'],
            Position: ['grid_order'],
          };
          setComponents(match.setup_components ?? defaultComponents[scoringType] ?? ['teams']);
        }
      } catch (err) {
        logger.error('Error loading setup phase:', err);
        setError('Failed to load setup phase');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [matchId, forcedComponents]);

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="md" />
      </Center>
    );
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>
    );
  }

  return (
    <Stack gap="lg">
      {components.map((component) => {
        switch (component) {
          case 'confirm_participants':
            return <ConfirmParticipants key={component} participants={participants} />;
          case 'grid_order':
            return <GridOrder key={component} participants={participants} onChange={(gridOrder) => onSetupChangeRef.current?.({ gridOrder })} />;
          case 'qualifying':
            return (
              <Qualifying
                key={component}
                participants={participants}
                initialTimes={Object.fromEntries(participants.map((p) => [p.id, p.qualifying_time_ms ?? null]))}
                onChange={(times: QualifyingTime[]) =>
                  onSetupChangeRef.current?.({
                    qualifyingTimes: Object.fromEntries(times.map((t) => [t.participantId, t.lapTimeMs])),
                  })
                }
              />
            );
          case 'teams':
            return (
              <Text key={component} size="sm" c="dimmed">
                Team assignment is handled via the assign page.
              </Text>
            );
          default:
            return (
              <Text key={component} size="sm" c="dimmed">
                Unknown setup component: {component}
              </Text>
            );
        }
      })}
    </Stack>
  );
}
