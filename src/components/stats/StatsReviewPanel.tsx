'use client'

import { useState, useEffect } from 'react';
import { Stack, Text, Group, Button, Alert, Loader, Tabs, Badge, SimpleGrid } from '@mantine/core';
import { IconCheck, IconX, IconRefresh } from '@tabler/icons-react';
import { showSuccess, showError } from '@/lib/notifications';
import type { ScorecardSubmission, ScorecardPlayerStat, GameStatDefinition } from '@/shared/types';
import { SubmissionViewer } from './SubmissionViewer';
import { PlayerStatCard } from './PlayerStatCard';

interface Participant {
  id: string;
  username: string;
}

interface SubmissionWithStats extends ScorecardSubmission {
  playerStats: ScorecardPlayerStat[];
}

interface StatsReviewPanelProps {
  matchId: string;
  gameId: string;
}

export function StatsReviewPanel({ matchId, gameId }: StatsReviewPanelProps) {
  const [submissions, setSubmissions] = useState<SubmissionWithStats[]>([]);
  const [statDefs, setStatDefs] = useState<GameStatDefinition[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubmission, setActiveSubmission] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [subsRes, defsRes, partRes] = await Promise.all([
        fetch(`/api/matches/${matchId}/scorecard`).then(r => r.json()),
        fetch(`/api/games/${encodeURIComponent(gameId)}/stats`).then(r => r.json()),
        fetch(`/api/matches/${matchId}/participants`).then(r => r.json()),
      ]);
      setSubmissions(subsRes as SubmissionWithStats[]);
      setStatDefs(defsRes as GameStatDefinition[]);
      setParticipants((partRes as { participants?: Participant[] }).participants || partRes as Participant[]);
      if ((subsRes as SubmissionWithStats[]).length > 0 && !activeSubmission) {
        setActiveSubmission((subsRes as SubmissionWithStats[])[0].id);
      }
    } catch {
      showError('Failed to load submission data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const handleAssign = async (submissionId: string, playerStatId: string, participantId: string) => {
    try {
      await fetch(`/api/matches/${matchId}/scorecard/${submissionId}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: [{ playerStatId, participantId }] }),
      });
      await fetchData();
    } catch {
      showError('Failed to assign participant');
    }
  };

  const handleReview = async (submissionId: string, status: 'approved' | 'rejected') => {
    setReviewing(true);
    try {
      await fetch(`/api/matches/${matchId}/scorecard/${submissionId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      showSuccess(`Submission ${status}`);
      await fetchData();
    } catch {
      showError('Failed to review submission');
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
        <Text>Loading submissions...</Text>
      </Group>
    );
  }

  if (submissions.length === 0) {
    return (
      <Alert color="blue">No scorecard submissions yet for this match.</Alert>
    );
  }


  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Text fw={600} size="lg">Scorecard Submissions</Text>
        <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} onClick={fetchData}>
          Refresh
        </Button>
      </Group>

      {/* Submission tabs */}
      <Tabs value={activeSubmission} onChange={setActiveSubmission}>
        <Tabs.List>
          {submissions.map((sub, i) => (
            <Tabs.Tab
              key={sub.id}
              value={sub.id}
              rightSection={
                <Badge
                  size="xs"
                  color={sub.review_status === 'approved' || sub.review_status === 'auto_approved' ? 'green'
                    : sub.review_status === 'rejected' ? 'red' : 'gray'}
                >
                  {sub.review_status}
                </Badge>
              }
            >
              {sub.team_side.toUpperCase()} #{i + 1}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {submissions.map(sub => (
          <Tabs.Panel key={sub.id} value={sub.id} pt="md">
            <Stack gap="md">
              {/* AI status */}
              <Group>
                <Text size="sm" c="dimmed">AI Status:</Text>
                <Badge
                  color={sub.ai_extraction_status === 'completed' ? 'green'
                    : sub.ai_extraction_status === 'failed' ? 'red'
                    : sub.ai_extraction_status === 'processing' ? 'blue' : 'gray'}
                >
                  {sub.ai_extraction_status}
                </Badge>
              </Group>

              {sub.ai_error_message && (
                <Alert color="red" title="AI Error">{sub.ai_error_message}</Alert>
              )}

              {/* Screenshot */}
              <SubmissionViewer screenshotUrl={sub.screenshot_url} />

              {/* Player stats */}
              {sub.playerStats.length > 0 && (
                <>
                  <Text fw={500}>Extracted Players</Text>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    {sub.playerStats.map(ps => (
                      <PlayerStatCard
                        key={ps.id}
                        stat={ps}
                        statDefs={statDefs}
                        participants={participants}
                        onAssignChange={(playerStatId, participantId) =>
                          handleAssign(sub.id, playerStatId, participantId)
                        }
                      />
                    ))}
                  </SimpleGrid>
                </>
              )}

              {/* Review buttons */}
              {sub.review_status === 'pending' && (
                <Group>
                  <Button
                    color="green"
                    leftSection={<IconCheck size={14} />}
                    loading={reviewing}
                    onClick={() => handleReview(sub.id, 'approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    color="red"
                    variant="light"
                    leftSection={<IconX size={14} />}
                    loading={reviewing}
                    onClick={() => handleReview(sub.id, 'rejected')}
                  >
                    Reject
                  </Button>
                </Group>
              )}
            </Stack>
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  );
}
