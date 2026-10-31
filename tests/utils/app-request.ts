import { app } from '../../src/server/app';

export interface AppResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
  response: Response;
}

/** Call the real Hono app in-process: `await appRequest('/api/health')`. JSON bodies are serialised automatically. */
export async function appRequest<T = any>(
  path: string,
  init: Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit | null } = {},
): Promise<AppResponse<T>> {
  const { json, headers, ...rest } = init;
  const h = new Headers(headers);
  const reqInit: RequestInit = { ...rest, headers: h };
  if (json !== undefined) {
    reqInit.body = JSON.stringify(json);
    if (!h.has('content-type')) h.set('content-type', 'application/json');
  }
  const response = await app.request(path, reqInit);
  const text = await response.text();
  let data: unknown = text;
  if (text) {
    try { data = JSON.parse(text); } catch { /* non-JSON body */ }
  } else {
    data = null;
  }
  return { status: response.status, headers: response.headers, data: data as T, response };
}
