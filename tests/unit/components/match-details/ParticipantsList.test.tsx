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

/** A participant as the API returns it, with its own team (name / order). */
function makeTeamed(id: string, username: string, order: number | null, name: string | null, reserve = false) {
  return {
    ...makeParticipant(id, username, reserve ? 'reserve' : order === 0 ? 'blue' : order === 1 ? 'red' : undefined),
    team_id: order === null ? null : `team-${order}`,
    team_name: name,
    team_order: order,
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

  it('shows no team sections for an FFA match even though the API labels orders 0 and 1 blue/red', () => {
    // One match_teams row per participant: the first two get team_order 0 and 1 (-> blue / red).
    const participants = [
      makeTeamed('1', 'FFAPlayer1', 0, 'FFAPlayer1'),
      makeTeamed('2', 'FFAPlayer2', 1, 'FFAPlayer2'),
      makeTeamed('3', 'FFAPlayer3', 2, 'FFAPlayer3'),
      makeTeamed('4', 'FFAPlayer4', 3, 'FFAPlayer4'),
    ];
    const container = renderWithMantine(
      <ParticipantsList
        participants={participants}
        loading={false}
        scoringType="FFA"
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    for (const name of ['FFAPlayer1', 'FFAPlayer2', 'FFAPlayer3', 'FFAPlayer4']) expect(container.textContent).toContain(name);
    expect(container.textContent).not.toContain('Blue Team');
    expect(container.textContent).not.toContain('Red Team');
    expect(container.textContent).not.toContain('Unassigned');
  });

  it('shows no team sections for a Position match with one driver per team', () => {
    const participants = [makeTeamed('1', 'Driver1', 0, 'Driver1'), makeTeamed('2', 'Driver2', 1, 'Driver2')];
    const container = renderWithMantine(
      <ParticipantsList
        participants={participants}
        loading={false}
        scoringType="Position"
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    expect(container.textContent).toContain('Driver1');
    expect(container.textContent).not.toContain('Blue Team');
    expect(container.textContent).not.toContain('Red Team');
  });

  it('groups a Position team mode (squads) by team name', () => {
    const participants = [
      makeTeamed('1', 'A1', 0, 'Team 1'),
      makeTeamed('2', 'A2', 0, 'Team 1'),
      makeTeamed('3', 'B1', 1, 'Team 2'),
      makeTeamed('4', 'B2', 1, 'Team 2'),
      makeTeamed('5', 'Spare', 99, 'Reserve', true),
    ];
    const container = renderWithMantine(
      <ParticipantsList
        participants={participants}
        loading={false}
        scoringType="Position"
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    expect(container.textContent).toContain('Team 1');
    expect(container.textContent).toContain('Team 2');
    expect(container.textContent).not.toContain('Blue Team');
    expect(container.textContent).toContain('Unassigned Players');
    expect(container.textContent).toContain('Spare');
  });

  it('shows one section per team for a Normal match with more than two teams', () => {
    const participants = [
      makeTeamed('1', 'P1', 0, 'Team 1'),
      makeTeamed('2', 'P2', 1, 'Team 2'),
      makeTeamed('3', 'P3', 2, 'Team 3'),
    ];
    const container = renderWithMantine(
      <ParticipantsList
        participants={participants}
        loading={false}
        scoringType="Normal"
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    expect(container.textContent).toContain('Team 1');
    expect(container.textContent).toContain('Team 2');
    expect(container.textContent).toContain('Team 3');
    expect(container.textContent).not.toContain('Red Team');
  });

  it('uses the real team names for a two-team Normal match with named teams (tournament matches)', () => {
    const participants = [makeTeamed('1', 'P1', 0, 'Alpha'), makeTeamed('2', 'P2', 1, 'Charlie')];
    const container = renderWithMantine(
      <ParticipantsList
        participants={participants}
        loading={false}
        signupConfig={null}
        parseDbTimestamp={parseDbTimestamp}
      />
    );
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Charlie');
    expect(container.textContent).not.toContain('Blue Team');
  });

  it('keeps the Blue/Red titles for the default two-team names', () => {
    const participants = [makeTeamed('1', 'P1', 0, 'Blue'), makeTeamed('2', 'P2', 1, 'Red')];
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

  it('is a function component', () => {
    expect(typeof ParticipantsList).toBe('function');
  });
});
