import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { EmptyState } from '../../../src/components/EmptyState';

function renderWithMantine(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <MantineProvider>{element}</MantineProvider>
    );
  });
  return container;
}

/** Get text from rendered elements, excluding style/script tags */
function visibleText(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6'))
    .map(el => el.textContent ?? '')
    .join('');
}

function MockIcon({ size }: { size: number }) {
  return <svg data-testid="mock-icon" width={size} height={size} />;
}

describe('EmptyState', () => {
  it('renders without crashing', () => {
    const container = renderWithMantine(
      <EmptyState icon={MockIcon} title="No items" />
    );
    expect(visibleText(container)).toContain('No items');
    container.remove();
  });

  it('renders the title', () => {
    const container = renderWithMantine(
      <EmptyState icon={MockIcon} title="Nothing here yet" />
    );
    expect(visibleText(container)).toContain('Nothing here yet');
    container.remove();
  });

  it('renders the description when provided', () => {
    const container = renderWithMantine(
      <EmptyState
        icon={MockIcon}
        title="No matches"
        description="Create one to get started"
      />
    );
    expect(visibleText(container)).toContain('Create one to get started');
    container.remove();
  });

  it('does not render description when not provided', () => {
    const container = renderWithMantine(
      <EmptyState icon={MockIcon} title="Empty" />
    );
    expect(visibleText(container)).not.toContain('Create one to get started');
    expect(visibleText(container)).toContain('Empty');
    container.remove();
  });

  it('renders action when provided', () => {
    const container = renderWithMantine(
      <EmptyState
        icon={MockIcon}
        title="Empty"
        action={<button>Create Now</button>}
      />
    );
    expect(container.querySelector('button')?.textContent).toBe('Create Now');
    container.remove();
  });

  it('does not render a button when action is not provided', () => {
    const container = renderWithMantine(
      <EmptyState icon={MockIcon} title="Empty" />
    );
    expect(container.querySelector('button')).toBeNull();
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof EmptyState).toBe('function');
  });
});
