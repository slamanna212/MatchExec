import { describe, it, expect, vi, afterEach } from 'vitest';
import { callAnthropicVisionAPI } from '../../../../processes/stats-processor/modules/providers/anthropic';

describe('callAnthropicVisionAPI', () => {
  const API_KEY = 'test-api-key';
  const MODEL = 'claude-sonnet-4-6';
  const IMAGE_B64 = 'aGVsbG8=';
  const MIME = 'image/png';
  const PROMPT = 'Extract stats from this image.';

  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('calls the Anthropic messages endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '{"kills":5}' }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callAnthropicVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('anthropic.com');
  });

  it('passes x-api-key header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'result' }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callAnthropicVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    const [, options] = mockFetch.mock.calls[0];
    expect((options as RequestInit).headers).toMatchObject({ 'x-api-key': API_KEY });
  });

  it('sends the model in request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'result' }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callAnthropicVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.model).toBe(MODEL);
  });

  it('returns the text from first content item', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '{"kills":10}' }] }),
    }) as never;

    const result = await callAnthropicVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);
    expect(result).toBe('{"kills":10}');
  });

  it('returns empty string when content array is empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [] }),
    }) as never;

    const result = await callAnthropicVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);
    expect(result).toBe('');
  });

  it('throws when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }) as never;

    await expect(callAnthropicVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT))
      .rejects.toThrow('401');
  });

  it('throws with error body on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    }) as never;

    await expect(callAnthropicVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT))
      .rejects.toThrow('Rate limit exceeded');
  });

  it('propagates network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure')) as never;

    await expect(callAnthropicVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT))
      .rejects.toThrow('Network failure');
  });

  it('encodes image as base64 in request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callAnthropicVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    const imageContent = body.messages[0].content.find((c: { type: string }) => c.type === 'image');
    expect(imageContent?.source.data).toBe(IMAGE_B64);
    expect(imageContent?.source.media_type).toBe(MIME);
  });
});
