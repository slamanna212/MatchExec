import { Container, Title, Text, Button, Group } from '@mantine/core';
import Link from 'next/link';

export default function NotFound() {
  return (
    <Container size="md" style={{ textAlign: 'center', paddingTop: '5rem' }}>
      <Title order={1} size="h1" mb="md">
        404 - Page Not Found
      </Title>
      <Text size="lg" mb="xl" c="dimmed">
        The page you&apos;re looking for doesn&apos;t exist.
      </Text>
      <Group justify="center">
        <Button component={Link} href="/" variant="filled">
          Go Home
        </Button>
        <Button component={Link} href="/games" variant="outline">
          Browse Games
        </Button>
      </Group>
    </Container>
  );
}
