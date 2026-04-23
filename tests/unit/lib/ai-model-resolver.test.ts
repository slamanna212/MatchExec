import { describe, it, expect } from 'vitest';
import { resolveModelId } from '../../../src/lib/ai-model-resolver';

describe('resolveModelId', () => {
  it('resolves anthropic sonnet', () => {
    const result = resolveModelId('anthropic', 'sonnet');
    expect(result).toBe('claude-sonnet-4-6');
  });

  it('resolves anthropic haiku', () => {
    const result = resolveModelId('anthropic', 'haiku');
    expect(result).toBe('claude-haiku-4-5-20251001');
  });

  it('resolves google pro', () => {
    const result = resolveModelId('google', 'pro');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('resolves google flash', () => {
    const result = resolveModelId('google', 'flash');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('resolves openrouter models', () => {
    const nano = resolveModelId('openrouter', 'nano');
    expect(typeof nano).toBe('string');
  });

  it('falls back to abstractModel when provider not found', () => {
    const result = resolveModelId('unknown-provider', 'gpt-4');
    expect(result).toBe('gpt-4');
  });

  it('falls back to abstractModel when model not found in provider', () => {
    const result = resolveModelId('anthropic', 'nonexistent-model');
    expect(result).toBe('nonexistent-model');
  });

  it('handles empty abstractModel', () => {
    const result = resolveModelId('anthropic', '');
    expect(result).toBe('');
  });
});
