// @vitest-environment node
/** Fortnite is a battle royale: its team modes are multi-team (numbered squads), never a fixed Red vs Blue pair. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface ModeJson { id: string; scoringType?: string; maxTeams?: number }
const modes = JSON.parse(readFileSync(path.join(process.cwd(), 'data/games/fortnite/modes.json'), 'utf8')) as ModeJson[];

describe('data/games/fortnite/modes.json', () => {
  it('lets Standard and No Build run with many numbered teams', () => {
    for (const id of ['standard', 'nobuild']) {
      const mode = modes.find((m) => m.id === id)!;
      expect(mode.scoringType).toBe('Normal');
      expect(mode.maxTeams).toBeGreaterThan(2);
      expect(mode.maxTeams).toBeLessThanOrEqual(16); // the match team-count clamp
    }
  });

  it('keeps Solo as free-for-all', () => {
    expect(modes.find((m) => m.id === 'solo')?.scoringType).toBe('FFA');
  });
});
