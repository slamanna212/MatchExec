import { describe, it, expect, vi, afterEach } from 'vitest';
import { callGoogleVisionAPI } from '../../../../processes/stats-processor/modules/providers/google';

describe('callGoogleVisionAPI', () => {
  const API_KEY = 'google-test-key';
  const MODEL = 'gemini-1.5-flash';
  const IMAGE_B64 = 'dGVzdA==';
  const MIME = 'image/jpeg';
  const PROMPT = 'Extract player stats.';

  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('calls the Google Generative Language endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'result' }] } }],
      }),
    });
    globalThis.fetch = mockFetch as never;

    await callGoogleVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('googleapis.com');
  });

  it('includes the API key in the request URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callGoogleVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(API_KEY);
  });

  it('includes model in the URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callGoogleVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(MODEL);
  });

  it('returns the text from the first candidate part', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"assists":3}' }] } }] }),
    }) as never;

    const result = await callGoogleVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);
    expect(result).toBe('{"assists":3}');
  });

  it('returns empty string when candidates array is empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [] }),
    }) as never;

    const result = await callGoogleVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);
    expect(result).toBe('');
  });

  it('throws on non-ok HTTP response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    }) as never;

    await expect(callGoogleVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT))
      .rejects.toThrow('403');
  });

  it('propagates network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never;

    await expect(callGoogleVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT))
      .rejects.toThrow('ECONNREFUSED');
  });

  it('sends image data in request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    });
    globalThis.fetch = mockFetch as never;

    await callGoogleVisionAPI(API_KEY, MODEL, IMAGE_B64, MIME, PROMPT);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    const imagePart = body.contents[0].parts.find(
      (p: { inlineData?: { data: string } }) => p.inlineData
    );
    expect(imagePart?.inlineData?.data).toBe(IMAGE_B64);
  });
});
