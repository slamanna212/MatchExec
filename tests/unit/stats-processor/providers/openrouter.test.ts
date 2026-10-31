import { describe, it, expect, vi, afterEach } from 'vitest';
import { callOpenRouterVisionAPI } from '../../../../processes/stats-processor/modules/providers/openrouter';

describe('callOpenRouterVisionAPI', () => {
  const API_KEY = 'openrouter-test-key';
  const MODEL = 'openai/gpt-4o';
  const IMAGE_B64 = 'dGVzdA==';
  const MIME = 'image/jpeg';
  const PROMPT = 'Extract player stats.';

  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('calls the OpenRouter chat completions endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'result' } }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callOpenRouterVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('openrouter.ai');
  });

  it('sends Bearer authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callOpenRouterVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    const [, options] = mockFetch.mock.calls[0];
    expect((options as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${API_KEY}`,
    });
  });

  it('sends model in request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callOpenRouterVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.model).toBe(MODEL);
  });

  it('returns content from first choice message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"kills":7}' } }] }),
    }) as never;

    const result = await callOpenRouterVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);
    expect(result).toBe('{"kills":7}');
  });

  it('returns empty string when choices array is empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    }) as never;

    const result = await callOpenRouterVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);
    expect(result).toBe('');
  });

  it('throws on non-ok HTTP response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    }) as never;

    await expect(callOpenRouterVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT))
      .rejects.toThrow('429');
  });

  it('includes error body in thrown error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }) as never;

    await expect(callOpenRouterVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT))
      .rejects.toThrow('Unauthorized');
  });

  it('propagates network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET')) as never;

    await expect(callOpenRouterVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT))
      .rejects.toThrow('ECONNRESET');
  });

  it('embeds image as data URL in request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callOpenRouterVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    const imageContent = body.messages[0].content.find(
      (c: { type: string }) => c.type === 'image_url'
    );
    expect(imageContent?.image_url?.url).toBe(`data:${MIME};base64,${IMAGE_B64}`);
  });

  it('forwards AbortSignal to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    globalThis.fetch = mockFetch as never;

    const controller = new AbortController();
    await callOpenRouterVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT, controller.signal);

    const [, options] = mockFetch.mock.calls[0];
    expect((options as RequestInit).signal).toBe(controller.signal);
  });
});
