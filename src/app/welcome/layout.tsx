'use client';

import { Container, Paper, Box } from '@mantine/core';
import { ReactNode } from 'react';

interface WelcomeLayoutProps {
  children: ReactNode;
}

export default function WelcomeLayout({ children }: WelcomeLayoutProps) {
  return (
    <Box
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        backgroundColor: 'var(--mantine-color-dark-8)',
        overflow: 'auto',
      }}
    >
      <Container size="md" py="xl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
        <Paper
          withBorder
          shadow="md"
          p="xl"
          radius="md"
          style={{ width: '100%', maxWidth: '600px', margin: '0 auto' }}
        >
          {children}
        </Paper>
      </Container>
    </Box>
  );
}