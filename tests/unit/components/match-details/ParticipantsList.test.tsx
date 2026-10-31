import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { ParticipantsList } from '../../../../src/components/match-details/ParticipantsList';

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

const parseDbTimestamp = () => new Date('2024-01-01');

function makeParticipant(id: string, username: string, team?: 'blue' | 'red' | 'reserve') {
  return {
    id,
    user_id: `u-${id}`,
    username,
    joined_at: '2024-01-01T00:00:00Z',
    signup_data: {},
    team_assignment: team,
  };
}

describe('ParticipantsList', () => {
  it('renders all participants usernames', () => {
    const participants = [
      makeParticipant('1', 'Alice', 'blue'),
      makeParticipant('2', 'Bob', 'red'),
    ];
    const container = renderWithMantine(
      <ParticipantsList
        participants={participants}
        loading={false}
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
  });

  it('shows "No participants yet" for empty list', () => {
    const container = renderWithMantine(
      <ParticipantsList
        participants={[]}
        loading={false}
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    expect(container.textContent).toContain('No participants');
  });

  it('shows "No participants data" for complete match with empty list', () => {
    const container = renderWithMantine(
      <ParticipantsList
        participants={[]}
        loading={false}
        matchStatus="complete"
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    expect(container.textContent).toContain('No participants data');
  });

  it('renders skeleton rows when loading=true', () => {
    const container = renderWithMantine(
      <ParticipantsList
        participants={[]}
        loading={true}
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    // Skeletons are rendered — no "No participants" text
    expect(container.textContent).not.toContain('No participants');
  });

  it('shows Blue Team and Red Team headers when teams are assigned', () => {
    const participants = [
      makeParticipant('1', 'Alice', 'blue'),
      makeParticipant('2', 'Bob', 'red'),
    ];
    const container = renderWithMantine(
      <ParticipantsList
        participants={participants}
        loading={false}
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    expect(container.textContent).toContain('Blue Team');
    expect(container.textContent).toContain('Red Team');
  });

  it('shows Unassigned Players section when participants have reserve team', () => {
    const participants = [
      makeParticipant('1', 'UnassignedPlayer', 'reserve'),
    ];
    const container = renderWithMantine(
      <ParticipantsList
        participants={participants}
        loading={false}
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    expect(container.textContent).toContain('Unassigned');
  });

  it('renders signup_data fields with configured labels', () => {
    const participant = {
      ...makeParticipant('1', 'Alice', 'blue'),
      signup_data: { role: 'DPS' },
    };
    const container = renderWithMantine(
      <ParticipantsList
        participants={[participant]}
        loading={false}
        signupConfig={{ fields: [{ id: 'role', label: 'Role', type: 'text' }] }}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    expect(container.textContent).toContain('Role');
    expect(container.textContent).toContain('DPS');
  });

  it('is a function component', () => {
    expect(typeof ParticipantsList).toBe('function');
  });
});
