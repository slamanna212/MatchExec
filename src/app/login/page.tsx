'use client';

import { Button, Stack, Text, Title, Card, Center, Image } from '@mantine/core';
import { IconBrandDiscord, IconAlertCircle } from '@tabler/icons-react';
import { signIn } from '@/lib/auth-client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const accessDenied = searchParams.get('access') === 'denied';

  const handleDiscordLogin = () => {
    signIn.social({
      provider: 'discord',
      callbackURL: `/api/auth/sync?redirect=${encodeURIComponent(redirectTo)}`,
    });
  };

  return (
    <Center style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #1a0e3d 0%, #241459 40%, #2d1b69 100%)' }}>
      <Stack align="center" gap="xl" style={{ width: '100%', maxWidth: 420, padding: '0 1rem' }}>
        <Image src="/logo.svg" alt="MatchExec" w={100} h={100} fit="contain" />

        <Card
          padding="xl"
          radius="lg"
          withBorder
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderColor: 'rgba(124, 58, 237, 0.3)',
            width: '100%',
          }}
        >
          <Stack align="center" gap="lg">
            <div style={{ textAlign: 'center' }}>
              <Title order={2} c="#F5F5F5">Welcome to MatchExec</Title>
              <Text c="dimmed" size="sm" mt="xs">
                Sign in with Discord to continue
              </Text>
            </div>

            {accessDenied && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                width: '100%',
              }}>
                <IconAlertCircle size="1rem" style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                <Text size="sm" c="#ef4444">
                  Your Discord account doesn&apos;t have access. Contact your server admin to
                  assign you a role.
                </Text>
              </div>
            )}

            <Button
              leftSection={<IconBrandDiscord size="1.2rem" />}
              size="md"
              fullWidth
              onClick={handleDiscordLogin}
              style={{ background: '#5865f2' }}
            >
              Login with Discord
            </Button>

            <Text size="xs" c="dimmed" ta="center">
              Access is controlled by your Discord server roles.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Center>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
