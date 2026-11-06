import { describe, it, expect } from 'vitest';
import {
  divisionNames, effectiveScoringConfig, filterByDivision, formatDiff, formatRecord, hasLeaguePoints, scopeOptions,
} from '@/components/series/series-standings-helpers';
import type { SeriesStageDto, SeriesStandingRow } from '@/shared/series-types';

const r = (key: string, rank: number, division: string | null): SeriesStandingRow => ({
  rank, entrant_id: key, key, name: key, division, total_points: 0, events_played: 0, events: [], username: key, user_id: key,
});

describe('series standings helpers', () => {
  it('scope options list the season then the stages in order', () => {
    const stage = (id: string, order: number): SeriesStageDto => ({
      id, series_id: 's', name: id, stage_order: order, status: 'upcoming', counts_toward_season: true, scoring_config: null, created_at: '', updated_at: '',
    });
    expect(scopeOptions([stage('b', 2), stage('a', 1)]).map((o) => o.value)).toEqual(['season', 'a', 'b']);
  });

  it('stage scoring overrides the series key by key', () => {
    expect(effectiveScoringConfig({ mode: 'head_to_head', win_points: 3 }, { win_points: 2, tie_points: 1 })).toEqual({ mode: 'head_to_head', win_points: 2, tie_points: 1 });
    expect(effectiveScoringConfig(null, undefined)).toEqual({});
  });

  it('league points need a non-zero win / loss / tie value', () => {
    expect(hasLeaguePoints({ mode: 'head_to_head' })).toBe(false);
    expect(hasLeaguePoints({ win_points: 0, loss_points: 0 })).toBe(false);
    expect(hasLeaguePoints({ tie_points: 1 })).toBe(true);
  });

  it('re-ranks rows inside a division, keeping ties', () => {
    const rows = [r('a', 1, 'X'), r('b', 2, 'Y'), r('c', 3, 'X'), r('d', 3, 'X')];
    expect(filterByDivision(rows, 'X').map((x) => [x.key, x.rank])).toEqual([['a', 1], ['c', 2], ['d', 2]]);
    expect(filterByDivision(rows, null)).toHaveLength(4);
  });

  it('division names come from the response, else from the rows', () => {
    expect(divisionNames(['B', 'A'], [])).toEqual(['A', 'B']);
    expect(divisionNames([], [r('a', 1, 'Z'), r('b', 2, null)])).toEqual(['Z']);
  });

  it('formats records and differences', () => {
    expect(formatRecord(3, 1, 0)).toBe('3-1-0');
    expect(formatRecord()).toBe('0-0-0');
    expect(formatDiff(4)).toBe('+4');
    expect(formatDiff(-2)).toBe('-2');
    expect(formatDiff(0)).toBe('0');
  });
});
