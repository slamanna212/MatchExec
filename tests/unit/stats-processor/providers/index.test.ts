import { describe, it, expect } from 'vitest';
import { AI_PROVIDER_CALLS } from '../../../../processes/stats-processor/modules/providers/index';
import { callAnthropicVisionAPI } from '../../../../processes/stats-processor/modules/providers/anthropic';
import { callGoogleVisionAPI } from '../../../../processes/stats-processor/modules/providers/google';
import { callOpenRouterVisionAPI } from '../../../../processes/stats-processor/modules/providers/openrouter';

describe('AI_PROVIDER_CALLS', () => {
  it('exports an anthropic entry', () => {
    expect(AI_PROVIDER_CALLS).toHaveProperty('anthropic');
  });

  it('exports a google entry', () => {
    expect(AI_PROVIDER_CALLS).toHaveProperty('google');
  });

  it('exports an openrouter entry', () => {
    expect(AI_PROVIDER_CALLS).toHaveProperty('openrouter');
  });

  it('anthropic entry is the callAnthropicVisionAPI function', () => {
    expect(AI_PROVIDER_CALLS.anthropic).toBe(callAnthropicVisionAPI);
  });

  it('google entry is the callGoogleVisionAPI function', () => {
    expect(AI_PROVIDER_CALLS.google).toBe(callGoogleVisionAPI);
  });

  it('openrouter entry is the callOpenRouterVisionAPI function', () => {
    expect(AI_PROVIDER_CALLS.openrouter).toBe(callOpenRouterVisionAPI);
  });

  it('has exactly three providers', () => {
    expect(Object.keys(AI_PROVIDER_CALLS)).toHaveLength(3);
  });

  it('all values are functions', () => {
    for (const fn of Object.values(AI_PROVIDER_CALLS)) {
      expect(typeof fn).toBe('function');
    }
  });
});
