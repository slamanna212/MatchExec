import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { PageLayout } from '../../../src/components/PageLayout';

function renderWithMantine(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<MantineProvider>{element}</MantineProvider>);
  });
  return container;
}

describe('PageLayout', () => {
  it('renders children', () => {
    const container = renderWithMantine(
      <PageLayout><p>Hello World</p></PageLayout>
    );
    expect(container.textContent).toContain('Hello World');
    container.remove();
  });

  it('renders multiple children', () => {
    const container = renderWithMantine(
      <PageLayout>
        <span>First</span>
        <span>Second</span>
      </PageLayout>
    );
    expect(container.textContent).toContain('First');
    expect(container.textContent).toContain('Second');
    container.remove();
  });

  it('renders without crashing when no narrow prop', () => {
    expect(() => {
      const container = renderWithMantine(<PageLayout><div /></PageLayout>);
      container.remove();
    }).not.toThrow();
  });

  it('renders without crashing when narrow=true', () => {
    expect(() => {
      const container = renderWithMantine(<PageLayout narrow><div /></PageLayout>);
      container.remove();
    }).not.toThrow();
  });

  it('renders a wrapper div around children', () => {
    const container = renderWithMantine(
      <PageLayout><span id="inner">content</span></PageLayout>
    );
    expect(container.querySelector('#inner')).not.toBeNull();
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof PageLayout).toBe('function');
  });
});
