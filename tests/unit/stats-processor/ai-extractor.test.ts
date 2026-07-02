import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('../../../src/lib/feed-helpers', () => ({
  logFeedEvent: vi.fn().mockResolvedValue(undefined),
}));

import { AIExtractor } from '../../../processes/stats-processor/modules/ai-extractor';
import type { GameStatDefinition } from '../../../shared/types';

function makeStatDef(name: string, displayName: string, statType = 'integer'): GameStatDefinition {
  return { id: `sd-${name}`, game_id: 'game-1', name, display_name: displayName, stat_type: statType, sort_order: 0, is_primary: true };
}

const OW_STATS: GameStatDefinition[] = [
  makeStatDef('kills', 'Kills'),
  makeStatDef('deaths', 'Deaths'),
  makeStatDef('assists', 'Assists'),
];

function makeValidResponse(players = [{ playerName: 'Alice', teamSide: 'blue', stats: { kills: 10, deaths: 2, assists: 5 }, confidence: 0.95 }]) {
  return JSON.stringify({
    players,
    mapName: 'Hanamura',
    gameResult: { team1Score: 2, team2Score: 1, winner: 'team1' },
  });
}

describe('AIExtractor', () => {
  const extractor = new AIExtractor({});

  describe('buildPrompt', () => {
    it('includes game name in prompt', () => {
      const prompt = extractor.buildPrompt(OW_STATS, 'Overwatch 2', 'blue');
      expect(prompt).toContain('Overwatch 2');
    });

    it('includes each stat definition name', () => {
      const prompt = extractor.buildPrompt(OW_STATS, 'Overwatch 2');
      expect(prompt).toContain('kills');
      expect(prompt).toContain('deaths');
      expect(prompt).toContain('assists');
    });

    it('includes stat display names', () => {
      const prompt = extractor.buildPrompt(OW_STATS, 'Overwatch 2');
      expect(prompt).toContain('Kills');
      expect(prompt).toContain('Deaths');
    });

    it('includes team side when provided', () => {
      const prompt = extractor.buildPrompt(OW_STATS, 'Overwatch 2', 'red');
      expect(prompt).toContain('red');
    });

    it('does not mention team side when not provided', () => {
      const prompt = extractor.buildPrompt(OW_STATS, 'Overwatch 2', undefined);
      expect(prompt).not.toContain('submitter is on the');
    });

    it('includes ai notes when provided', () => {
      const prompt = extractor.buildPrompt(OW_STATS, 'Overwatch 2', undefined, 'Look for hero icons');
      expect(prompt).toContain('Look for hero icons');
    });

    it('produces different prompts for different games', () => {
      const owStats = [makeStatDef('kills', 'Kills')];
      const csStats = [makeStatDef('adr', 'ADR')];
      const owPrompt = extractor.buildPrompt(owStats, 'Overwatch 2');
      const csPrompt = extractor.buildPrompt(csStats, 'Counter-Strike 2');
      expect(owPrompt).not.toBe(csPrompt);
      expect(owPrompt).toContain('Overwatch 2');
      expect(csPrompt).toContain('Counter-Strike 2');
    });

    it('requests JSON-only output', () => {
      const prompt = extractor.buildPrompt(OW_STATS, 'Overwatch 2');
      expect(prompt).toContain('JSON');
    });
  });

  describe('validateExtractionResponse', () => {
    it('returns null for valid response', () => {
      const result = extractor.validateExtractionResponse(makeValidResponse());
      expect(result).toBeNull();
    });

    it('returns error for invalid JSON', () => {
      const result = extractor.validateExtractionResponse('not json {{{');
      expect(result).toBe('invalid JSON');
    });

    it('returns error when players is missing', () => {
      const result = extractor.validateExtractionResponse(JSON.stringify({ mapName: 'X' }));
      expect(result).toBe('players is not an array');
    });

    it('returns error when players array is empty', () => {
      const result = extractor.validateExtractionResponse(JSON.stringify({ players: [] }));
      expect(result).toBe('players array is empty');
    });

    it('returns error when player missing playerName', () => {
      const response = JSON.stringify({
        players: [{ teamSide: 'blue', stats: { kills: 1 }, confidence: 0.9 }],
      });
      const result = extractor.validateExtractionResponse(response);
      expect(result).toBe('player missing playerName');
    });

    it('returns error when player missing stats', () => {
      const response = JSON.stringify({
        players: [{ playerName: 'Alice', teamSide: 'blue', confidence: 0.9 }],
      });
      const result = extractor.validateExtractionResponse(response);
      expect(result).toBe('player missing stats object');
    });

    it('returns error for non-numeric stat value', () => {
      const response = JSON.stringify({
        players: [{ playerName: 'Alice', teamSide: 'blue', stats: { kills: 'ten' }, confidence: 0.9 }],
      });
      const result = extractor.validateExtractionResponse(response);
      expect(result).toBe('non-numeric stat value');
    });

    it('returns error when confidence is missing', () => {
      const response = JSON.stringify({
        players: [{ playerName: 'Alice', teamSide: 'blue', stats: { kills: 5 } }],
      });
      const result = extractor.validateExtractionResponse(response);
      expect(result).toBe('missing confidence');
    });

    it('strips markdown fences before parsing', () => {
      const fenced = `\`\`\`json\n${  makeValidResponse()  }\n\`\`\``;
      const result = extractor.validateExtractionResponse(fenced);
      expect(result).toBeNull();
    });
  });

  describe('parseExtractionResult', () => {
    it('parses valid response into structured object', () => {
      const result = extractor.parseExtractionResult(makeValidResponse());
      expect(result.players).toHaveLength(1);
      expect(result.players[0].playerName).toBe('Alice');
      expect(result.players[0].stats.kills).toBe(10);
    });

    it('strips markdown code fences', () => {
      const fenced = `\`\`\`json\n${  makeValidResponse()  }\n\`\`\``;
      const result = extractor.parseExtractionResult(fenced);
      expect(result.players[0].playerName).toBe('Alice');
    });

    it('preserves mapName and gameResult', () => {
      const result = extractor.parseExtractionResult(makeValidResponse());
      expect(result.mapName).toBe('Hanamura');
      expect(result.gameResult?.winner).toBe('team1');
    });
  });

  describe('autoAssignParticipants', () => {
    it('assigns matching participant by normalized name', async () => {
      const mockDb = {
        all: vi.fn().mockResolvedValue([
          { id: 'participant-1', username: 'Alice' },
          { id: 'participant-2', username: 'Bob' },
        ]),
        run: vi.fn().mockResolvedValue(undefined),
      };
      const ext = new AIExtractor(mockDb);

      await ext.autoAssignParticipants('sub-1', 'match-1', [
        { playerName: 'alice', teamSide: 'blue', stats: { kills: 5 }, confidence: 0.9 },
      ]);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scorecard_player_stats'),
        expect.arrayContaining(['participant-1', 'sub-1', 'alice'])
      );
    });

    it('does not assign when confidence is too low', async () => {
      const mockDb = {
        all: vi.fn().mockResolvedValue([{ id: 'p-1', username: 'Alice' }]),
        run: vi.fn().mockResolvedValue(undefined),
      };
      const ext = new AIExtractor(mockDb);

      await ext.autoAssignParticipants('sub-1', 'match-1', [
        { playerName: 'alice', teamSide: 'blue', stats: {}, confidence: 0.5 },
      ]);

      expect(mockDb.run).not.toHaveBeenCalled();
    });

    it('does not assign when multiple participants share normalized name', async () => {
      const mockDb = {
        all: vi.fn().mockResolvedValue([
          { id: 'p-1', username: 'Alice' },
          { id: 'p-2', username: 'alice' },
        ]),
        run: vi.fn().mockResolvedValue(undefined),
      };
      const ext = new AIExtractor(mockDb);

      await ext.autoAssignParticipants('sub-1', 'match-1', [
        { playerName: 'alice', teamSide: 'blue', stats: {}, confidence: 0.95 },
      ]);

      expect(mockDb.run).not.toHaveBeenCalled();
    });

    it('does nothing when no participants exist', async () => {
      const mockDb = {
        all: vi.fn().mockResolvedValue([]),
        run: vi.fn(),
      };
      const ext = new AIExtractor(mockDb);

      await ext.autoAssignParticipants('sub-1', 'match-1', [
        { playerName: 'Alice', teamSide: 'blue', stats: {}, confidence: 0.95 },
      ]);

      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('resolveNormalTeamIds', () => {
    it('maps team_order 0 to blue and 1 to red', async () => {
      const mockDb = {
        all: vi.fn().mockResolvedValue([
          { id: 'mt_blue', team_order: 0 },
          { id: 'mt_red', team_order: 1 },
        ]),
      };
      const ext = new AIExtractor(mockDb) as unknown as { resolveNormalTeamIds(matchId: string): Promise<Record<string, string>> };

      const result = await ext.resolveNormalTeamIds('match-1');

      expect(result).toEqual({ blue: 'mt_blue', red: 'mt_red' });
    });

    it('returns an empty map when match_teams has not been created yet', async () => {
      const mockDb = { all: vi.fn().mockResolvedValue([]) };
      const ext = new AIExtractor(mockDb) as unknown as { resolveNormalTeamIds(matchId: string): Promise<Record<string, string>> };

      const result = await ext.resolveNormalTeamIds('match-1');

      expect(result).toEqual({});
    });
  });
});
