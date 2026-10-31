'use client';

import { Suspense, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Center, PasswordInput, Stack, Title } from '@mantine/core';
import { sanitizeNext } from '@/lib/auth-shared';

function LoginForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = sanitizeNext(searchParams.get('next'));
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Login failed');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center mih="100vh" p="md">
      <Card withBorder shadow="sm" padding="xl" w="100%" maw={400}>
        <form onSubmit={onSubmit}>
          <Stack>
            <Title order={3}>MatchExec Login</Title>
            {error && <Alert color="red">{error}</Alert>}
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoFocus
              required
            />
            <Button type="submit" loading={loading}>Log in</Button>
          </Stack>
        </form>
      </Card>
    </Center>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
