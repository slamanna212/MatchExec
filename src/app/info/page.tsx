'use client'

import { Card, Text, Stack, Button, Group, Anchor } from '@mantine/core';
import { IconBrandGithub, IconInfoCircle, IconBook, IconBug, IconBulb, IconHeart, IconBrandDiscord, IconButterfly } from '@tabler/icons-react';

export default function InfoPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <Stack gap="xl">
        
        <Stack gap="lg">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group mb="md">
              <IconInfoCircle size="1.2rem" />
              <Text size="lg" fw={600}>Info</Text>
            </Group>

            <Stack gap="md">
              <Text>
                Our wiki is full of info about MatchExec
              </Text>
              
              <Group justify="flex-start">
                <Button
                  leftSection={<IconBook size="1rem" />}
                  component="a"
                  href="https://github.com/slamanna212/MatchExec/wiki"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Wiki
                </Button>
              </Group>
            </Stack>
          </Card>
        </Stack>

        <Stack gap="lg">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group mb="md">
              <IconBrandGithub size="1.2rem" />
              <Text size="lg" fw={600}>Support</Text>
            </Group>

            <Stack gap="md">
              <Text>
                Need help or found an issue? Submit a report on our GitHub repository.
              </Text>
              
              <Group justify="flex-start">
                <Button
                  leftSection={<IconBug size="1rem" />}
                  component="a"
                  href="https://github.com/slamanna212/MatchExec/issues/new?template=bug_report.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Submit Bug Report
                </Button>
                <Button
                  leftSection={<IconBulb size="1rem" />}
                  component="a"
                  href="https://github.com/slamanna212/MatchExec/issues/new?template=enhancement.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Submit Feature Request
                </Button>
              </Group>
            </Stack>
          </Card>
        </Stack>

        <Stack gap="lg">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group mb="md">
              <IconBrandDiscord size="1.2rem" />
              <Text size="lg" fw={600}>Connect With MatchExec</Text>
            </Group>

            <Stack gap="md">
              <Text>
                Stay up to date with the latest info.
              </Text>
              
              <Group justify="flex-start">
                <Button
                  leftSection={<IconBrandDiscord size="1rem" />}
                  component="a"
                  href="https://discord.gg/nPKp95Cc6k"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Discord
                </Button>
                <Button
                  leftSection={<IconButterfly size="1rem" />}
                  component="a"
                  href="https://bsky.app/profile/matchexec.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Bluesky
                </Button>
              </Group>
            </Stack>
          </Card>
        </Stack>

        <Stack gap="lg">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group mb="md">
              <IconHeart size="1.2rem" />
              <Text size="lg" fw={600}>Credits</Text>
            </Group>

            <Stack gap="md">
              <ul className="list-disc ml-4">
                <li>
                  <Text component="span">
                    Thank you{' '}
                    <Anchor
                      href="https://www.fiverr.com/fajar998"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abdulklah Keyani
                    </Anchor>
                    {' '}for the MatchExec logo.
                  </Text>
                </li>
                <li>
                  <Text component="span">
                    Thank you to a special group of friends that inspired this project and helped test it thoroughly. A true group of heroes!
                  </Text>
                </li>
              </ul>
            </Stack>
          </Card>
        </Stack>
      </Stack>
    </div>
  );
}