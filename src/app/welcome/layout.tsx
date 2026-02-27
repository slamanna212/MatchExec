'use client';

import { Container, Paper, Box, Stepper, Transition } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

function getActiveStep(pathname: string): number {
  if (pathname.startsWith('/welcome/channels-setup')) return 2;
  if (pathname.startsWith('/welcome/discord-setup')) return 1;
  return 0;
}

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeStep = getActiveStep(pathname);

  const handleStepClick = (step: number) => {
    if (step === 0) router.push('/welcome');
    else if (step === 1) router.push('/welcome/discord-setup');
    else if (step === 2) router.push('/welcome/channels-setup');
  };

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
          <Stepper
            active={activeStep}
            onStepClick={handleStepClick}
            mb="xl"
            allowNextStepsSelect={false}
            size="sm"
            styles={{ steps: { flexWrap: 'nowrap' } }}
          >
            <Stepper.Step
              label="Welcome"
              allowStepSelect={false}
            />
            <Stepper.Step
              label="Discord"
              allowStepSelect={activeStep > 1}
            />
            <Stepper.Step
              label="Channels"
              allowStepSelect={false}
            />
          </Stepper>

          <Transition
            key={pathname}
            mounted={true}
            transition="fade"
            duration={200}
            timingFunction="ease"
          >
            {(styles) => <div style={styles}>{children}</div>}
          </Transition>
        </Paper>
      </Container>
    </Box>
  );
}
