import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

vi.mock('@mantine/modals', () => ({ modals: { openConfirmModal: vi.fn() } }));

import { modals } from '@mantine/modals';
import { TournamentInfoPanel } from '../../../../src/components/tournament-details/TournamentInfoPanel';
import type { TournamentWithGameDetails } from '../../../../shared/types';

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ memberships: [] }) })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  act(() => { roots.forEach((r) => r.unmount()); });
  divs.forEach((d) => d.remove());
  roots.length = 0;
  divs.length = 0;
});

function renderPanel(tournament: Partial<TournamentWithGameDetails>, handlers: { onProgressTournament?: () => Promise<void> } = {}): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  divs.push(container);
  const t = {
    id: 't1', name: 'QA Cup', status: 'battle', format: 'single-elimination', game_name: 'VALORANT',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', rounds_per_match: 3, ...tournament,
  } as TournamentWithGameDetails;
  act(() => {
    const root = createRoot(container);
    roots.push(root);
    root.render(
      <MantineProvider>
        <MemoryRouter>
          <TournamentInfoPanel
            tournament={t}
            hasBracket
            parseDbTimestamp={(ts) => (ts ? new Date(ts) : null)}
            onAssignTeams={vi.fn()}
            onDelete={vi.fn()}
            onEdit={vi.fn()}
            onStatusTransition={vi.fn()}
            onGenerateBracket={vi.fn(async () => {})}
            onProgressTournament={handlers.onProgressTournament ?? vi.fn(async () => {})}
          />
        </MemoryRouter>
      </MantineProvider>,
    );
  });
  return container;
}

const primary = (c: HTMLElement, label: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

describe('TournamentInfoPanel next-round action', () => {
  it('says "Next Round" while there are more rounds', () => {
    const c = renderPanel({ progress_hint: { canAdvance: true, willComplete: false, reason: null } });
    expect(primary(c, 'Next Round')).toBeTruthy();
    expect(primary(c, 'Next Round')!.disabled).toBe(false);
    expect(primary(c, 'Finish Tournament')).toBeUndefined();
  });

  it('says "Finish Tournament" on the last round and confirms with matching wording', () => {
    vi.mocked(modals.openConfirmModal).mockClear();
    const onProgress = vi.fn(async () => {});
    const c = renderPanel({ progress_hint: { canAdvance: true, willComplete: true, reason: null } }, { onProgressTournament: onProgress });
    expect(primary(c, 'Next Round')).toBeUndefined();
    act(() => { primary(c, 'Finish Tournament')!.click(); });
    const config = vi.mocked(modals.openConfirmModal).mock.calls[0][0];
    expect(config.title).toBe('Finish Tournament');
    expect(config.labels?.confirm).toBe('Finish Tournament');
    config.onConfirm?.();
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('is disabled with the reason shown while the round is unfinished', () => {
    const c = renderPanel({ progress_hint: { canAdvance: false, willComplete: false, reason: 'Round 1 is not complete yet' } });
    expect(primary(c, 'Next Round')!.disabled).toBe(true);
    expect(c.textContent).toContain('Round 1 is not complete yet');
  });

  it('stays clickable when the server sent no hint', () => {
    const c = renderPanel({});
    expect(primary(c, 'Next Round')!.disabled).toBe(false);
  });
});
