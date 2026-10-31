import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { RemindersList } from '../../../../src/components/match-details/RemindersList';
import { ReminderCard } from '../../../../src/components/match-details/ReminderCard';

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

const parseTs = (ts: string | null | undefined) => ts ? new Date('2024-06-01T10:00:00Z') : null;

function makeReminder(overrides: Partial<{
  id: string;
  status: 'pending' | 'sent' | 'failed' | 'processed' | 'completed' | 'scheduled';
  description: string;
  type: 'discord_general' | 'discord_match' | 'discord_player' | 'timed_announcement';
  sent_at: string;
  error_message: string;
}> = {}) {
  return {
    id: 'r-1',
    match_id: 'm-1',
    reminder_time: '2024-06-01T09:00:00Z',
    status: 'pending' as const,
    created_at: '2024-06-01T00:00:00Z',
    type: 'discord_player' as const,
    ...overrides,
  };
}

describe('RemindersList', () => {
  it('renders each reminder', () => {
    const reminders = [
      makeReminder({ id: 'r-1', status: 'sent' }),
      makeReminder({ id: 'r-2', status: 'pending' }),
    ];
    const container = renderWithMantine(
      <RemindersList reminders={reminders} loading={false} parseDbTimestamp={parseTs} />
    );
    expect(container.querySelectorAll('[class*="mantine-Card"]').length).toBeGreaterThanOrEqual(2);
  });

  it('shows empty state for active match with no reminders', () => {
    const container = renderWithMantine(
      <RemindersList reminders={[]} loading={false} parseDbTimestamp={parseTs} />
    );
    expect(container.textContent).toContain('No scheduled announcements');
  });

  it('shows "No reminders were sent" for complete match with empty list', () => {
    const container = renderWithMantine(
      <RemindersList
        reminders={[]}
        loading={false}
        matchStatus="complete"
        parseDbTimestamp={parseTs}
      />
    );
    expect(container.textContent).toContain('No reminders were sent');
  });

  it('renders skeletons when loading=true', () => {
    const container = renderWithMantine(
      <RemindersList reminders={[]} loading={true} parseDbTimestamp={parseTs} />
    );
    expect(container.textContent).not.toContain('No scheduled');
  });

  it('is a function component', () => {
    expect(typeof RemindersList).toBe('function');
  });
});

describe('ReminderCard', () => {
  it('renders sent status badge', () => {
    const container = renderWithMantine(
      <ReminderCard reminder={makeReminder({ status: 'sent' })} parseDbTimestamp={parseTs} showDescription={true} />
    );
    expect(container.textContent?.toLowerCase()).toContain('sent');
  });

  it('renders pending status badge', () => {
    const container = renderWithMantine(
      <ReminderCard reminder={makeReminder({ status: 'pending' })} parseDbTimestamp={parseTs} showDescription={true} />
    );
    expect(container.textContent?.toLowerCase()).toContain('pending');
  });

  it('renders error message when present', () => {
    const container = renderWithMantine(
      <ReminderCard
        reminder={makeReminder({ status: 'failed', error_message: 'Network timeout' })}
        parseDbTimestamp={parseTs}
        showDescription={true}
      />
    );
    expect(container.textContent).toContain('Network timeout');
  });

  it('shows description for timed_announcement type when showDescription=true', () => {
    const container = renderWithMantine(
      <ReminderCard
        reminder={makeReminder({ type: 'timed_announcement', description: 'Match starts soon!' })}
        parseDbTimestamp={parseTs}
        showDescription={true}
      />
    );
    expect(container.textContent).toContain('Match starts soon!');
  });

  it('shows reminder time', () => {
    const container = renderWithMantine(
      <ReminderCard reminder={makeReminder()} parseDbTimestamp={parseTs} showDescription={true} />
    );
    // parseTs always returns 2024-06-01T10:00:00Z
    expect(container.textContent).toContain('Reminder Time');
  });

  it('is a function component', () => {
    expect(typeof ReminderCard).toBe('function');
  });
});
