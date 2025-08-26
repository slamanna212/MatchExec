'use client'

import { Card, Text, Stack, Button, Group } from '@mantine/core';
import { IconBrandGithub, IconInfoCircle } from '@tabler/icons-react';

export default function InfoPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="xl">
        <div>
          <Text size="xl" fw={700}>Info</Text>
          <Text c="dimmed" mt="xs">Information and support resources</Text>
        </div>

        <Stack gap="lg">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group mb="md">
              <IconInfoCircle size="1.2rem" />
              <Text size="lg" fw={600}>Support</Text>
            </Group>

            <Stack gap="md">
              <Text>
                Need help or found an issue? Submit a report on our GitHub repository.
              </Text>
              
              <Group justify="flex-start">
                <Button
                  leftSection={<IconBrandGithub size="1rem" />}
                  component="a"
                  href="https://github.com/slamanna212/MatchExec/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Submit GitHub Issue
                </Button>
              </Group>
            </Stack>
          </Card>
        </Stack>
      </Stack>
    </div>
  );
}