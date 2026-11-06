import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import type { SeriesStageDto, SeriesStandingRow, SeriesStandingsResponse } from '@/shared/series-types';

vi.mock('@/lib/logger/client', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/notifications', () => ({
  notificationHelper: { loading: vi.fn(), update: vi.fn() },
}));

import { SeriesStandingsPanel } from '@/components/series/series-standings-panel';

beforeEach(() => {
  window.matchMedia = window.matchMedia || ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const roots: Root[] = [];
const divs: HTMLDivElement[] = [];
afterEach(() => {
  act(() => { roots.forEach((r) => r.unmount()); });
  divs.forEach((d) => d.remove());
  roots.length = 0;
  divs.length = 0;
  vi.unstubAllGlobals();
});

const row = (key: string, name: string, rank: number, over: Partial<SeriesStandingRow> = {}): SeriesStandingRow => ({
  rank, entrant_id: key, key, name, tag: null, color: null, division: null, total_points: 0, events_played: 2, events: [],
  username: name, user_id: key, ...over,
});

const H2H: SeriesStandingsResponse = {
  series_id: 's1', series_name: 'Season', mode: 'head_to_head', scope: { type: 'season' }, view: 'entrant', events: [], divisions: ['Atlantic', 'Pacific'],
  rows: [
    row('a', 'Boston', 1, { tag: 'BOS', color: '#ff0000', division: 'Atlantic', total_points: 9, match_wins: 3, match_losses: 1, match_ties: 0, map_wins: 7, map_losses: 3, map_ties: 1, map_diff: 4 }),
    row('b', 'Seoul', 2, { division: 'Pacific', total_points: 6, match_wins: 2, match_losses: 2, match_ties: 0, map_wins: 5, map_losses: 6, map_ties: 0, map_diff: -1 }),
    row('c', 'Dallas', 3, { division: 'Atlantic', total_points: 0, match_wins: 0, match_losses: 4, match_ties: 0, map_wins: 1, map_losses: 8, map_ties: 0, map_diff: -7 }),
  ],
  standings: [],
};

const POINTS: SeriesStandingsResponse = {
  series_id: 's1', series_name: 'Season', mode: 'points', scope: { type: 'season' }, view: 'entrant', divisions: [],
  events: [
    { id: 'e1', name: 'Round 1', event_order: 1, stage_id: null },
    { id: 'e2', name: 'Round 2', event_order: 2, stage_id: null },
  ],
  rows: [
    row('a', 'Max', 1, {
      total_points: 25, event_wins: 1, podiums: 2,
      events: [{ series_event_id: 'e1', points: 25 }, { series_event_id: 'e2', points: 4, dropped: true }],
    }),
    row('b', 'Lando', 2, { total_points: 18, event_wins: 0, podiums: 1, events: [{ series_event_id: 'e1', points: 18 }, { series_event_id: 'e2', points: null }] }),
  ],
  standings: [],
};

function stubStandings(responses: Record<string, SeriesStandingsResponse>) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url);
    const key = /view=individual/.test(url) ? 'individual' : (/scope=([^&]+)/.exec(url)?.[1] ?? 'season');
    const body = responses[key] ?? responses.season;
    return { ok: true, status: 200, json: async () => body };
  }));
  return urls;
}

async function renderPanel(props: Partial<React.ComponentProps<typeof SeriesStandingsPanel>> = {}): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  divs.push(container);
  await act(async () => {
    const root = createRoot(container);
    roots.push(root);
    root.render(
      <MantineProvider env="test">
        <SeriesStandingsPanel series={{ id: 's1', entrant_type: 'team', scoring_config: { mode: 'head_to_head' } }} stages={[]} {...props} />
      </MantineProvider>,
    );
  });
  await act(async () => { await Promise.resolve(); });
  return container;
}

describe('SeriesStandingsPanel', () => {
  it('renders the head-to-head table: record, maps and diff, no Pts column without league points', async () => {
    stubStandings({ season: H2H });
    const c = await renderPanel();
    expect(c.textContent).toContain('W-L-T');
    expect(c.textContent).toContain('Boston');
    expect(c.textContent).toContain('BOS');
    expect(c.textContent).toContain('3-1-0');
    expect(c.textContent).toContain('7-3-1');
    expect(c.textContent).toContain('+4');
    expect(c.textContent).toContain('-7');
    expect(c.textContent).not.toContain('Pts');
  });

  it('shows the Pts column when league points are configured', async () => {
    stubStandings({ season: H2H });
    const c = await renderPanel({ series: { id: 's1', entrant_type: 'team', scoring_config: { mode: 'head_to_head', win_points: 3, tie_points: 1 } } });
    expect(c.textContent).toContain('Pts');
    expect(c.textContent).toContain('League points: 3 per win');
  });

  it('renders the points table with per-event columns, wins and podiums', async () => {
    stubStandings({ season: POINTS });
    const c = await renderPanel({ series: { id: 's1', entrant_type: 'solo', scoring_config: { mode: 'points' } } });
    expect(c.textContent).toContain('#1');
    expect(c.textContent).toContain('#2');
    expect(c.textContent).toContain('Wins');
    expect(c.textContent).toContain('Podiums');
    expect(c.textContent).toContain('Total');
    expect(c.textContent).toContain('25');
    expect(c.textContent).toContain('18');
    // an entrant that did not take part shows a dash
    expect(c.textContent).toContain('—');
  });

  it('greys out and strikes through dropped event points', async () => {
    stubStandings({ season: POINTS });
    const c = await renderPanel({ series: { id: 's1', entrant_type: 'solo', scoring_config: { mode: 'points', drop_worst: 1 } } });
    const dropped = c.querySelectorAll('[data-dropped="true"]');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].textContent).toBe('4');
    expect((dropped[0] as HTMLElement).className).toMatch(/mantine-Text-root/);
    expect(c.textContent).toContain('worst result is dropped');
  });

  it('only offers the Entrants / Individual toggle for team series and loads the individual view', async () => {
    const urls = stubStandings({ season: H2H, individual: { ...H2H, view: 'individual' } });
    const c = await renderPanel();
    expect(c.textContent).toContain('Individual');
    const individual = Array.from(c.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find((i) => i.value === 'individual')!;
    await act(async () => { individual.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(urls.some((u) => u.includes('view=individual'))).toBe(true);

    stubStandings({ season: POINTS });
    const solo = await renderPanel({ series: { id: 's2', entrant_type: 'solo', scoring_config: { mode: 'points' } } });
    expect(solo.textContent).not.toContain('Individual');
  });

  it('shows a scope selector with the stages and requests the chosen stage', async () => {
    const urls = stubStandings({ season: H2H });
    const stages: SeriesStageDto[] = [{
      id: 'st1', series_id: 's1', name: 'Stage 1', stage_order: 1, status: 'complete', counts_toward_season: true, scoring_config: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }];
    const c = await renderPanel({ stages });
    expect(urls[0]).toContain('scope=season');
    const select = c.querySelector<HTMLInputElement>('input[aria-label="Standings scope"]')!;
    expect(select.value).toBe('Season');
    await act(async () => { select.click(); });
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((o) => o.textContent === 'Stage 1')!;
    await act(async () => { option.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(urls.some((u) => u.includes('scope=st1'))).toBe(true);
  });

  it('filters by division and re-ranks inside it', async () => {
    stubStandings({ season: H2H });
    const c = await renderPanel();
    expect(c.textContent).toContain('Seoul');
    const select = c.querySelector<HTMLInputElement>('input[aria-label="Division"]')!;
    await act(async () => { select.click(); });
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((o) => o.textContent === 'Atlantic')!;
    await act(async () => { option.click(); });
    expect(c.textContent).toContain('Boston');
    expect(c.textContent).toContain('Dallas');
    expect(c.textContent).not.toContain('Seoul');
  });

  it('shows an empty state without standings', async () => {
    stubStandings({ season: { ...H2H, rows: [], standings: [] } });
    const c = await renderPanel();
    expect(c.textContent).toContain('No standings yet');
  });

  it('shows the server error when the standings fail to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })));
    const c = await renderPanel();
    expect(c.textContent).toContain('boom');
  });
});
