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

  it('uses an explicit value (e.g. series completion %) instead of the status', () => {
    const container = renderWithMantine(<StageRing value={50} gameColor="#ff0000" />);
    // RingProgress draws the section as an SVG circle whose dash array reflects the value.
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThan(1);
    const dash = (circles[circles.length - 1] as SVGCircleElement).getAttribute('stroke-dasharray') ?? '';
    const [filled, total] = dash.split(',').map(Number);
    expect(filled / (filled + total)).toBeCloseTo(0.5, 1);
    container.remove();
  });

  it('is a function component', () => {
    expect(typeof StageRing).toBe('function');
  });
});
