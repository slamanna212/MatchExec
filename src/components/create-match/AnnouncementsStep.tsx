'use client'

import { Text, Stack, Card, Group, ActionIcon, NumberInput, Select, Button } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import type { AnnouncementTime, MatchFormData } from './useMatchForm';

interface AnnouncementsStepProps {
  announcements: AnnouncementTime[];
  updateFormData: (field: keyof MatchFormData, value: unknown) => void;
  onBack: () => void;
  onNext: () => void;
}

function sortAnnouncements(announcements: AnnouncementTime[]) {
  return [...announcements].sort((a, b) => {
    const getMinutes = (announcement: AnnouncementTime) => {
      switch (announcement.unit) {
        case 'minutes': return announcement.value;
        case 'hours': return announcement.value * 60;
        case 'days': return announcement.value * 24 * 60;
        default: return 0;
      }
    };
    return getMinutes(a) - getMinutes(b);
  });
}

export function AnnouncementsStep({
  announcements,
  updateFormData,
  onBack,
  onNext
}: AnnouncementsStepProps) {
  const addAnnouncement = () => {
    const newAnnouncement: AnnouncementTime = {
      id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      value: 1,
      unit: 'hours'
    };
    const updatedAnnouncements = sortAnnouncements([...announcements, newAnnouncement]);
    updateFormData('announcements', updatedAnnouncements);
  };

  const updateAnnouncement = (id: string, field: keyof AnnouncementTime, value: unknown) => {
    const updatedAnnouncements = announcements.map(announcement =>
      announcement.id === id ? { ...announcement, [field]: value } : announcement
    );
    const sortedAnnouncements = sortAnnouncements(updatedAnnouncements);
    updateFormData('announcements', sortedAnnouncements);
  };

  const removeAnnouncement = (id: string) => {
    const updatedAnnouncements = announcements.filter(announcement => announcement.id !== id);
    updateFormData('announcements', updatedAnnouncements);
  };

  return (
    <Stack>
      <Text mb="md">Configure event announcements:</Text>

      <Text size="sm" c="dimmed" mb="md">
        Set up notifications to announce your event before it starts. You can create multiple announcements with different timing.
      </Text>

      {announcements && announcements.length > 0 && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>Scheduled Announcements:</Text>
          {announcements.map((announcement) => (
            <Card key={announcement.id} withBorder padding="sm">
              <Group justify="space-between" align="center">
                <Group align="center" gap="xs">
                  <NumberInput
                    size="sm"
                    placeholder="Time"
                    value={announcement.value}
                    onChange={(value) => updateAnnouncement(announcement.id, 'value', Number(value) || 1)}
                    min={1}
                    max={999}
                    style={{ width: 80 }}
                  />
                  <Select
                    size="sm"
                    data={[
                      { value: 'minutes', label: 'minutes' },
                      { value: 'hours', label: 'hours' },
                      { value: 'days', label: 'days' }
                    ]}
                    value={announcement.unit}
                    onChange={(value) => updateAnnouncement(announcement.id, 'unit', value)}
                    style={{ width: 100 }}
                  />
                  <Text size="sm" c="dimmed">before event</Text>
                </Group>
                <ActionIcon
                  color="red"
                  variant="light"
                  onClick={() => removeAnnouncement(announcement.id)}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Card
        withBorder
        padding="md"
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={addAnnouncement}
        style={{
          borderStyle: 'dashed',
          borderColor: 'var(--mantine-color-default-border)',
          backgroundColor: 'var(--mantine-color-body)'
        }}
      >
        <Stack align="center" justify="center" style={{ minHeight: 60 }}>
          <ActionIcon size="lg" variant="light">
            <IconPlus />
          </ActionIcon>
          <Text size="sm" c="dimmed">Add Announcement</Text>
        </Stack>
      </Card>

      <Group justify="space-between" mt="md" gap="xs">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>
          Next
        </Button>
      </Group>
    </Stack>
  );
}
