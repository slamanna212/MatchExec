import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { SectionLabel } from '../../../src/components/SectionLabel';

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

describe('SectionLabel', () => {
  it('renders without crashing', () => {
    const container = renderWithMantine(<SectionLabel>Test Label</SectionLabel>);
    expect(visibleText(container)).toContain('Test Label');
    container.remove();
  });

  it('renders its children as text content', () => {
    const container = renderWithMantine(<SectionLabel>Section Name</SectionLabel>);
    expect(visibleText(container)).toBe('Section Name');
    container.remove();
  });

  it('renders at least one element', () => {
    const container = renderWithMantine(<SectionLabel>Players</SectionLabel>);
    const elements = container.querySelectorAll('p, span');
    expect(elements.length).toBeGreaterThan(0);
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof SectionLabel).toBe('function');
  });

  it('accepts React nodes as children', () => {
    const container = renderWithMantine(
      <SectionLabel>
        <span>Nested</span>
      </SectionLabel>
    );
    expect(visibleText(container)).toContain('Nested');
    container.remove();
  });
});
