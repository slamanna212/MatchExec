import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('../../../../src/components/create-match/EventImageUpload', () => ({
  EventImageUpload: () => React.createElement('div', { 'data-testid': 'event-image-upload' }),
}));

import { TournamentEventInfoStep } from '../../../../src/components/create-tournament/TournamentEventInfoStep';

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

function defaultProps(overrides = {}) {
  return {
    formData: { name: 'Test Tournament', roundsPerMatch: 3 },
    imagePreview: null,
    uploadingImage: false,
    updateFormData: vi.fn(),
    onImageUpload: vi.fn().mockResolvedValue(undefined),
    onRemoveImage: vi.fn().mockResolvedValue(undefined),
    onBack: vi.fn(),
    onNext: vi.fn(),
    canProceed: true,
    hasStatDefs: false,
    aiProvidersConfigured: false,
    ...overrides,
  };
}

describe('TournamentEventInfoStep', () => {
  it('renders tournament information heading', () => {
    const container = renderWithMantine(<TournamentEventInfoStep {...defaultProps()} />);
    expect(container.textContent).toContain('Enter tournament information');
  });

  it('renders Tournament Name input', () => {
    const container = renderWithMantine(<TournamentEventInfoStep {...defaultProps()} />);
    expect(container.textContent).toContain('Tournament Name');
  });

  it('renders Rounds per Match input', () => {
    const container = renderWithMantine(<TournamentEventInfoStep {...defaultProps()} />);
    expect(container.textContent).toContain('Rounds per Match');
  });

  it('disables Next button when canProceed=false', () => {
    const container = renderWithMantine(
      <TournamentEventInfoStep {...defaultProps({ canProceed: false })} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const nextBtn = buttons.find(b => b.textContent?.includes('Next'));
    expect((nextBtn as HTMLButtonElement)?.disabled).toBe(true);
  });

  it('enables Next button when canProceed=true', () => {
    const container = renderWithMantine(
      <TournamentEventInfoStep {...defaultProps({ canProceed: true })} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const nextBtn = buttons.find(b => b.textContent?.includes('Next'));
    expect((nextBtn as HTMLButtonElement)?.disabled).toBe(false);
  });

  it('shows Stats Collection checkbox when hasStatDefs=true', () => {
    const container = renderWithMantine(
      <TournamentEventInfoStep {...defaultProps({ hasStatDefs: true })} />
    );
    expect(container.textContent).toContain('Enable Stats Collection');
  });

  it('is a function component', () => {
    expect(typeof TournamentEventInfoStep).toBe('function');
  });
});
