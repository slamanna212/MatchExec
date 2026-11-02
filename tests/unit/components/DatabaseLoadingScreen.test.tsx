import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('@/lib/logger/client', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import { DatabaseLoadingScreen } from '../../../src/components/DatabaseLoadingScreen';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function mockFetch(data: object, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => data,
  }) as never;
}

function renderWithMantine(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<MantineProvider>{element}</MantineProvider>);
  });
  return container;
}

describe('DatabaseLoadingScreen', () => {
  it('renders loading UI when database is not ready', async () => {
    mockFetch({ ready: false, progress: 'Running migrations...', timestamp: 0 });

    let container!: HTMLDivElement;
    await act(async () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      createRoot(container).render(<MantineProvider><DatabaseLoadingScreen /></MantineProvider>);
      await Promise.resolve();
    });

    expect(container.firstChild).not.toBeNull();
    container.remove();
  });

  it('shows progress text from status response', async () => {
    mockFetch({ ready: false, progress: 'Running migrations...', timestamp: 0 });

    let container!: HTMLDivElement;
    await act(async () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      createRoot(container).render(<MantineProvider><DatabaseLoadingScreen /></MantineProvider>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Running migrations...');
    container.remove();
  });

  it('does not render loading text when database is ready', async () => {
    mockFetch({ ready: true, progress: 'Done', timestamp: Date.now() });

    let container!: HTMLDivElement;
    await act(async () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      createRoot(container).render(<MantineProvider><DatabaseLoadingScreen /></MantineProvider>);
      await Promise.resolve();
    });

    // Component returns null — no loading-screen text nodes in the DOM
    expect(container.querySelector('[class*="mantine-Container"]')).toBeNull();
    expect(container.textContent).not.toContain('database');
    container.remove();
  });

  it('does not crash when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as never;

    await act(async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      expect(() => {
        createRoot(container).render(<MantineProvider><DatabaseLoadingScreen /></MantineProvider>);
      }).not.toThrow();
      await Promise.resolve();
      container.remove();
    });
  });

  it('shows initial "Initializing database..." message before fetch resolves', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as never;
    const container = renderWithMantine(<DatabaseLoadingScreen />);
    expect(container.textContent).toContain('Initializing database...');
    container.remove();
  });

  async function renderWithStatus(data: object): Promise<HTMLDivElement> {
    mockFetch(data);
    let container!: HTMLDivElement;
    await act(async () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      createRoot(container).render(<MantineProvider><DatabaseLoadingScreen /></MantineProvider>);
      await Promise.resolve();
    });
    return container;
  }

  it('shows the phase, the table being imported and the progress bar during a SQLite import (plan 5.4)', async () => {
    const container = await renderWithStatus({
      ready: false, progress: 'Importing match_games (26/58)...', timestamp: 1, phase: 'importing', percent: 52, table: 'match_games',
    });
    expect(container.textContent).toContain('Importing your existing data');
    expect(container.textContent).toContain('Importing match_games (26/58)...');
    expect(container.textContent).toContain('Current table: match_games');
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    container.remove();
  });

  it('shows the error summary when the import failed', async () => {
    const container = await renderWithStatus({
      ready: false, progress: 'Legacy import failed: boom', timestamp: 1, phase: 'error', percent: 0,
      error: {
        message: 'The legacy SQLite database cannot be imported as-is: 2 problem(s) found.',
        issues: [{ table: 'match_games', id: 'g1', detail: 'match_id=m9 -> matches does not exist' }],
        issuesTotal: 12, repairs: 0,
      },
    });
    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain('The import of your previous (SQLite) database failed');
    expect(container.textContent).toContain('cannot be imported as-is');
    expect(container.textContent).toContain('match_games [g1]: match_id=m9 -> matches does not exist');
    expect(container.textContent).toContain('and 11 more');
    expect(container.textContent).toContain('MATCHEXEC_IMPORT_ALLOW_LOSSY=true');
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof DatabaseLoadingScreen).toBe('function');
  });
});
