import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Alert, Container, Loader, Progress, Text, Stack } from '@mantine/core';
import { logger } from '@/lib/logger/client';

/** `/api/db-status` body. The optional fields are filled while a legacy SQLite database is imported (plan 5.4). */
export interface DatabaseStatus {
  ready: boolean;
  progress: string;
  timestamp: number;
  phase?: string;
  percent?: number;
  /** Table the importer is copying right now. */
  table?: string;
  /** Failure summary when `phase === 'error'`. */
  error?: {
    message: string;
    issues: Array<{ table: string; id: string | null; detail: string }>;
    issuesTotal: number;
    repairs: number;
  };
}

const PHASE_LABELS: Record<string, string> = {
  starting: 'Starting',
  migrating: 'Updating the database schema',
  importing: 'Importing your existing data',
  seeding: 'Loading game data',
  error: 'Something went wrong',
};

export function DatabaseLoadingScreen(): JSX.Element | null {
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
        logger.error('Failed to check database status:', error);
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

  const failed = status.phase === 'error' && status.error;
  const importing = status.phase === 'importing';
  return (
    <Container size="sm" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <Stack align="center" gap="lg" w="100%">
        <img
          src="/logo.svg"
          alt="MatchExec Logo"
          width={300}
          height={300}
          style={{ maxWidth: '300px', height: 'auto' }}
        />
        {failed ? null : <Loader size="xl" type="dots" />}
        {status.phase && PHASE_LABELS[status.phase] && (
          <Text size="lg" fw={600} ta="center">{PHASE_LABELS[status.phase]}</Text>
        )}
        <Text size="md" c="dimmed" ta="center">
          {status.progress}
        </Text>
        {importing && typeof status.percent === 'number' && (
          <Progress value={status.percent} w="100%" animated aria-label="Import progress" />
        )}
        {importing && status.table && (
          <Text size="sm" c="dimmed" ta="center">Current table: {status.table}</Text>
        )}
        {failed && status.error && (
          <Alert color="red" title="The import of your previous (SQLite) database failed" w="100%">
            <Stack gap="xs">
              <Text size="sm">{status.error.message}</Text>
              {status.error.issues.length > 0 && (
                <Stack gap={2}>
                  {status.error.issues.map((issue, i) => (
                    <Text key={`${issue.table}-${issue.id ?? i}-${i}`} size="xs" ff="monospace">
                      {issue.table}{issue.id ? ` [${issue.id}]` : ''}: {issue.detail}
                    </Text>
                  ))}
                  {status.error.issuesTotal > status.error.issues.length && (
                    <Text size="xs" c="dimmed">…and {status.error.issuesTotal - status.error.issues.length} more (see the container log).</Text>
                  )}
                </Stack>
              )}
              <Text size="sm" c="dimmed">
                Nothing was changed and your original matchexec.db is untouched. Fix the data and restart, or set
                MATCHEXEC_IMPORT_ALLOW_LOSSY=true to skip the problem rows. You can also re-pin the previous version.
              </Text>
            </Stack>
          </Alert>
        )}
      </Stack>
    </Container>
  );
}
