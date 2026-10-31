import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('@/components/navigation', () => ({
  Navigation: ({ children }: { children: React.ReactNode }) =>
    React.createElement('nav', { 'data-testid': 'navigation' }, children),
}));

import { ConditionalNavigation } from '../../../src/components/ConditionalNavigation';

function renderWithMantine(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<MantineProvider>{element}</MantineProvider>);
  });
  return container;
}

describe('ConditionalNavigation', () => {
  it('renders Navigation wrapper on non-welcome paths', () => {
    mockPathname = '/';
    const container = renderWithMantine(
      <ConditionalNavigation><span>content</span></ConditionalNavigation>
    );
    expect(container.querySelector('[data-testid="navigation"]')).not.toBeNull();
    container.remove();
  });

  it('does not render Navigation wrapper on /welcome path', () => {
    mockPathname = '/welcome';
    const container = renderWithMantine(
      <ConditionalNavigation><span>content</span></ConditionalNavigation>
    );
    expect(container.querySelector('[data-testid="navigation"]')).toBeNull();
    container.remove();
  });

  it('does not render Navigation wrapper on /welcome/step-1 (nested route)', () => {
    mockPathname = '/welcome/step-1';
    const container = renderWithMantine(
      <ConditionalNavigation><span>content</span></ConditionalNavigation>
    );
    expect(container.querySelector('[data-testid="navigation"]')).toBeNull();
    container.remove();
  });

  it('renders children on welcome path', () => {
    mockPathname = '/welcome';
    const container = renderWithMantine(
      <ConditionalNavigation><span>child-content</span></ConditionalNavigation>
    );
    expect(container.textContent).toContain('child-content');
    container.remove();
  });

  it('renders children inside Navigation on non-welcome paths', () => {
    mockPathname = '/matches';
    const container = renderWithMantine(
      <ConditionalNavigation><span>match-content</span></ConditionalNavigation>
    );
    expect(container.textContent).toContain('match-content');
    container.remove();
  });

  it('renders Navigation wrapper on /settings path', () => {
    mockPathname = '/settings';
    const container = renderWithMantine(
      <ConditionalNavigation><span>settings</span></ConditionalNavigation>
    );
    expect(container.querySelector('[data-testid="navigation"]')).not.toBeNull();
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof ConditionalNavigation).toBe('function');
  });
});
