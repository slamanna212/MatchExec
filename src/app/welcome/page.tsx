'use client';

import { useRouter } from 'next/navigation';
import { Title, Text, Button, Stack, Alert } from '@mantine/core';
import { IconInfoCircle, IconRocket, IconSettings } from '@tabler/icons-react';

export default function WelcomePage() {
  const router = useRouter();

  const handleGetStarted = async () => {
    router.push('/welcome/discord-setup');
  };

  const handleProMode = async () => {
    try {
      const response = await fetch('/api/welcome-flow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupType: 'pro_mode' }),
      });
      
      if (response.ok) {
        router.push('/');
      }
    } catch (error) {
      console.error('Error completing welcome flow:', error);
    }
  };

  return (
    <Stack gap="lg">
      <div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <img 
            src="/logo.svg" 
            alt="MatchExec"
            style={{ width: '80px', height: '80px' }}
          />
        </div>
        <Title order={1} ta="center" mb="xs">
          Welcome to MatchExec!
        </Title>
      </div>

      <Text>
        MatchExec helps you organize and manage competitive matches on Discord with automated 
        announcements, player management, and score tracking.
      </Text>

      <Stack gap="md">
        <Button
          size="lg"
          leftSection={<IconRocket size={20} />}
          onClick={handleGetStarted}
          fullWidth
        >
          Get Started
        </Button>

        <Button
          size="lg"
          variant="outline"
          leftSection={<IconSettings size={20} />}
          onClick={handleProMode}
          fullWidth
        >
          Pro Mode
        </Button>
      </Stack>

      <Alert 
        icon={<IconInfoCircle size={16} />} 
        title="Pro Mode" 
        color="yellow"
        variant="light"
      >
        Choose Pro Mode if you already know how to set up a Discord.js bot, 
        copy channel and user IDs, and configure Discord applications. 
        This will skip the guided setup and take you directly to the app.
      </Alert>
    </Stack>
  );
}