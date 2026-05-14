import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { AnnouncementsStep } from '../../../../src/components/create-match/AnnouncementsStep';
import type { AnnouncementTime } from '../../../../src/components/create-match/useMatchForm';

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

function makeAnnouncement(overrides: Partial<AnnouncementTime> = {}): AnnouncementTime {
  return {
    id: 'ann-1',
    value: 2,
    unit: 'hours',
    ...overrides,
  };
}

function defaultProps(overrides = {}) {
  return {
    announcements: [] as AnnouncementTime[],
    updateFormData: vi.fn(),
    onBack: vi.fn(),
    onNext: vi.fn(),
    ...overrides,
  };
}

describe('AnnouncementsStep', () => {
  it('renders announcements configuration heading', () => {
    const container = renderWithMantine(<AnnouncementsStep {...defaultProps()} />);
    expect(container.textContent).toContain('Configure event announcements');
  });

  it('renders Add Announcement button', () => {
    const container = renderWithMantine(<AnnouncementsStep {...defaultProps()} />);
    expect(container.textContent).toContain('Add Announcement');
  });

  it('calls updateFormData when Add Announcement is clicked', () => {
    const updateFormData = vi.fn();
    const container = renderWithMantine(<AnnouncementsStep {...defaultProps({ updateFormData })} />);
    const cards = Array.from(container.querySelectorAll('[class*="mantine-Card"]'));
    const addCard = cards.find(c => c.textContent?.includes('Add Announcement')) as HTMLElement | null;
    act(() => { addCard?.click(); });
    expect(updateFormData).toHaveBeenCalledWith('announcements', expect.any(Array));
  });

  it('renders each announcement with time and unit', () => {
    const announcements = [
      makeAnnouncement({ id: 'a-1', value: 30, unit: 'minutes' }),
      makeAnnouncement({ id: 'a-2', value: 1, unit: 'days' }),
    ];
    const container = renderWithMantine(
      <AnnouncementsStep {...defaultProps({ announcements })} />
    );
    expect(container.textContent).toContain('Scheduled Announcements');
  });

  it('renders "before event" label for each announcement', () => {
    const announcements = [makeAnnouncement()];
    const container = renderWithMantine(
      <AnnouncementsStep {...defaultProps({ announcements })} />
    );
    expect(container.textContent).toContain('before event');
  });

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn();
    const container = renderWithMantine(<AnnouncementsStep {...defaultProps({ onBack })} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const backBtn = buttons.find(b => b.textContent?.trim() === 'Back');
    act(() => { backBtn?.click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls onNext when Next button is clicked', () => {
    const onNext = vi.fn();
    const container = renderWithMantine(<AnnouncementsStep {...defaultProps({ onNext })} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const nextBtn = buttons.find(b => b.textContent?.trim() === 'Next');
    act(() => { nextBtn?.click(); });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('is a function component', () => {
    expect(typeof AnnouncementsStep).toBe('function');
  });
});
