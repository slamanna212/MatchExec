'use client';

import { Container, Paper, Box } from '@mantine/core';
import type { ReactNode } from 'react';

interface WelcomeLayoutProps {
  children: ReactNode;
}

export default function WelcomeLayout({ children }: WelcomeLayoutProps) {
  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--mantine-color-dark-8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <Container size="xl" style={{ width: '100%' }}>
        <Paper
          withBorder
          shadow="md"
          p="xl"
          radius="md"
          style={{ width: '100%', maxWidth: '1000px', margin: '0 auto' }}
        >
          {children}
        </Paper>
      </Container>
    </Box>
  );
}