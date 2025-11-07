'use client';

import { useEffect, useState } from 'react';
import { Container, Loader, Text, Stack } from '@mantine/core';
import Image from 'next/image';

interface DatabaseStatus {
  ready: boolean;
  progress: string;
  timestamp: number;
}

export function DatabaseLoadingScreen() {
  const [status, setStatus] = useState<DatabaseStatus>({
    ready: false,
    progress: 'Initializing database...',
    timestamp: 0
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/db-status');
        if (response.ok) {
          const data: DatabaseStatus = await response.json();
          setStatus(data);

          if (data.ready) {
            setIsReady(true);
          }
        }
      } catch (error) {
        console.error('Failed to check database status:', error);
      }
    };

    // Check immediately
    checkStatus();

    // Poll every 1.5 seconds
    const interval = setInterval(checkStatus, 1500);

    return () => clearInterval(interval);
  }, []);

  if (isReady) {
    return null;
  }

  return (
    <Container size="sm" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <Stack align="center" gap="lg">
        <Image
          src="/logo.svg"
          alt="MatchExec Logo"
          width={300}
          height={300}
          style={{ maxWidth: '300px', height: 'auto' }}
        />
        <Loader size="xl" type="dots" />
        <Text size="md" c="dimmed" ta="center">
          {status.progress}
        </Text>
      </Stack>
    </Container>
  );
}