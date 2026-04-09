import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { PageHeader } from '../../../src/components/PageHeader';

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

function MockIcon({ size }: { size: number | string }) {
  return <svg data-testid="mock-icon" width={Number(size)} height={Number(size)} />;
}

describe('PageHeader', () => {
  it('renders without crashing', () => {
    const container = renderWithMantine(
      <PageHeader icon={MockIcon} title="Settings" />
    );
    expect(visibleText(container)).toContain('Settings');
    container.remove();
  });

  it('renders the title', () => {
    const container = renderWithMantine(
      <PageHeader icon={MockIcon} title="Match Dashboard" />
    );
    expect(visibleText(container)).toContain('Match Dashboard');
    container.remove();
  });

  it('renders subtitle when provided', () => {
    const container = renderWithMantine(
      <PageHeader
        icon={MockIcon}
        title="Settings"
        subtitle="Configure your application"
      />
    );
    expect(visibleText(container)).toContain('Configure your application');
    container.remove();
  });

  it('does not render subtitle when not provided', () => {
    const container = renderWithMantine(
      <PageHeader icon={MockIcon} title="Settings" />
    );
    expect(visibleText(container)).not.toContain('Configure your application');
    expect(visibleText(container)).toContain('Settings');
    container.remove();
  });

  it('renders action element when provided', () => {
    const container = renderWithMantine(
      <PageHeader
        icon={MockIcon}
        title="Matches"
        action={<button>Create Match</button>}
      />
    );
    expect(container.querySelector('button')?.textContent).toBe('Create Match');
    container.remove();
  });

  it('does not render a button when action is not provided', () => {
    const container = renderWithMantine(
      <PageHeader icon={MockIcon} title="Matches" />
    );
    expect(container.querySelector('button')).toBeNull();
    container.remove();
  });

  it('uses h2 as the heading element (order={2})', () => {
    const container = renderWithMantine(
      <PageHeader icon={MockIcon} title="Dashboard" />
    );
    const heading = container.querySelector('h2');
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe('Dashboard');
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof PageHeader).toBe('function');
  });
});
