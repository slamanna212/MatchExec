import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { KeyboardShortcutsProvider } from '../../../../src/components/keyboard-shortcuts/KeyboardShortcutsProvider';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

afterEach(() => {
  act(() => { roots.forEach(r => r.unmount()); });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
});

function renderWithMantine(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  divs.push(container);
  act(() => {
    const root = createRoot(container);
    roots.push(root);
    root.render(<MantineProvider>{element}</MantineProvider>);
  });
  return container;
}

describe('KeyboardShortcutsProvider', () => {
  it('renders children', () => {
    const container = renderWithMantine(
      <KeyboardShortcutsProvider>
        <div data-testid="child-content">Hello World</div>
      </KeyboardShortcutsProvider>
    );
    expect(container.textContent).toContain('Hello World');
  });

  it('does not show the shortcuts modal by default', () => {
    renderWithMantine(
      <KeyboardShortcutsProvider>
        <span>content</span>
      </KeyboardShortcutsProvider>
    );
    // Modal is not open by default — "Keyboard Shortcuts" should not be visible
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain('Keyboard Shortcuts');
  });

  it('registers hotkeys without crashing', () => {
    expect(() => {
      renderWithMantine(
        <KeyboardShortcutsProvider>
          <div>test</div>
        </KeyboardShortcutsProvider>
      );
    }).not.toThrow();
  });

  it('dispatches keyboard event without throwing', () => {
    renderWithMantine(
      <KeyboardShortcutsProvider>
        <div>content</div>
      </KeyboardShortcutsProvider>
    );
    expect(() => {
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      });
    }).not.toThrow();
  });

  it('is a function component', () => {
    expect(typeof KeyboardShortcutsProvider).toBe('function');
  });
});
