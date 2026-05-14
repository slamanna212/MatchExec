import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { FormatBadge } from '../../../../src/components/scoring/shared/FormatBadge';

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

describe('FormatBadge', () => {
  it('renders "Competitive" label for competitive format', () => {
    const container = renderWithMantine(<FormatBadge format="competitive" />);
    expect(container.textContent).toContain('Competitive');
  });

  it('renders "Casual" label for casual format', () => {
    const container = renderWithMantine(<FormatBadge format="casual" />);
    expect(container.textContent).toContain('Casual');
  });

  it('renders an SVG icon for competitive format', () => {
    const container = renderWithMantine(<FormatBadge format="competitive" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders an SVG icon for casual format', () => {
    const container = renderWithMantine(<FormatBadge format="casual" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders without crashing for each size prop', () => {
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
    for (const size of sizes) {
      expect(() => {
        renderWithMantine(<FormatBadge format="competitive" size={size} />);
      }).not.toThrow();
    }
  });

  it('is a function component', () => {
    expect(typeof FormatBadge).toBe('function');
  });
});
