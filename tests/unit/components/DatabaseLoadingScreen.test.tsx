import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    React.createElement('img', { src, alt }),
}));

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

  it('is a function component', () => {
    expect(typeof DatabaseLoadingScreen).toBe('function');
  });
});
