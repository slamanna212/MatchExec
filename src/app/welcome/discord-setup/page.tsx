'use client';

import { useRouter } from 'next/navigation';
import { Title, Text, Button, Stack, Alert, Group, TextInput, PasswordInput, Checkbox, Anchor } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconExternalLink, IconArrowRight, IconBrandDiscord } from '@tabler/icons-react';
import { useState } from 'react';
import { logger } from '@/lib/logger';

interface DiscordSettings {
  application_id: string;
  bot_token: string;
  guild_id: string;
  announcement_role_id: string;
  mention_everyone: boolean;
}

export default function DiscordSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const form = useForm<DiscordSettings>({
    initialValues: {
      application_id: '',
      bot_token: '',
      guild_id: '',
      announcement_role_id: '',
      mention_everyone: false,
    },
    validate: {
      application_id: (value) => (!value ? 'Application ID is required' : null),
      bot_token: (value) => (!value ? 'Bot token is required' : null),
      guild_id: (value) => (!value ? 'Guild ID is required' : null),
    },
  });

  const handleNext = async (values: DiscordSettings) => {
    setLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/settings/discord', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        await fetch('/api/welcome-flow/screen', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screen: 3 }),
        });
        router.push('/welcome/channels-setup');
      } else {
        setMessage({ type: 'error', text: 'Failed to save Discord settings. Please check your values and try again.' });
      }
    } catch (error) {
      logger.error('Error saving Discord settings:', error);
      setMessage({ type: 'error', text: 'An error occurred while saving settings.' });
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
    <Stack gap="lg">
      <div>
        <Title order={1} ta="center" mb="xs">
          Discord Bot Setup 🤖
        </Title>
        <Text ta="center" c="dimmed">
          Configure your Discord bot to start managing matches
        </Text>
      </div>

      <Alert icon={<IconBrandDiscord size={16} />} color="blue" variant="light">
        <Text size="sm" mb="xs">
          Need help setting up your Discord bot?
        </Text>
        <Anchor 
          href="https://github.com/slamanna212/MatchExec/wiki/Setting-Up-MatchExec#discord-setup" 
          size="sm" 
          target="_blank" 
          rel="noopener noreferrer"
        >
          Follow our step-by-step guide <IconExternalLink size={12} style={{ display: 'inline', marginLeft: '4px' }} />
        </Anchor>
      </Alert>

      {message && (
        <Alert color={message.type === 'success' ? 'green' : 'red'}>
          {message.text}
        </Alert>
      )}

      <form onSubmit={form.onSubmit(handleNext)}>
        <Stack gap="md">
          <Group align="end">
            <TextInput
              label="Application ID"
              placeholder="Discord application ID"
              description="Application ID from Discord Developer Portal"
              {...form.getInputProps('application_id')}
              disabled={loading}
              style={{ flex: 1 }}
              required
            />
            <Button
              variant="outline"
              disabled={!form.values.application_id || loading}
              onClick={async () => {
                if (form.values.application_id) {
                  const url = `https://discord.com/api/oauth2/authorize?client_id=${form.values.application_id}&permissions=581636017618000&scope=bot%20applications.commands`;
                  window.open(url, '_blank');
                }
              }}
            >
              Add Bot
            </Button>
          </Group>

          <PasswordInput
            label="Bot Token"
            placeholder="Your Discord bot token"
            description="Token from Discord Developer Portal"
            {...form.getInputProps('bot_token')}
            disabled={loading}
            required
          />

          <TextInput
            label="Guild ID"
            placeholder="Discord server ID"
            description="Right-click your Discord server and copy ID"
            {...form.getInputProps('guild_id')}
            disabled={loading}
            required
          />

          <Stack gap="sm">
            <Text size="sm" fw={500}>Announcement Role</Text>
            <Text size="xs" c="dimmed">Role to mention in match announcements</Text>
            
            <Group align="center" gap="md">
              <TextInput
                placeholder="Role ID for announcements"
                {...form.getInputProps('announcement_role_id')}
                disabled={loading || form.values.mention_everyone}
                style={{ flex: 1 }}
              />
              
              <Checkbox
                label={<Text fw="bold">@Everyone</Text>}
                size="md"
                {...form.getInputProps('mention_everyone', { type: 'checkbox' })}
                disabled={loading}
                onChange={(event) => {
                  form.setFieldValue('mention_everyone', event.currentTarget.checked);
                  if (event.currentTarget.checked) {
                    form.setFieldValue('announcement_role_id', '');
                  }
                }}
              />
            </Group>
          </Stack>

          <Group justify="space-between" mt="xl" style={{ flexWrap: 'nowrap' }}>
            <Button 
              variant="subtle" 
              onClick={handleSkip}
              disabled={loading}
              style={{ flex: '0 1 auto' }}
            >
              Skip for now
            </Button>
            <Button 
              type="submit" 
              rightSection={<IconArrowRight size={16} />}
              loading={loading}
              style={{ flex: '0 1 auto' }}
            >
              Next: Setup Channels
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}