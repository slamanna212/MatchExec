import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-response';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import {
  SESSION_COOKIE, createSessionToken, getSessionMaxAgeSeconds, isAuthEnabled, isSecureRequest, verifyPassword,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.json({ success: true, enabled: false });

  const limited = checkRateLimit(clientKey(request, 'login'), 10, 60_000);
  if (limited) return limited;

  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return apiError('Invalid request body', 400);
  }
  if (typeof password !== 'string' || !(await verifyPassword(password))) {
    return apiError('Invalid password', 401);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    maxAge: getSessionMaxAgeSeconds(),
  });
  return response;
}
