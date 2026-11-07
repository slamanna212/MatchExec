import { Card, Text, Stack, Button, Group, Anchor, SimpleGrid } from '@mantine/core';
import type { ReactNode } from 'react';
import { IconBrandGithub, IconInfoCircle, IconBook, IconBug, IconBulb, IconHeart, IconBrandDiscord, IconButterfly, IconScale } from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { PageLayout } from '@/components/PageLayout';

const COPYRIGHTS = [
  'Assetto Corsa Competizione © Kunos Simulazioni S.r.l.',
  'Counter-Strike 2 © Valve Corporation',
  'Fortnite © Epic Games, Inc.',
  'League of Legends © Riot Games, Inc.',
  'Mario Kart 8 Deluxe © Nintendo Co., Ltd.',
  'Marvel Rivals © NetEase Games. Marvel characters © Marvel Entertainment, LLC.',
  'Overwatch © Blizzard Entertainment, Inc.',
  'Rainbow Six Siege © Ubisoft Entertainment SA',
  'Rocket League © Psyonix LLC',
  'VALORANT © Riot Games, Inc.',
];

function InfoCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="sm" h="100%">
        <Group gap="xs" wrap="nowrap">
          <span style={{ display: 'flex', color: 'var(--mantine-color-violet-4)' }}>{icon}</span>
          <Text size="md" fw={600}>{title}</Text>
        </Group>
        {children}
      </Stack>
    </Card>
  );
}

function ExternalButton({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Button leftSection={icon} component="a" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </Button>
  );
}

export default function InfoPage() {
  return (
    <PageLayout narrow>
      <Stack gap="md">
        <PageHeader
          icon={IconInfoCircle}
          title="Information"
          subtitle="Documentation, support, and project information"
          breadcrumbs={[{ title: 'Settings', href: '/settings' }]}
        />

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <InfoCard icon={<IconBook size="1.2rem" />} title="Documentation">
            <Text size="sm" style={{ flex: 1 }}>Our documentation is full of info about MatchExec</Text>
            <Group>
              <ExternalButton href="https://docs.matchexec.com/docs/getting-started/getting-started/" icon={<IconBook size="1rem" />}>
                Documentation
              </ExternalButton>
            </Group>
          </InfoCard>

          <InfoCard icon={<IconBrandGithub size="1.2rem" />} title="Support">
            <Text size="sm" style={{ flex: 1 }}>Need help or found an issue? Submit a report on our GitHub repository.</Text>
            <Group gap="xs">
              <ExternalButton href="https://github.com/slamanna212/MatchExec/issues/new?template=bug_report.yml" icon={<IconBug size="1rem" />}>
                Submit Bug Report
              </ExternalButton>
              <ExternalButton href="https://github.com/slamanna212/MatchExec/issues/new?template=enhancement.yml" icon={<IconBulb size="1rem" />}>
                Submit Feature Request
              </ExternalButton>
            </Group>
          </InfoCard>

          <InfoCard icon={<IconBrandDiscord size="1.2rem" />} title="Connect With MatchExec">
            <Text size="sm" style={{ flex: 1 }}>Stay up to date with the latest info.</Text>
            <Group gap="xs">
              <ExternalButton href="https://discord.gg/nPKp95Cc6k" icon={<IconBrandDiscord size="1rem" />}>Discord</ExternalButton>
              <ExternalButton href="https://bsky.app/profile/matchexec.com" icon={<IconButterfly size="1rem" />}>Bluesky</ExternalButton>
            </Group>
          </InfoCard>
        </SimpleGrid>

        <InfoCard icon={<IconHeart size="1.2rem" />} title="Credits">
          <Text size="sm">
            Thank you{' '}
            <Anchor href="https://www.fiverr.com/fajar998" target="_blank" rel="noopener noreferrer" size="sm">
              Abdulklah Keyani
            </Anchor>
            {' '}for the MatchExec logo.
          </Text>
          <Text size="sm">
            Thank you to a special group of friends that inspired this project and helped test it thoroughly. A true group of heroes!
          </Text>
        </InfoCard>

        <InfoCard icon={<IconScale size="1.2rem" />} title="Copyright">
          <Text size="sm">MatchExec is and always will be free and open source.</Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" verticalSpacing={6}>
            {COPYRIGHTS.map((line) => (
              <Text key={line} size="sm" c="dimmed">{line}</Text>
            ))}
          </SimpleGrid>
          <Text size="sm" c="dimmed">
            MatchExec is an independent tool and is not affiliated with, endorsed by, or sponsored by any of the above companies. All game names, logos, and trademarks are the property of their respective owners.
          </Text>
        </InfoCard>
      </Stack>
    </PageLayout>
  );
}
