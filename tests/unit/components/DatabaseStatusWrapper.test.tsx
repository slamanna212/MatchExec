import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('../../../src/components/DatabaseLoadingScreen', () => ({
  DatabaseLoadingScreen: () => React.createElement('div', { 'data-testid': 'loading-screen' }, 'Loading...'),
}));

vi.mock('@/lib/logger/client', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import { DatabaseStatusWrapper } from '../../../src/components/DatabaseStatusWrapper';

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

async function renderWrapper(children: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MantineProvider>
        <DatabaseStatusWrapper>{children}</DatabaseStatusWrapper>
      </MantineProvider>
    );
    await Promise.resolve();
  });
  return container;
}

describe('DatabaseStatusWrapper', () => {
  it('renders children when database is ready', async () => {
    mockFetch({ ready: true, progress: 'Ready', timestamp: Date.now() });
    const container = await renderWrapper(<span>App Content</span>);
    expect(container.textContent).toContain('App Content');
    container.remove();
  });

  it('renders loading screen when database is not ready', async () => {
    mockFetch({ ready: false, progress: 'Migrating...', timestamp: 0 });
    const container = await renderWrapper(<span>App Content</span>);
    expect(container.querySelector('[data-testid="loading-screen"]')).not.toBeNull();
    container.remove();
  });

  it('does not show loading screen when database is ready', async () => {
    mockFetch({ ready: true, progress: 'Ready', timestamp: Date.now() });
    const container = await renderWrapper(<span>Ready</span>);
    expect(container.querySelector('[data-testid="loading-screen"]')).toBeNull();
    container.remove();
  });

  it('renders children when fetch fails (assume ready)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as never;
    const container = await renderWrapper(<span>Fallback Content</span>);
    expect(container.textContent).toContain('Fallback Content');
    container.remove();
  });

  it('renders children initially before fetch completes', () => {
    // Hang the fetch forever
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as never;
    const container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      createRoot(container).render(
        <MantineProvider>
          <DatabaseStatusWrapper><span>content</span></DatabaseStatusWrapper>
        </MantineProvider>
      );
    });
    // Initially isChecking=true but status=null → children are rendered
    expect(container.textContent).toContain('content');
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof DatabaseStatusWrapper).toBe('function');
  });
});
