import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { TournamentFormatStep } from '../../../../src/components/create-tournament/TournamentFormatStep';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];
const originalFetch = globalThis.fetch;

afterEach(() => {
  act(() => { roots.forEach(r => r.unmount()); });
  divs.forEach(d => d.remove());
  roots.length = 0;
  divs.length = 0;
  globalThis.fetch = originalFetch;
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

function defaultProps(overrides = {}) {
  return {
    formData: { gameId: 'ow', format: 'single-elimination' as const },
    updateFormData: vi.fn(),
    onBack: vi.fn(),
    onNext: vi.fn(),
    canProceed: true,
    ...overrides,
  };
}

describe('TournamentFormatStep', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ id: 'mode-1', name: 'Control', team_size: 5, max_players: 10 }]),
    }) as never;
  });

  it('renders tournament format heading', () => {
    const container = renderWithMantine(<TournamentFormatStep {...defaultProps()} />);
    expect(container.textContent).toContain('Select tournament format');
  });

  it('renders Tournament Format selector', () => {
    const container = renderWithMantine(<TournamentFormatStep {...defaultProps()} />);
    expect(container.textContent).toContain('Tournament Format');
  });

  it('renders Game Mode selector', () => {
    const container = renderWithMantine(<TournamentFormatStep {...defaultProps()} />);
    expect(container.textContent).toContain('Game Mode');
  });

  it('disables Next button when canProceed=false', () => {
    const container = renderWithMantine(
      <TournamentFormatStep {...defaultProps({ canProceed: false })} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const nextBtn = buttons.find(b => b.textContent?.includes('Next'));
    expect((nextBtn as HTMLButtonElement)?.disabled).toBe(true);
  });

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn();
    const container = renderWithMantine(<TournamentFormatStep {...defaultProps({ onBack })} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const backBtn = buttons.find(b => b.textContent?.trim() === 'Back');
    act(() => { backBtn?.click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('is a function component', () => {
    expect(typeof TournamentFormatStep).toBe('function');
  });
});
