import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('../../../../src/components/create-tournament/TeamList', () => ({
  TeamList: ({ teams }: { teams: string[] }) =>
    React.createElement('div', { 'data-testid': 'team-list' }, `${teams.length} teams`),
}));

import { TournamentTeamSettingsStep } from '../../../../src/components/create-tournament/TournamentTeamSettingsStep';

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
    formData: { preCreatedTeams: [] },
    newTeamName: '',
    updateFormData: vi.fn(),
    onAddTeam: vi.fn(),
    onRemoveTeam: vi.fn(),
    onBack: vi.fn(),
    onNext: vi.fn(),
    setNewTeamName: vi.fn(),
    ...overrides,
  };
}

describe('TournamentTeamSettingsStep', () => {
  it('renders team settings heading', () => {
    const container = renderWithMantine(<TournamentTeamSettingsStep {...defaultProps()} />);
    expect(container.textContent).toContain('Configure team settings');
  });

  it('renders Max Participants input', () => {
    const container = renderWithMantine(<TournamentTeamSettingsStep {...defaultProps()} />);
    expect(container.textContent).toContain('Max Participants');
  });

  it('renders team name text input', () => {
    const container = renderWithMantine(<TournamentTeamSettingsStep {...defaultProps()} />);
    const input = container.querySelector('input[placeholder="Enter team name"]');
    expect(input).not.toBeNull();
  });

  it('disables Add Team button when newTeamName is empty', () => {
    const container = renderWithMantine(<TournamentTeamSettingsStep {...defaultProps({ newTeamName: '' })} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent?.includes('Add Team'));
    expect((addBtn as HTMLButtonElement)?.disabled).toBe(true);
  });

  it('enables Add Team button when newTeamName is set', () => {
    const container = renderWithMantine(
      <TournamentTeamSettingsStep {...defaultProps({ newTeamName: 'Blue Squad' })} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent?.includes('Add Team'));
    expect((addBtn as HTMLButtonElement)?.disabled).toBe(false);
  });

  it('calls onAddTeam when Add Team button is clicked with a name', () => {
    const onAddTeam = vi.fn();
    const container = renderWithMantine(
      <TournamentTeamSettingsStep {...defaultProps({ newTeamName: 'Red Squad', onAddTeam })} />
    );
    const buttons = Array.from(container.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent?.includes('Add Team'));
    act(() => { addBtn?.click(); });
    expect(onAddTeam).toHaveBeenCalledWith('Red Squad');
  });

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn();
    const container = renderWithMantine(<TournamentTeamSettingsStep {...defaultProps({ onBack })} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    const backBtn = buttons.find(b => b.textContent?.trim() === 'Back');
    act(() => { backBtn?.click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('is a function component', () => {
    expect(typeof TournamentTeamSettingsStep).toBe('function');
  });
});
