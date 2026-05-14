import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MapStatCard } from '../../../../src/components/stats/MapStatCard';

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

function defaultProps(overrides: Partial<React.ComponentProps<typeof MapStatCard>> = {}) {
  return {
    round: 1,
    status: 'pending' as const,
    blueSubmitted: false,
    redSubmitted: false,
    onView: vi.fn(),
    ...overrides,
  };
}

describe('MapStatCard', () => {
  it('renders map name when provided', () => {
    const container = renderWithMantine(
      <MapStatCard {...defaultProps({ mapName: 'Hanamura' })} />
    );
    expect(container.textContent).toContain('Hanamura');
  });

  it('renders fallback "Map N" when mapName is not provided', () => {
    const container = renderWithMantine(
      <MapStatCard {...defaultProps({ round: 3 })} />
    );
    expect(container.textContent).toContain('Map 3');
  });

  it('renders round number', () => {
    const container = renderWithMantine(
      <MapStatCard {...defaultProps({ round: 2 })} />
    );
    expect(container.textContent).toContain('Round 2');
  });

  it('renders Completed badge for completed status', () => {
    const container = renderWithMantine(
      <MapStatCard {...defaultProps({ status: 'completed' })} />
    );
    expect(container.textContent).toContain('Completed');
  });

  it('renders Ongoing badge for ongoing status', () => {
    const container = renderWithMantine(
      <MapStatCard {...defaultProps({ status: 'ongoing' })} />
    );
    expect(container.textContent).toContain('Ongoing');
  });

  it('renders Pending badge for pending status', () => {
    const container = renderWithMantine(
      <MapStatCard {...defaultProps({ status: 'pending' })} />
    );
    expect(container.textContent).toContain('Pending');
  });

  it('renders Blue and Red side labels', () => {
    const container = renderWithMantine(
      <MapStatCard {...defaultProps()} />
    );
    expect(container.textContent).toContain('Blue');
    expect(container.textContent).toContain('Red');
  });

  it('renders "Match Players" button', () => {
    const container = renderWithMantine(
      <MapStatCard {...defaultProps()} />
    );
    expect(container.textContent).toContain('Match Players');
  });

  it('calls onView when Match Players button is clicked', () => {
    const onView = vi.fn();
    const container = renderWithMantine(
      <MapStatCard {...defaultProps({ onView })} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const viewBtn = buttons.find(b => b.textContent?.includes('Match Players'));
    act(() => { viewBtn?.click(); });
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when mapImageUrl is undefined', () => {
    expect(() => {
      renderWithMantine(<MapStatCard {...defaultProps({ mapImageUrl: undefined })} />);
    }).not.toThrow();
  });

  it('is a function component', () => {
    expect(typeof MapStatCard).toBe('function');
  });
});
