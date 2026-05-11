'use client';

import { useRouter } from 'next/navigation';
import { TextInput, PasswordInput, Switch, Button, Alert, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowRight, IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';
import { logger } from '@/lib/logger/client';

interface DiscordSettings {
  application_id: string;
  bot_token: string;
  guild_id: string;
  announcement_role_id: string;
  mention_everyone: boolean;
}

function StepNumBig({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-outfit, sans-serif)',
      fontSize: 56,
      fontWeight: 800,
      lineHeight: 0.85,
      background: 'linear-gradient(135deg, #c084fc, #7c3aed)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      letterSpacing: '-0.04em',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {children}
    </div>
  );
}

function NumBadge({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: 28, height: 28,
      borderRadius: 8,
      background: 'rgba(124,58,237,0.15)',
      color: 'var(--mantine-color-violet-4, #c084fc)',
      border: '1px solid rgba(124,58,237,0.4)',
      fontFamily: 'var(--font-outfit, sans-serif)',
      fontWeight: 800,
      fontSize: 14,
      display: 'grid', placeItems: 'center',
      flexShrink: 0,
    }}>
      {children}
    </div>
  );
}

function InputCard({ num, title, sub, trailing, children }: {
  num: number;
  title: string;
  sub: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--mantine-color-default)',
      border: '1px solid var(--mantine-color-default-border)',
      borderRadius: 14,
      padding: '16px 18px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = 'rgba(124,58,237,0.35)';
      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(124,58,237,0.06)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = 'var(--mantine-color-default-border)';
      e.currentTarget.style.boxShadow = 'none';
    }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <NumBadge>{num}</NumBadge>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-outfit, sans-serif)', letterSpacing: '-0.005em' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--mantine-color-dimmed)' }}>{sub}</div>
        </div>
        {trailing}
      </div>
      {children}
    </div>
  );
}

export default function DiscordSetupClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<DiscordSettings>({
    initialValues: {
      application_id: '',
      bot_token: '',
      guild_id: '',
      announcement_role_id: '',
      mention_everyone: false,
    },
    validate: {
      application_id: (v) => (!v ? 'Application ID is required' : null),
      bot_token: (v) => (!v ? 'Bot token is required' : null),
      guild_id: (v) => (!v ? 'Guild ID is required' : null),
    },
  });

  const handleNext = async (values: DiscordSettings) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/settings/discord', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          bot_token: values.bot_token?.trim(),
          application_id: values.application_id?.trim(),
          guild_id: values.guild_id?.trim(),
          announcement_role_id: values.announcement_role_id?.trim(),
        }),
      });

      if (response.ok) {
        await fetch('/api/welcome-flow/screen', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screen: 3 }),
        });
        router.push('/welcome/channels-setup');
      } else {
        setError('Failed to save Discord settings. Please check your values and try again.');
      }
    } catch (err) {
      logger.error('Error saving Discord settings:', err);
      setError('An error occurred while saving settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await fetch('/api/welcome-flow/screen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screen: 3 }),
    });
    router.push('/welcome/channels-setup');
  };

  return (
    <form onSubmit={form.onSubmit(handleNext)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Step hero */}
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <StepNumBig>02</StepNumBig>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#f7cc02', fontFamily: 'var(--font-geist-mono, monospace)',
            }}>
              Discord
            </div>
            <h2 style={{
              fontFamily: 'var(--font-outfit, sans-serif)',
              fontSize: 'clamp(26px, 4vw, 36px)',
              fontWeight: 800,
              margin: '4px 0 2px',
              letterSpacing: '-0.025em',
              lineHeight: 1,
              color: 'var(--mantine-color-text)',
            }}>
              Plug in the bot.
            </h2>
            <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: 14, margin: '4px 0 0' }}>
              Three IDs and a token. Five minutes, tops.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <Alert color="red" variant="light" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {/* Input cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Card 1: Application ID */}
          <InputCard
            num={1}
            title="Application ID"
            sub="From the Discord Developer Portal."
            trailing={
              <Button
                variant="outline"
                size="xs"
                rightSection={<IconExternalLink size={13} />}
                disabled={!form.values.application_id || loading}
                onClick={() => {
                  if (form.values.application_id) {
                    const url = `https://discord.com/api/oauth2/authorize?client_id=${form.values.application_id}&permissions=2551204168592720&scope=bot%20applications.commands`;
                    window.open(url, '_blank');
                  }
                }}
                style={{ borderColor: 'rgba(124,58,237,0.4)', color: 'var(--mantine-color-violet-4, #c084fc)', flexShrink: 0 }}
              >
                Add Bot
              </Button>
            }
          >
            <TextInput
              placeholder="1029384756102938475"
              {...form.getInputProps('application_id')}
              disabled={loading}
            />
          </InputCard>

          {/* Card 2: Bot Token */}
          <InputCard
            num={2}
            title="Bot Token"
            sub="Stays on this machine. Encrypted at rest."
          >
            <PasswordInput
              placeholder="••••••••••••••••••••••••••••"
              {...form.getInputProps('bot_token')}
              disabled={loading}
            />
          </InputCard>

          {/* Card 3: Server & Role */}
          <InputCard
            num={3}
            title="Server & Role"
            sub="Where matches happen, and who gets pinged."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Guild ID <span style={{ color: 'var(--mantine-color-red-5)' }}>*</span>
                </Text>
                <TextInput
                  placeholder="Discord server ID"
                  {...form.getInputProps('guild_id')}
                  disabled={loading}
                />
              </div>
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Announcement Role
                </Text>
                <TextInput
                  placeholder="Role ID — or use @everyone"
                  {...form.getInputProps('announcement_role_id')}
                  disabled={loading || form.values.mention_everyone}
                />
              </div>
            </div>
            <Switch
              label={<><strong>Mention @everyone</strong> instead</>}
              mt={4}
              {...form.getInputProps('mention_everyone', { type: 'checkbox' })}
              disabled={loading}
              onChange={(e) => {
                form.setFieldValue('mention_everyone', e.currentTarget.checked);
                if (e.currentTarget.checked) form.setFieldValue('announcement_role_id', '');
              }}
            />
          </InputCard>
        </div>

        {/* CTA bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: 16,
          padding: '14px 18px',
          background: 'var(--mantine-color-body)',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 14,
          position: 'sticky',
          bottom: 12,
          backdropFilter: 'blur(8px)',
        }}>
          <Button variant="subtle" onClick={handleSkip} disabled={loading} style={{ color: 'var(--mantine-color-dimmed)' }}>
            Skip for now
          </Button>
          <div />
          <Button
            type="submit"
            rightSection={<IconArrowRight size={16} />}
            loading={loading}
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
              border: 'none',
              boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
            }}
          >
            Continue
          </Button>
        </div>

      </div>
    </form>
  );
}
