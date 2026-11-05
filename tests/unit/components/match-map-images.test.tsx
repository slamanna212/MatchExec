import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { existsSync } from 'node:fs';
import path from 'node:path';
import csMaps from '../../../data/games/counterstrike2/maps.json';

vi.mock('@mantine/modals', () => ({ modals: { openConfirmModal: vi.fn() } }));
vi.mock('@/components/stats/StatsVisualization', () => ({ StatsVisualization: () => null }));

import MatchPage from '@/client/pages/matches/[matchId]/page';
import HistoryMatchPage from '@/client/pages/matches/history/[matchId]/page';

type MapRow = { id: string; name: string; imageUrl: string; modeName: string; modeId?: string };
type Scenario = {
  name: string;
  gameId: string;
  supportsAllModes: boolean;
  maps: MapRow[];
  modes: { id: string; name: string }[];
  selected: { id: string; name: string; imageUrl: string }[];
};

// Reproduce the API's deduplicated CS2 rows, which use the first mode ID
// alphabetically. Use shipped image paths so filename/extension changes stay covered.
const csSelected = [
  ['train-premier', 'train'], ['nuke-premier', 'nuke'], ['office-premier', 'office'],
  ['italy-normal', 'italy'], ['shoots-premier', 'shoots'],
  ['pool-day-premier-1793626179409-o4v9debkg', 'pool-day'],
].map(([id, base]) => {
  const map = csMaps.find(row => row.id === base)!;
  return { id, name: map.name, imageUrl: map.thumbnailUrl.replace(/^\/public\//, '/') };
});
const scenarios: Scenario[] = [
  {
    name: 'CS2 tournament match: hyphenated modes, map names, and repeated-map IDs',
    gameId: 'counterstrike2', supportsAllModes: true,
    maps: csSelected.map(map => ({ ...map, id: `${csMaps.find(row => row.name === map.name)!.id}-arms-race`, modeId: 'arms-race', modeName: 'All Modes' })),
    modes: [{ id: 'arms-race', name: 'Arms Race' }, { id: 'premier', name: 'Premier' }, { id: 'normal', name: 'Normal' }],
    selected: csSelected,
  },
  {
    name: 'all-mode map listed under a different mode',
    gameId: 'fortnite', supportsAllModes: true,
    maps: [{ id: 'battleisland-nobuild', name: 'Battle Island', imageUrl: '/assets/battle-island.webp', modeName: 'All Modes' }],
    modes: [{ id: 'nobuild', name: 'No Build' }, { id: 'standard', name: 'Standard' }],
    selected: [{ id: 'battleisland-standard', name: 'Battle Island', imageUrl: '/assets/battle-island.webp' }],
  },
  {
    name: 'mode-specific map keeps its own image',
    gameId: 'valorant', supportsAllModes: false,
    maps: [
      { id: 'ascent-normal', name: 'Ascent', imageUrl: '/assets/ascent-normal.jpg', modeName: 'Normal' },
      { id: 'ascent-premier', name: 'Ascent Premier', imageUrl: '/assets/ascent-premier.webp', modeName: 'Premier' },
    ],
    modes: [],
    selected: [{ id: 'ascent-premier', name: 'Ascent Premier', imageUrl: '/assets/ascent-premier.webp' }],
  },
];

let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  localStorage.removeItem('match_tab_regression-match');
  vi.unstubAllGlobals();
});

// Exercise real page fetching, lookup, layout, and image components together.
// Only HTTP is stubbed; mocking the lookup/layout would miss the original regression.
describe.each([
  { name: 'active match details', Page: MatchPage, route: '/matches/:matchId', url: '/matches/regression-match', status: 'assign' },
  { name: 'match history', Page: HistoryMatchPage, route: '/matches/history/:matchId', url: '/matches/history/regression-match', status: 'complete' },
])('$name map images', ({ Page, route, url, status }) => {
  it.each(scenarios)('$name', async scenario => {
    const responses: Record<string, unknown> = {
      '/api/matches/regression-match': {
        id: 'regression-match', name: 'Squad E vs Squad F', game_id: scenario.gameId,
        game_name: scenario.gameId, status, maps: scenario.selected.map(map => map.id),
        tournament_id: 'tournament-1', match_format: 'casual', rules: 'casual', rounds: scenario.selected.length,
        max_participants: 10, created_at: '2026-11-02T14:19:47Z', updated_at: '2026-11-02T14:19:47Z',
        player_notifications: false, stats_enabled: false, map_codes_supported: false,
      },
      '/api/matches/regression-match/participants': { participants: [], signupConfig: null },
      '/api/matches/regression-match/reminders': { reminders: [] },
      '/api/matches/regression-match/map-notes': { notes: {} },
      '/api/matches/regression-match/games': { games: [] },
      '/api/settings/ui': { refreshInterval: 3600 },
      [`/api/games/${scenario.gameId}`]: { supportsAllModes: scenario.supportsAllModes },
      [`/api/games/${scenario.gameId}/maps`]: scenario.maps,
      [`/api/games/${scenario.gameId}/modes`]: scenario.modes,
    };
    vi.stubGlobal('fetch', vi.fn(async (input: string) => ({
      ok: input in responses, status: input in responses ? 200 : 404,
      json: async () => responses[input] ?? {},
    })));
    localStorage.setItem('match_tab_regression-match', 'maps');
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container);
      root.render(<MantineProvider env="test"><MemoryRouter initialEntries={[url]}>
        <Routes><Route path={route} element={<Page />} /></Routes>
      </MemoryRouter></MantineProvider>);
    });
    for (const map of scenario.selected) {
      const image = Array.from(container.querySelectorAll('img')).find(img => img.alt === map.name);
      expect(image, `Missing rendered map: ${map.id}`).toBeDefined();
      expect(image?.getAttribute('src'), `Wrong image for ${map.id}`).toBe(map.imageUrl);
    }
  });
});

it('ships every image used by the reported CS2 match', () => {
  for (const map of csSelected) {
    expect(existsSync(path.join(process.cwd(), 'public', map.imageUrl)), map.imageUrl).toBe(true);
  }
});
