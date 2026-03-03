'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Title, Text, Button, Stack, Alert, Group } from '@mantine/core';
import { IconInfoCircle, IconRocket, IconSettings } from '@tabler/icons-react';
import { logger } from '@/lib/logger/client';
import { motion } from 'framer-motion';

export default function WelcomePageClient() {
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
        // Force full page reload to completely bypass client-side router cache
        window.location.href = '/';
      }
    } catch (error) {
      logger.error('Error completing welcome flow:', error);
    }
  };

  return (
    <Stack gap="lg">
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <motion.div
            animate={{ filter: ['drop-shadow(0 0 16px rgba(124,58,237,0.4))', 'drop-shadow(0 0 32px rgba(124,58,237,0.7))', 'drop-shadow(0 0 16px rgba(124,58,237,0.4))'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Image
              src="/logo.svg"
              alt="MatchExec"
              width={250}
              height={250}
              unoptimized
            />
          </motion.div>
        </div>
        <Title
          order={1}
          ta="center"
          mb="xs"
          style={{
            fontFamily: 'var(--font-outfit, sans-serif)',
            background: 'linear-gradient(135deg, #c084fc, #7c3aed, #4c1d95)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Welcome to MatchExec!
        </Title>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <Text>
          MatchExec helps you organize and manage competitive matches on Discord with automated
          announcements, player management, and score tracking.
        </Text>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <Group gap="md" grow>
          <Button
            size="lg"
            leftSection={<IconRocket size={20} />}
            onClick={handleGetStarted}
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
              border: 'none',
              boxShadow: '0 4px 16px rgba(124, 58, 237, 0.4)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.boxShadow = '0 6px 24px rgba(124, 58, 237, 0.6)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(124, 58, 237, 0.4)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Get Started
          </Button>

          <Button
            size="lg"
            variant="outline"
            leftSection={<IconSettings size={20} />}
            onClick={handleProMode}
            style={{
              borderColor: 'rgba(124, 58, 237, 0.5)',
              color: '#c084fc',
            }}
          >
            Pro Mode
          </Button>
        </Group>
      </motion.div>

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
