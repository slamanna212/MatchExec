import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

vi.mock('framer-motion', () => {
  const make = (tag: string) =>
    ({ children, initial: _i, animate: _a, transition: _t, ...rest }: Record<string, unknown>) =>
      React.createElement(tag, rest, children as React.ReactNode);
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => make(tag) }),
  };
});

import WelcomePage from '../../../src/client/pages/welcome/page';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  root = null;
  container = null;
});

function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(
      <MantineProvider>
        <MemoryRouter><WelcomePage /></MemoryRouter>
      </MantineProvider>,
    );
  });
}

const findButton = (label: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(label));

describe('Welcome page restore button', () => {
  it('renders Restore Backup immediately after Pro Mode', () => {
    renderPage();
    const pro = findButton('Pro Mode');
    const restore = findButton('Restore Backup');
    expect(pro).toBeDefined();
    expect(restore).toBeDefined();
    expect(pro!.nextElementSibling).toBe(restore);
  });

  it('opens the restore modal when clicked', async () => {
    renderPage();
    act(() => { findButton('Restore Backup')!.click(); });
    await vi.waitFor(() => expect(document.body.textContent).toContain('Restore from file'));
  });
});
