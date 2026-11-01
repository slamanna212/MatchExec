import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('../../../lib/db', () => ({ db: {} }));
vi.mock('../../../src/lib/games', () => ({
  findMapByIdOrName: vi.fn(),
  getGameDisplay: vi.fn().mockResolvedValue({ name: 'Mario Kart', color: null, icon_url: null }),
  getModeScoringType: vi.fn().mockResolvedValue('Position'),
}));

vi.mock('../../../src/lib/matches', () => ({
  getMatch: vi.fn().mockResolvedValue({ id: 'm1', game_id: 'mk', mode_id: 'mk-mode', team1_name: null, team2_name: null }),
  getMatchTeams: vi.fn().mockResolvedValue([
    { team_name: 'alice', team_order: 0, voice_channel_id: null, is_reserve: false },
    { team_name: 'bob', team_order: 1, voice_channel_id: null, is_reserve: false },
  ]),
  getTeamAssignments: vi.fn(),
  listTeamsWithParticipants: vi.fn(),
}));
vi.mock('../../../src/lib/discord-messages', () => ({ getAnnouncementMessage: vi.fn() }));

import {
  resolveWinnerDisplayName,
  isTwoSidedResult,
  chunkLinesForFields,
  fetchMatchStartData,
} from '../../../processes/discord-bot/modules/announcement-helpers';

describe('resolveWinnerDisplayName', () => {
  it('prefers an authoritative winning_team_name', () => {
    expect(resolveWinnerDisplayName('team1', 'Dragons', 'Alpha', 'Beta')).toBe('Dragons');
    expect(resolveWinnerDisplayName('team', 'Gold Team', 'Alpha', 'Beta')).toBe('Gold Team');
    expect(resolveWinnerDisplayName('participant', 'Speedy')).toBe('Speedy');
  });

  it('falls back to team names for empty or generic Blue/Red names', () => {
    expect(resolveWinnerDisplayName('team1', 'Blue Team', 'Alpha', 'Beta')).toBe('Alpha');
    expect(resolveWinnerDisplayName('team2', 'Red Team', 'Alpha', 'Beta')).toBe('Beta');
    expect(resolveWinnerDisplayName('team1', '', 'Alpha', 'Beta')).toBe('Alpha');
  });

  it('keeps the generic name when no team names exist', () => {
    expect(resolveWinnerDisplayName('team1', 'Blue Team')).toBe('Blue Team');
    expect(resolveWinnerDisplayName('tie', '')).toBe('Unknown');
  });
});

describe('isTwoSidedResult', () => {
  it('is true only for team1/team2/tie', () => {
    expect(isTwoSidedResult('team1')).toBe(true);
    expect(isTwoSidedResult('tie')).toBe(true);
    expect(isTwoSidedResult('team')).toBe(false);
    expect(isTwoSidedResult('participant')).toBe(false);
  });
});

describe('chunkLinesForFields', () => {
  it('keeps every chunk within the field limit', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `participant-number-${i}`);
    const chunks = chunkLinesForFields(lines);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1024);
    expect(chunks.join('\n').split('\n')).toHaveLength(200);
  });

  it('truncates a single overlong line', () => {
    const chunks = chunkLinesForFields(['x'.repeat(5000)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].length).toBe(1024);
  });
});

describe('fetchMatchStartData for FFA/Position', () => {
  it('does not expose the first two participants as team1/team2 names', async () => {
    const data = await fetchMatchStartData('m1', 'mk');
    expect(data.scoringType).toBe('Position');
    expect(data.team1Name).toBeUndefined();
    expect(data.team2Name).toBeUndefined();
  });
});
