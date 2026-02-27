import { NextRequest } from 'next/server';

// Helper to create mock NextRequest for API route testing
export function createMockRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): NextRequest {
  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && method !== 'GET') {
    requestInit.body = JSON.stringify(body);
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), requestInit as any);
}

// Helper to parse API response
export async function parseResponse<T = any>(response: Response): Promise<{ status: number; data: T }> {
  const data = await response.json();
  return {
    status: response.status,
    data,
  };
}

// Helper for route params - generic to support typed params
export function createRouteParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
