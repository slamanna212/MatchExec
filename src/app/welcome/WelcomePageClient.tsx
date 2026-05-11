'use client';

import { useRouter } from 'next/navigation';
import { Button, Group, Modal, Text, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconRocket, IconSettings, IconExternalLink, IconStack2, IconBrandDiscord } from '@tabler/icons-react';
import { motion } from 'framer-motion';
import { logger } from '@/lib/logger/client';
import styles from './welcome.module.css';

const RESOURCES = [
  {
    title: 'Documentation',
    sub: 'docs.matchexec.com',
    href: 'https://docs.matchexec.com/docs/getting-started/getting-started/',
    Icon: IconStack2,
  },
  {
    title: 'Discord community',
    sub: 'Get help, share setups',
    href: 'https://discord.gg/X2khJC6mRx',
    Icon: IconBrandDiscord,
  },
  {
    title: 'GitHub',
    sub: 'slamanna212/MatchExec',
    href: 'https://github.com/slamanna212/MatchExec',
    Icon: IconStack2,
  },
];

export default function WelcomePageClient() {
  const router = useRouter();
  const [proModalOpen, { open: openProModal, close: closeProModal }] = useDisclosure(false);

  const handleGetStarted = () => {
    void router.push('/welcome/discord-setup');
  };

  const handleProModeConfirm = async () => {
    try {
      const response = await fetch('/api/welcome-flow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupType: 'pro_mode' }),
      });
      if (response.ok) {
        window.location.href = '/';
      }
    } catch (error) {
      logger.error('Error completing welcome flow:', error);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0 8px', textAlign: 'center' }}
      >
        {/* Logo orb */}
        <div className={styles.logoStage}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <div className={`${styles.ring} ${styles.ring1}`} />
            <div className={`${styles.ring} ${styles.ring2}`} />
            <div className={`${styles.ring} ${styles.ring3}`} />
          </div>
          <div className={styles.logoBob}>
            <img
              src="/logo.svg"
              alt="MatchExec"
              className={styles.logoImg}
            />
          </div>
        </div>

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{
            fontFamily: 'var(--font-outfit, sans-serif)',
            fontSize: 'clamp(42px, 6vw, 62px)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 0.98,
            margin: '6px 0 0',
            color: 'var(--mantine-color-text)',
          }}
        >
          Welcome to{' '}
          <span style={{
            background: 'linear-gradient(135deg, #f7cc02, #c084fc, #7c3aed)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            MatchExec
          </span>
        </motion.h1>

        {/* Lede */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          style={{
            color: 'var(--mantine-color-dimmed)',
            fontSize: 16,
            lineHeight: 1.55,
            maxWidth: 560,
            margin: '4px 0 0',
          }}
        >
          A few minutes to connect your Discord bot and pick your channels — then you&apos;re ready for lift off.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.45 }}
          className={styles.ctaRow}
        >
          <Button
            size="lg"
            leftSection={<IconRocket size={20} />}
            onClick={handleGetStarted}
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
              border: 'none',
              boxShadow: '0 4px 16px rgba(124,58,237,0.45)',
              transition: 'box-shadow 0.2s, transform 0.15s',
            }}
            styles={{ root: { '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 6px 24px rgba(124,58,237,0.65)' } } }}
          >
            Get Started
          </Button>
          <Button
            size="lg"
            variant="outline"
            leftSection={<IconSettings size={20} />}
            onClick={openProModal}
            style={{
              borderColor: 'rgba(124,58,237,0.5)',
              color: 'var(--mantine-color-violet-4, #c084fc)',
            }}
          >
            Pro Mode
          </Button>
        </motion.div>

        {/* Resource tiles */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.45 }}
          className={styles.resourceGrid}
        >
          {RESOURCES.map((r) => (
            <a
              key={r.href}
              href={r.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr auto',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                textDecoration: 'none',
                color: 'inherit',
                background: 'var(--mantine-color-default)',
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 12,
                transition: 'border-color 0.15s, transform 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#9333ea';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--mantine-color-default-border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: 32, height: 32,
                display: 'grid', placeItems: 'center',
                borderRadius: 8,
                background: 'rgba(124,58,237,0.15)',
                color: 'var(--mantine-color-violet-4, #c084fc)',
                border: '1px solid rgba(124,58,237,0.3)',
                flexShrink: 0,
              }}>
                <r.Icon size={15} />
              </div>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--mantine-color-dimmed)', marginTop: 1 }}>{r.sub}</div>
              </div>
              <div style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }}>
                <IconExternalLink size={13} />
              </div>
            </a>
          ))}
        </motion.div>
      </motion.div>

      {/* Pro Mode Modal */}
      <Modal
        opened={proModalOpen}
        onClose={closeProModal}
        title={
          <Group gap="sm">
            <div style={{
              width: 38, height: 38,
              borderRadius: 10,
              display: 'grid', placeItems: 'center',
              background: 'rgba(247,204,2,0.15)',
              color: '#f7cc02',
              border: '1px solid rgba(247,204,2,0.4)',
              flexShrink: 0,
            }}>
              <IconSettings size={18} />
            </div>
            <span style={{ fontFamily: 'var(--font-outfit, sans-serif)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em' }}>
              Pro Mode
            </span>
          </Group>
        }
        size="sm"
        radius="md"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed" style={{ lineHeight: 1.55 }}>
            Choose Pro Mode if you already know how to set up a Discord.js bot,
            copy channel and user IDs, and configure Discord applications.
            This will skip the guided setup and take you directly to the app.
          </Text>
          <Group justify="flex-end" gap="sm" mt={4}>
            <Button variant="subtle" onClick={closeProModal}>
              Cancel
            </Button>
            <Button
              onClick={handleProModeConfirm}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
                border: 'none',
              }}
            >
              Yes, use Pro Mode
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
