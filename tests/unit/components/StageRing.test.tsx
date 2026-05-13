import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { StageRing } from '../../../src/components/StageRing';

function renderWithMantine(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<MantineProvider>{element}</MantineProvider>);
  });
  return container;
}

describe('StageRing', () => {
  it('renders without crashing for "created" status', () => {
    const container = renderWithMantine(<StageRing status="created" />);
    expect(container.firstChild).not.toBeNull();
    container.remove();
  });

  it('renders without crashing for "gather" status', () => {
    const container = renderWithMantine(<StageRing status="gather" />);
    expect(container.firstChild).not.toBeNull();
    container.remove();
  });

  it('renders without crashing for "battle" status', () => {
    const container = renderWithMantine(<StageRing status="battle" />);
    expect(container.firstChild).not.toBeNull();
    container.remove();
  });

  it('renders without crashing for "complete" status', () => {
    const container = renderWithMantine(<StageRing status="complete" />);
    expect(container.firstChild).not.toBeNull();
    container.remove();
  });

  it('renders without crashing for "cancelled" status', () => {
    const container = renderWithMantine(<StageRing status="cancelled" />);
    expect(container.firstChild).not.toBeNull();
    container.remove();
  });

  it('does not crash for an unknown/unsupported status', () => {
    expect(() => {
      const container = renderWithMantine(<StageRing status="unknown-stage" />);
      container.remove();
    }).not.toThrow();
  });

  it('accepts tournament type without crashing', () => {
    const container = renderWithMantine(<StageRing status="battle" type="tournament" />);
    expect(container.firstChild).not.toBeNull();
    container.remove();
  });

  it('accepts custom gameColor without crashing', () => {
    const container = renderWithMantine(<StageRing status="gather" gameColor="#ff5733" />);
    expect(container.firstChild).not.toBeNull();
    container.remove();
  });

  it('accepts custom size and thickness props', () => {
    const container = renderWithMantine(<StageRing status="created" size={80} thickness={8} />);
    expect(container.firstChild).not.toBeNull();
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof StageRing).toBe('function');
  });
});
